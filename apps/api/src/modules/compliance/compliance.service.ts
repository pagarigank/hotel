import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service.js';
import type {
  GdprExportDto,
  GdprEraseDto,
} from '@innkeeper/contracts';
import crypto from 'node:crypto';

@Injectable()
export class ComplianceService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  // ==========================================================================
  // 1. AUTOMATED PERSONAL DATA EXPORT (REQ-GST-004)
  // ==========================================================================
  async exportGuestData(
    tenantId: string,
    guestId: string,
    userId?: string,
  ): Promise<GdprExportDto> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      // 1. Fetch Guest Profile
      const guestRes = await client.query(
        `SELECT * FROM guests WHERE id = $1 AND tenant_id = $2`,
        [guestId, tenantId],
      );
      if (guestRes.rows.length === 0) {
        throw new NotFoundException(`Guest with ID ${guestId} not found`);
      }
      const guest = guestRes.rows[0];

      // 2. Fetch Identifications (Mask encrypted blobs for safe portable export)
      const idRes = await client.query(
        `SELECT id, id_type, issuing_country, expiry_date, verified_at, created_at
         FROM guest_identifications
         WHERE guest_id = $1 AND tenant_id = $2`,
        [guestId, tenantId],
      );

      // 3. Fetch Preferences
      const prefRes = await client.query(
        `SELECT id, category, preference, created_at
         FROM guest_prefs
         WHERE guest_id = $1 AND tenant_id = $2`,
        [guestId, tenantId],
      );

      // 4. Fetch Reservations
      const rsvRes = await client.query(
        `SELECT r.id, r.reservation_no, r.status, r.created_at,
                ru.check_in, ru.check_out, ru.adults, ru.children
         FROM reservations r
         LEFT JOIN reservation_units ru ON ru.reservation_id = r.id
         WHERE r.guest_id = $1 AND r.tenant_id = $2
         ORDER BY r.created_at DESC`,
        [guestId, tenantId],
      );

      // 5. Fetch Stays
      const stayRes = await client.query(
        `SELECT s.id, s.status, s.actual_check_in, s.expected_check_out, s.actual_check_out,
                u.number as unit_number, b.name as branch_name
         FROM stays s
         JOIN units u ON u.id = s.unit_id
         JOIN branches b ON b.id = s.branch_id
         WHERE s.guest_id = $1 AND s.tenant_id = $2
         ORDER BY s.created_at DESC`,
        [guestId, tenantId],
      );

      // 6. Fetch Folios & Lines
      const folioRes = await client.query(
        `SELECT f.id, f.folio_no, f.status, f.currency, f.total_charges, f.total_payments,
                f.balance as current_balance, f.updated_at as closed_at, f.created_at
         FROM folios f
         LEFT JOIN stays s ON s.id = f.stay_id
         LEFT JOIN reservations r ON r.id = f.reservation_id
         WHERE f.tenant_id = $1 AND (s.guest_id = $2 OR r.guest_id = $2)
         ORDER BY f.created_at DESC`,
        [tenantId, guestId],
      );

      // 7. Write immutable audit log
      const logId = crypto.randomUUID();
      await client.query(
        `INSERT INTO privacy_audit_logs (
          id, tenant_id, guest_id, action, reason, performed_by, details
        ) VALUES ($1, $2, $3, 'data_export', 'Subject Access Request (SAR)', $4, $5)`,
        [
          logId,
          tenantId,
          guestId,
          userId || null,
          JSON.stringify({
            exportedTables: ['guests', 'guest_identifications', 'guest_prefs', 'reservations', 'stays', 'folios'],
            recordCounts: {
              identifications: idRes.rows.length,
              preferences: prefRes.rows.length,
              reservations: rsvRes.rows.length,
              stays: stayRes.rows.length,
              folios: folioRes.rows.length,
            },
          }),
        ],
      );

      return {
        guestId: guest.id,
        personalInfo: {
          id: guest.id,
          firstName: guest.first_name,
          lastName: guest.last_name,
          email: guest.email,
          phone: guest.phone,
          birthDate: guest.birth_date ? new Date(guest.birth_date).toISOString().split('T')[0] : null,
          nationality: guest.nationality,
          vipStatus: guest.vip_status,
          notes: guest.notes,
          isPseudonymized: guest.is_pseudonymized,
          createdAt: new Date(guest.created_at).toISOString(),
        },
        identifications: idRes.rows.map((r: any) => ({
          id: r.id,
          idType: r.id_type,
          issuingCountry: r.issuing_country,
          expiryDate: r.expiry_date,
          verifiedAt: r.verified_at,
        })),
        preferences: prefRes.rows.map((r: any) => ({
          id: r.id,
          category: r.category,
          preference: r.preference,
        })),
        reservations: rsvRes.rows.map((r: any) => ({
          id: r.id,
          reservationNo: r.reservation_no,
          status: r.status,
          checkInDate: r.check_in ? (r.check_in instanceof Date ? r.check_in.toISOString().split('T')[0] : String(r.check_in)) : null,
          checkOutDate: r.check_out ? (r.check_out instanceof Date ? r.check_out.toISOString().split('T')[0] : String(r.check_out)) : null,
          adults: r.adults || 1,
          children: r.children || 0,
        })),
        stays: stayRes.rows.map((r: any) => ({
          id: r.id,
          status: r.status,
          unitNumber: r.unit_number,
          branchName: r.branch_name,
          checkIn: r.actual_check_in,
          checkOut: r.actual_check_out || r.expected_check_out,
        })),
        folios: folioRes.rows.map((r: any) => ({
          id: r.id,
          folioNo: r.folio_no,
          status: r.status,
          currency: r.currency,
          totalCharges: Number(r.total_charges),
          totalPayments: Number(r.total_payments),
          currentBalance: Number(r.current_balance),
          closedAt: r.closed_at,
        })),
        exportedAt: new Date().toISOString(),
      };
    });
  }

  // ==========================================================================
  // 2. PSEUDONYMIZED RIGHT-TO-ERASURE (REQ-GST-004 & TAX AUDIT HARMONIZATION)
  // ==========================================================================
  async eraseGuestData(
    tenantId: string,
    guestId: string,
    dto: GdprEraseDto,
    userId?: string,
  ): Promise<{ success: boolean; pseudonymizedId: string; message: string }> {
    return this.db.withTenantTransaction(tenantId, undefined, async (client) => {
      // 1. Fetch guest
      const guestRes = await client.query(
        `SELECT * FROM guests WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [guestId, tenantId],
      );
      if (guestRes.rows.length === 0) {
        throw new NotFoundException(`Guest with ID ${guestId} not found`);
      }
      const guest = guestRes.rows[0];
      if (guest.is_pseudonymized) {
        return {
          success: true,
          pseudonymizedId: guest.last_name,
          message: 'Guest was already pseudonymized',
        };
      }

      // 2. Harmonization check: Verify no active open folios with outstanding balances
      const openFolioRes = await client.query(
        `SELECT f.id, f.folio_no, f.balance FROM folios f
         LEFT JOIN stays s ON s.id = f.stay_id
         LEFT JOIN reservations r ON r.id = f.reservation_id
         WHERE f.tenant_id = $1 AND (s.guest_id = $2 OR r.guest_id = $2)
           AND f.status = 'open' AND ABS(f.balance) > 0.01`,
        [tenantId, guestId],
      );
      if (openFolioRes.rows.length > 0) {
        throw new BadRequestException(
          `Cannot erase guest: ${openFolioRes.rows.length} open folio(s) have unsettled balances (e.g. Folio #${openFolioRes.rows[0].folio_no} balance ${openFolioRes.rows[0].balance}). Settle or write off balances prior to GDPR erasure.`,
        );
      }

      // 3. Generate salted pseudonym
      const salt = crypto.randomBytes(8).toString('hex');
      const hash = crypto.createHash('sha256').update(guestId + salt).digest('hex').slice(0, 12);
      const pseudonym = `DELETED_GUEST_${hash}`;

      // 4. Pseudonymize personal details in guests table
      await client.query(
        `UPDATE guests
         SET first_name = 'ERASED',
             last_name = $1,
             email = NULL,
             email_normalized = NULL,
             phone = NULL,
             phone_e164 = NULL,
             birth_date = NULL,
             nationality = NULL,
             notes = NULL,
             attrs = '{}'::jsonb,
             is_pseudonymized = true,
             updated_at = now(),
             updated_by = $2
         WHERE id = $3 AND tenant_id = $4`,
        [pseudonym, userId || null, guestId, tenantId],
      );

      // 5. Purge PII identification credentials & personal preferences
      await client.query(
        `DELETE FROM guest_identifications WHERE guest_id = $1 AND tenant_id = $2`,
        [guestId, tenantId],
      );
      await client.query(
        `DELETE FROM guest_prefs WHERE guest_id = $1 AND tenant_id = $2`,
        [guestId, tenantId],
      );
      await client.query(
        `UPDATE guest_consents SET is_granted = false WHERE guest_id = $1 AND tenant_id = $2`,
        [guestId, tenantId],
      );

      // 6. Write immutable privacy audit log
      const auditLogId = crypto.randomUUID();
      await client.query(
        `INSERT INTO privacy_audit_logs (
          id, tenant_id, guest_id, action, reason, performed_by, details
        ) VALUES ($1, $2, $3, 'pseudonymized_erasure', $4, $5, $6)`,
        [
          auditLogId,
          tenantId,
          guestId,
          dto.reason,
          userId || null,
          JSON.stringify({
            pseudonym,
            purgedAt: new Date().toISOString(),
            financialIntegrityNote: 'Financial ledgers, reservations, stays, and folios retained under legal tax compliance requirements',
          }),
        ],
      );

      return {
        success: true,
        pseudonymizedId: pseudonym,
        message: 'Guest personal data successfully pseudonymized in accordance with GDPR & Philippine DPA while retaining financial accounting ledger integrity',
      };
    });
  }

  // ==========================================================================
  // 3. PRIVACY AUDIT TRAIL
  // ==========================================================================
  async getAuditLogs(tenantId: string, guestId?: string): Promise<any[]> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      let sql = `SELECT * FROM privacy_audit_logs WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (guestId) {
        params.push(guestId);
        sql += ` AND guest_id = $${params.length}`;
      }
      sql += ` ORDER BY created_at DESC LIMIT 100`;

      const q = await client.query(sql, params);
      return q.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        guestId: r.guest_id,
        action: r.action,
        reason: r.reason,
        performedBy: r.performed_by,
        details: r.details,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    });
  }
}
