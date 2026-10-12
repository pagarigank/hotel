import { Injectable, Inject, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import pg from 'pg';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { UiService } from '../config/ui.service.js';
import type {
  GuestDto,
  CreateGuestDto,
  UpdateGuestDto,
  MergeGuestsDto,
  CompanyDto,
  CreateCompanyDto,
} from '@innkeeper/contracts';

@Injectable()
export class GuestsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(UiService) private readonly ui: UiService,
  ) {}

  /**
   * Search / List Guests
   */
  async getGuests(tenantId: string, search?: string): Promise<GuestDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      let query = `
        SELECT id, tenant_id AS "tenantId", first_name AS "firstName", last_name AS "lastName",
               email, email_normalized AS "emailNormalized", phone, phone_e164 AS "phoneE164",
               birth_date::text AS "birthDate", nationality, vip_status AS "vipStatus",
               notes, attrs, is_pseudonymized AS "isPseudonymized", merged_into_id AS "mergedIntoId",
               version, created_at AS "createdAt"
        FROM guests
        WHERE tenant_id = $1 AND merged_into_id IS NULL
      `;
      const params: any[] = [tenantId];

      if (search && search.trim()) {
        params.push(`%${search.trim().toLowerCase()}%`);
        query += ` AND (LOWER(first_name) LIKE $2 OR LOWER(last_name) LIKE $2 OR LOWER(email) LIKE $2 OR phone LIKE $2)`;
      }

      query += ` ORDER BY last_name ASC, first_name ASC LIMIT 100`;
      const res = await client.query(query, params);
      return res.rows;
    });
  }

  async getGuestById(tenantId: string, id: string): Promise<GuestDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id AS "tenantId", first_name AS "firstName", last_name AS "lastName",
                email, email_normalized AS "emailNormalized", phone, phone_e164 AS "phoneE164",
                birth_date::text AS "birthDate", nationality, vip_status AS "vipStatus",
                notes, attrs, is_pseudonymized AS "isPseudonymized", merged_into_id AS "mergedIntoId",
                version, created_at AS "createdAt"
         FROM guests
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException(`Guest with ID ${id} not found`);
      }
      return res.rows[0];
    });
  }

  /**
   * Create Guest with Deduplication Lookup (REQ-GST-002)
   */
  async createGuest(
    tenantId: string,
    dto: CreateGuestDto,
    userId?: string,
    existingClient?: pg.PoolClient,
  ): Promise<{ guest: GuestDto; isDuplicateMatch?: boolean }> {
    if (dto.attrs && Object.keys(dto.attrs).length > 0) {
      const validation = await this.ui.validateEntityAttrs(tenantId, 'guest', dto.attrs);
      if (!validation.success) {
        throw new BadRequestException({
          error: 'invalid_custom_fields',
          message: 'Guest attributes failed validation',
          details: validation.issues,
        });
      }
    }

    const runInClient = async (client: pg.PoolClient) => {
      const emailNormalized = dto.email ? dto.email.toLowerCase().trim() : null;
      const phoneE164 = dto.phone ? dto.phone.replace(/[^0-9+]/g, '') : null;

      // Duplicate match detection
      if (emailNormalized || phoneE164) {
        let matchSql = `
          SELECT id, tenant_id AS "tenantId", first_name AS "firstName", last_name AS "lastName",
                 email, email_normalized AS "emailNormalized", phone, phone_e164 AS "phoneE164",
                 birth_date::text AS "birthDate", nationality, vip_status AS "vipStatus",
                 notes, attrs, is_pseudonymized AS "isPseudonymized", merged_into_id AS "mergedIntoId",
                 version, created_at AS "createdAt"
          FROM guests
          WHERE tenant_id = $1 AND merged_into_id IS NULL AND (
        `;
        const conditions: string[] = [];
        const matchParams: any[] = [tenantId];

        if (emailNormalized) {
          matchParams.push(emailNormalized);
          conditions.push(`email_normalized = $${matchParams.length}`);
        }
        if (phoneE164) {
          matchParams.push(phoneE164);
          conditions.push(`phone_e164 = $${matchParams.length}`);
        }
        matchSql += conditions.join(' OR ') + ') LIMIT 1';

        const matchRes = await client.query(matchSql, matchParams);
        if (matchRes.rows.length > 0) {
          // Return matched profile without creating duplicate
          return { guest: matchRes.rows[0], isDuplicateMatch: true };
        }
      }

      const res = await client.query(
        `INSERT INTO guests (id, tenant_id, first_name, last_name, email, email_normalized, phone, phone_e164, birth_date, nationality, vip_status, notes, attrs, created_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id, tenant_id AS "tenantId", first_name AS "firstName", last_name AS "lastName",
                   email, email_normalized AS "emailNormalized", phone, phone_e164 AS "phoneE164",
                   birth_date::text AS "birthDate", nationality, vip_status AS "vipStatus",
                   notes, attrs, is_pseudonymized AS "isPseudonymized", merged_into_id AS "mergedIntoId",
                   version, created_at AS "createdAt"`,
        [
          tenantId,
          dto.firstName,
          dto.lastName,
          dto.email || null,
          emailNormalized,
          dto.phone || null,
          phoneE164,
          dto.birthDate || null,
          dto.nationality || null,
          dto.vipStatus || 'standard',
          dto.notes || null,
          JSON.stringify(dto.attrs || {}),
          userId || null,
        ],
      );

      return { guest: res.rows[0], isDuplicateMatch: false };
    };

    if (existingClient) {
      return runInClient(existingClient);
    }
    return this.db.transaction(tenantId, runInClient);
  }

  async updateGuest(tenantId: string, id: string, dto: UpdateGuestDto): Promise<GuestDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const emailNormalized = dto.email ? dto.email.toLowerCase().trim() : undefined;
      const phoneE164 = dto.phone ? dto.phone.replace(/[^0-9+]/g, '') : undefined;

      const res = await client.query(
        `UPDATE guests
         SET first_name = COALESCE($3, first_name),
             last_name = COALESCE($4, last_name),
             email = COALESCE($5, email),
             email_normalized = COALESCE($6, email_normalized),
             phone = COALESCE($7, phone),
             phone_e164 = COALESCE($8, phone_e164),
             nationality = COALESCE($9, nationality),
             vip_status = COALESCE($10, vip_status),
             notes = COALESCE($11, notes),
             version = version + 1,
             updated_at = now()
         WHERE tenant_id = $1 AND id = $2
         RETURNING id, tenant_id AS "tenantId", first_name AS "firstName", last_name AS "lastName",
                   email, email_normalized AS "emailNormalized", phone, phone_e164 AS "phoneE164",
                   birth_date::text AS "birthDate", nationality, vip_status AS "vipStatus",
                   notes, attrs, is_pseudonymized AS "isPseudonymized", merged_into_id AS "mergedIntoId",
                   version, created_at AS "createdAt"`,
        [
          tenantId,
          id,
          dto.firstName,
          dto.lastName,
          dto.email,
          emailNormalized,
          dto.phone,
          phoneE164,
          dto.nationality,
          dto.vipStatus,
          dto.notes,
        ],
      );

      if (res.rows.length === 0) {
        throw new NotFoundException(`Guest ${id} not found`);
      }
      return res.rows[0];
    });
  }

  /**
   * Manual Guest Merge Engine (REQ-GST-003)
   */
  async mergeGuests(
    tenantId: string,
    dto: MergeGuestsDto,
    userId: string,
  ): Promise<{ merged: boolean; targetGuestId: string }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      if (dto.sourceGuestId === dto.targetGuestId) {
        throw new BadRequestException('Source and target guest IDs must be different');
      }

      // Check both exist
      const sourceRes = await client.query(
        `SELECT * FROM guests WHERE tenant_id = $1 AND id = $2 AND merged_into_id IS NULL`,
        [tenantId, dto.sourceGuestId],
      );
      if (sourceRes.rows.length === 0) {
        throw new NotFoundException(`Source guest ${dto.sourceGuestId} not found or already merged`);
      }

      const targetRes = await client.query(
        `SELECT * FROM guests WHERE tenant_id = $1 AND id = $2 AND merged_into_id IS NULL`,
        [tenantId, dto.targetGuestId],
      );
      if (targetRes.rows.length === 0) {
        throw new NotFoundException(`Target guest ${dto.targetGuestId} not found`);
      }

      const sourceSnapshot = sourceRes.rows[0];

      // 1. Re-link reservations
      await client.query(
        `UPDATE reservations SET guest_id = $1 WHERE tenant_id = $2 AND guest_id = $3`,
        [dto.targetGuestId, tenantId, dto.sourceGuestId],
      );

      // 2. Mark source as merged
      await client.query(
        `UPDATE guests SET merged_into_id = $1, updated_at = now() WHERE tenant_id = $2 AND id = $3`,
        [dto.targetGuestId, tenantId, dto.sourceGuestId],
      );

      // 3. Insert into guest_merge_log
      await client.query(
        `INSERT INTO guest_merge_log (id, tenant_id, source_guest_id, target_guest_id, merged_by, reason, snapshot)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          dto.sourceGuestId,
          dto.targetGuestId,
          userId,
          dto.reason,
          JSON.stringify(sourceSnapshot),
        ],
      );

      return { merged: true, targetGuestId: dto.targetGuestId };
    });
  }

  /**
   * Companies
   */
  async getCompanies(tenantId: string): Promise<CompanyDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id AS "tenantId", name, tax_identifier AS "taxIdentifier",
                billing_email AS "billingEmail", phone, address, credit_limit::float AS "creditLimit",
                credit_terms_days AS "creditTermsDays", is_active AS "isActive", attrs,
                version, created_at AS "createdAt"
         FROM companies
         WHERE tenant_id = $1
         ORDER BY name ASC`,
        [tenantId],
      );
      return res.rows;
    });
  }

  async createCompany(tenantId: string, dto: CreateCompanyDto): Promise<CompanyDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `INSERT INTO companies (id, tenant_id, name, tax_identifier, billing_email, phone, address, credit_limit, credit_terms_days, is_active, attrs)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true, $9)
         RETURNING id, tenant_id AS "tenantId", name, tax_identifier AS "taxIdentifier",
                   billing_email AS "billingEmail", phone, address, credit_limit::float AS "creditLimit",
                   credit_terms_days AS "creditTermsDays", is_active AS "isActive", attrs,
                   version, created_at AS "createdAt"`,
        [
          tenantId,
          dto.name,
          dto.taxIdentifier || null,
          dto.billingEmail || null,
          dto.phone || null,
          JSON.stringify(dto.address || {}),
          dto.creditLimit || 0,
          dto.creditTermsDays || 30,
          JSON.stringify(dto.attrs || {}),
        ],
      );
      return res.rows[0];
    });
  }
}
