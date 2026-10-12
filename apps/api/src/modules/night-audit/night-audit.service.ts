import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import pg from 'pg';
import crypto from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { EventsService } from '../properties/events.service.js';
import type {
  TriggerNightAuditDto,
  NightAuditDto,
  NightAuditStepDto,
  KpiSnapshotDto,
} from '@innkeeper/contracts';

import { AccountingService } from '../accounting/accounting.service.js';

const NIGHT_AUDIT_STEPS = [
  'pre_checks',
  'room_tax_posting',
  'fee_posting',
  'date_roll',
  'gl_vouchering',
  'kpi_snapshot',
] as const;

@Injectable()
export class NightAuditService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventsService) private readonly eventsService: EventsService,
    @Inject(AccountingService) private readonly accountingService: AccountingService,
  ) {}

  /**
   * Run or resume Night Audit State Machine
   */
  async runNightAudit(
    tenantId: string,
    branchId: string,
    dto: TriggerNightAuditDto,
    userId?: string,
  ): Promise<NightAuditDto> {
    return this.db.transaction(tenantId, async (client) => {
      // 1. Fetch branch & current business date
      const branchRes = await client.query(
        `SELECT * FROM branches WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [branchId, tenantId],
      );
      if (branchRes.rows.length === 0) {
        throw new NotFoundException(`Branch ${branchId} not found`);
      }
      const branch = branchRes.rows[0];
      const businessDate = branch.business_date instanceof Date
        ? branch.business_date.toISOString().split('T')[0]
        : String(branch.business_date);

      // 2. Find or create parent Night Audit record
      let auditRes = await client.query(
        `SELECT * FROM night_audits
         WHERE branch_id = $1 AND tenant_id = $2 AND business_date = $3
         FOR UPDATE`,
        [branchId, tenantId, businessDate],
      );

      let auditId: string;
      if (auditRes.rows.length === 0) {
        auditId = crypto.randomUUID();
        auditRes = await client.query(
          `INSERT INTO night_audits (
            id, tenant_id, branch_id, business_date, status, run_by
          ) VALUES ($1, $2, $3, $4, 'running', $5)
          RETURNING *`,
          [auditId, tenantId, branchId, businessDate, userId || '10000000-0000-0000-0000-000000000001'],
        );
      } else {
        const audit = auditRes.rows[0];
        if (audit.status === 'completed' && !dto.force) {
          throw new ConflictException(
            `Night audit for business date ${businessDate} has already completed successfully`,
          );
        }
        auditId = audit.id;
        await client.query(
          `UPDATE night_audits SET status = 'running', error_message = NULL WHERE id = $1`,
          [auditId],
        );
      }

      // 3. Execute State Machine Steps in sequence
      for (const stepName of NIGHT_AUDIT_STEPS) {
        // Check if step was already completed in a prior run
        const stepRes = await client.query(
          `SELECT * FROM night_audit_steps
           WHERE night_audit_id = $1 AND tenant_id = $2 AND step_name = $3`,
          [auditId, tenantId, stepName],
        );

        if (stepRes.rows.length > 0 && stepRes.rows[0].status === 'completed' && !dto.force) {
          continue; // Step checkpoint satisfied, resume next step
        }

        const stepId = stepRes.rows[0]?.id || crypto.randomUUID();
        if (stepRes.rows.length === 0) {
          await client.query(
            `INSERT INTO night_audit_steps (
              id, tenant_id, night_audit_id, step_name, status, started_at
            ) VALUES ($1, $2, $3, $4, 'running', now())`,
            [stepId, tenantId, auditId, stepName],
          );
        } else {
          await client.query(
            `UPDATE night_audit_steps SET status = 'running', started_at = now() WHERE id = $1`,
            [stepId],
          );
        }

        try {
          const recordsProcessed = await this.executeStep(
            tenantId,
            branchId,
            businessDate,
            stepName,
            client,
            auditId,
          );

          await client.query(
            `UPDATE night_audit_steps
             SET status = 'completed', records_processed = $1, completed_at = now()
             WHERE id = $2`,
            [recordsProcessed, stepId],
          );
        } catch (err: any) {
          await client.query(
            `UPDATE night_audit_steps
             SET status = 'failed', error_details = $1, completed_at = now()
             WHERE id = $2`,
            [err.message || 'Unknown step failure', stepId],
          );

          await client.query(
            `UPDATE night_audits
             SET status = 'failed', failed_at_step = $1, error_message = $2
             WHERE id = $3`,
            [stepName, err.message, auditId],
          );

          throw new BadRequestException(`Night Audit failed at step '${stepName}': ${err.message}`);
        }
      }

      // 4. Mark Night Audit completed
      const completedAuditRes = await client.query(
        `UPDATE night_audits
         SET status = 'completed', completed_at = now()
         WHERE id = $1
         RETURNING *`,
        [auditId],
      );

      // 5. Emit event
      this.eventsService.broadcast(
        tenantId,
        'innkeeper.night_audit.completed',
        {
          auditId,
          branchId,
          businessDate,
        },
        branchId,
      );

      return this.getNightAuditStatus(tenantId, branchId, client);
    });
  }

  /**
   * Execute single state machine step
   */
  private async executeStep(
    tenantId: string,
    branchId: string,
    businessDate: string,
    stepName: string,
    client: pg.PoolClient,
    auditId?: string,
  ): Promise<number> {
    switch (stepName) {
      case 'pre_checks': {
        // Verify due-in arrivals: warn or count
        const unassignedRes = await client.query(
          `SELECT count(*)::int as count
           FROM reservation_units
           WHERE branch_id = $1 AND tenant_id = $2
             AND check_in = $3 AND status = 'confirmed'`,
          [branchId, tenantId, businessDate],
        );
        return unassignedRes.rows[0].count;
      }

      case 'room_tax_posting': {
        // Query all active in-house stays
        const staysRes = await client.query(
          `SELECT s.id as stay_id, s.unit_id, s.reservation_id,
                  COALESCE(ut.base_rate, 150) as base_rate, f.id as folio_id, f.currency
           FROM stays s
           JOIN units u ON u.id = s.unit_id
           JOIN unit_types ut ON ut.id = u.unit_type_id
           LEFT JOIN folios f ON f.stay_id = s.id AND f.kind = 'guest'
           WHERE s.branch_id = $1 AND s.tenant_id = $2 AND s.status = 'in_house'`,
          [branchId, tenantId],
        );

        let postedCount = 0;
        for (const stay of staysRes.rows) {
          if (!stay.folio_id) continue;

          const roomRate = Number(stay.base_rate || 150);
          const taxRate = roomRate * 0.17; // 12% VAT + 5% Lodging

          // 1. Post room charge (Idempotent via unique constraint)
          const roomLineId = crypto.randomUUID();
          const insertRoomRes = await client.query(
            `INSERT INTO folio_lines (
              id, tenant_id, branch_id, folio_id, stay_id, window_no,
              business_date, line_type, charge_type, description,
              qty, unit_amount, amount, tax_amount
            ) VALUES ($1, $2, $3, $4, $5, 1, $6, 'charge', 'room', 'Nightly Room Charge', 1, $7, $7, $8)
            ON CONFLICT (tenant_id, branch_id, stay_id, business_date, charge_type)
            WHERE charge_type IN ('room','night_tax')
            DO NOTHING
            RETURNING id`,
            [roomLineId, tenantId, branchId, stay.folio_id, stay.stay_id, businessDate, roomRate, taxRate],
          );

          // 2. Post tax charge (Idempotent)
          const taxLineId = crypto.randomUUID();
          const insertTaxRes = await client.query(
            `INSERT INTO folio_lines (
              id, tenant_id, branch_id, folio_id, stay_id, window_no,
              business_date, line_type, charge_type, description,
              qty, unit_amount, amount, tax_amount
            ) VALUES ($1, $2, $3, $4, $5, 1, $6, 'charge', 'night_tax', 'Lodging Taxes & Fees', 1, $7, $7, 0)
            ON CONFLICT (tenant_id, branch_id, stay_id, business_date, charge_type)
            WHERE charge_type IN ('room','night_tax')
            DO NOTHING
            RETURNING id`,
            [taxLineId, tenantId, branchId, stay.folio_id, stay.stay_id, businessDate, taxRate],
          );

          if (insertRoomRes.rows.length > 0) {
            postedCount++;
            // Update folio totals
            const totalPosted = roomRate + taxRate;
            await client.query(
              `UPDATE folios
               SET total_charges = total_charges + $1,
                   balance = balance + $1,
                   version = version + 1
               WHERE id = $2`,
              [totalPosted, stay.folio_id],
            );
          }
        }
        return postedCount;
      }

      case 'fee_posting': {
        // Daily recurring fees (if any configured)
        return 0;
      }

      case 'date_roll': {
        // Close current business date record
        await client.query(
          `UPDATE business_dates
           SET status = 'closed', closed_at = now()
           WHERE branch_id = $1 AND tenant_id = $2 AND business_date = $3`,
          [branchId, tenantId, businessDate],
        );

        // Calculate next date
        const nextDateRes = await client.query(
          `SELECT ($1::date + interval '1 day')::date as next_date`,
          [businessDate],
        );
        const nextDate = nextDateRes.rows[0].next_date.toISOString().split('T')[0];

        // Insert new business_dates record
        await client.query(
          `INSERT INTO business_dates (
            id, tenant_id, branch_id, business_date, opened_at, status
          ) VALUES ($1, $2, $3, $4, now(), 'open')
          ON CONFLICT (tenant_id, branch_id, business_date) DO UPDATE
          SET status = 'open'`,
          [crypto.randomUUID(), tenantId, branchId, nextDate],
        );

        // Update branch business_date
        await client.query(
          `UPDATE branches
           SET business_date = $1, updated_at = now()
           WHERE id = $2 AND tenant_id = $3`,
          [nextDate, branchId, tenantId],
        );

        return 1;
      }

      case 'gl_vouchering': {
        // Aggregate room revenue and tax for the business date and generate balanced GL vouchers
        const summaryRes = await client.query(
          `SELECT
             COALESCE(sum(amount) FILTER (WHERE charge_type = 'room'), 0)::numeric as room_rev,
             COALESCE(sum(amount) FILTER (WHERE charge_type = 'night_tax'), 0)::numeric as tax_amt
           FROM folio_lines
           WHERE branch_id = $1 AND tenant_id = $2 AND business_date = $3`,
          [branchId, tenantId, businessDate],
        );
        const roomRev = Number(summaryRes.rows[0]?.room_rev || 0);
        const taxAmt = Number(summaryRes.rows[0]?.tax_amt || 0);

        if (roomRev > 0) {
          try {
            await this.accountingService.postOperationalEvent(
              tenantId,
              branchId,
              'night_audit.room_tax',
              {
                date: businessDate,
                description: `Night Audit Room & Tax Posting (${businessDate})`,
                grossAmount: roomRev + taxAmt,
                netAmount: roomRev,
                taxAmount: taxAmt,
                sourceType: 'night_audit',
                sourceId: auditId || crypto.randomUUID(),
              },
              client,
            );
          } catch (err: any) {
            console.warn(`[NightAuditService] GL vouchering skipped: ${err.message}`);
          }
        }
        return 1;
      }

      case 'kpi_snapshot': {
        // Calculate daily occupancy, revenue, ADR, RevPAR
        const unitsRes = await client.query(
          `SELECT count(*)::int as total_units,
                  count(*) FILTER (WHERE status_code = 'occupied')::int as occupied_units,
                  count(*) FILTER (WHERE status_code = 'out_of_order')::int as ooo_units
           FROM units
           WHERE branch_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [branchId, tenantId],
        );
        const { total_units, occupied_units, ooo_units } = unitsRes.rows[0];

        const revRes = await client.query(
          `SELECT
             COALESCE(sum(amount) FILTER (WHERE charge_type = 'room'), 0)::numeric as room_rev,
             COALESCE(sum(amount) FILTER (WHERE charge_type = 'fnb'), 0)::numeric as fnb_rev,
             COALESCE(sum(amount) FILTER (WHERE charge_type NOT IN ('room','fnb','payment')), 0)::numeric as other_rev
           FROM folio_lines
           WHERE branch_id = $1 AND tenant_id = $2 AND business_date = $3`,
          [branchId, tenantId, businessDate],
        );
        const roomRev = Number(revRes.rows[0].room_rev || 0);
        const fnbRev = Number(revRes.rows[0].fnb_rev || 0);
        const otherRev = Number(revRes.rows[0].other_rev || 0);

        const occupancyRate = total_units > 0 ? (occupied_units / total_units) * 100 : 0;
        const adr = occupied_units > 0 ? roomRev / occupied_units : 0;
        const revpar = total_units > 0 ? roomRev / total_units : 0;

        await client.query(
          `INSERT INTO kpi_snapshots (
            id, tenant_id, branch_id, business_date,
            total_units, occupied_units, ooo_units, occupancy_rate,
            adr, revpar, trevpar, total_room_revenue, total_fnb_revenue, total_other_revenue
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (tenant_id, branch_id, business_date) DO UPDATE
          SET total_units = EXCLUDED.total_units,
              occupied_units = EXCLUDED.occupied_units,
              occupancy_rate = EXCLUDED.occupancy_rate,
              adr = EXCLUDED.adr,
              revpar = EXCLUDED.revpar,
              total_room_revenue = EXCLUDED.total_room_revenue`,
          [
            crypto.randomUUID(),
            tenantId,
            branchId,
            businessDate,
            total_units,
            occupied_units,
            ooo_units,
            occupancyRate,
            adr,
            revpar,
            revpar,
            roomRev,
            fnbRev,
            otherRev,
          ],
        );
        return 1;
      }

      default:
        return 0;
    }
  }

  /**
   * Get current Night Audit status for a branch
   */
  async getNightAuditStatus(
    tenantId: string,
    branchId: string,
    existingClient?: pg.PoolClient,
  ): Promise<NightAuditDto> {
    const runInClient = async (c: pg.PoolClient) => {
      const branchRes = await c.query(
        `SELECT business_date FROM branches WHERE id = $1 AND tenant_id = $2`,
        [branchId, tenantId],
      );
      if (branchRes.rows.length === 0) {
        throw new NotFoundException(`Branch ${branchId} not found`);
      }
      const businessDate = branchRes.rows[0].business_date instanceof Date
        ? branchRes.rows[0].business_date.toISOString().split('T')[0]
        : String(branchRes.rows[0].business_date);

      const auditRes = await c.query(
        `SELECT * FROM night_audits
         WHERE branch_id = $1 AND tenant_id = $2
         ORDER BY started_at DESC LIMIT 1`,
        [branchId, tenantId],
      );

      if (auditRes.rows.length === 0) {
        return {
          id: crypto.randomUUID(),
          tenantId,
          branchId,
          businessDate,
          status: 'pending' as const,
          startedAt: new Date().toISOString(),
          steps: NIGHT_AUDIT_STEPS.map((s) => ({
            stepKey: s,
            status: 'pending' as const,
          })),
        };
      }

      const audit = auditRes.rows[0];
      const stepsRes = await c.query(
        `SELECT * FROM night_audit_steps WHERE night_audit_id = $1 ORDER BY started_at ASC`,
        [audit.id],
      );

      const stepMap = new Map<string, any>(stepsRes.rows.map((r) => [r.step_name, r]));

      const steps: NightAuditStepDto[] = NIGHT_AUDIT_STEPS.map((stepKey) => {
        const found = stepMap.get(stepKey);
        if (!found) {
          return { stepKey, status: 'pending' as const };
        }
        return {
          id: found.id,
          stepKey,
          status: found.status as any,
          startedAt: found.started_at ? new Date(found.started_at).toISOString() : null,
          finishedAt: found.completed_at ? new Date(found.completed_at).toISOString() : null,
          errorMessage: found.error_details,
        };
      });

      return {
        id: audit.id,
        tenantId: audit.tenant_id,
        branchId: audit.branch_id,
        businessDate: audit.business_date instanceof Date ? audit.business_date.toISOString().split('T')[0] : String(audit.business_date),
        status: audit.status as 'completed' | 'pending' | 'in_progress' | 'failed',
        startedAt: new Date(audit.started_at).toISOString(),
        completedAt: audit.completed_at ? new Date(audit.completed_at).toISOString() : null,
        steps,
      };
    };

    if (existingClient) return runInClient(existingClient);
    return this.db.withTenantConnection(tenantId, undefined, runInClient);
  }

  /**
   * Get KPI Snapshots for branch
   */
  async getKpiSnapshots(tenantId: string, branchId: string): Promise<KpiSnapshotDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client: pg.PoolClient) => {
      return client.query(
        `SELECT * FROM kpi_snapshots
         WHERE branch_id = $1 AND tenant_id = $2
         ORDER BY business_date DESC LIMIT 30`,
        [branchId, tenantId],
      );
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      businessDate: r.business_date instanceof Date ? r.business_date.toISOString().split('T')[0] : String(r.business_date),
      totalRooms: Number(r.total_units || 0),
      roomsOccupied: Number(r.occupied_units || 0),
      occupancyRate: Number(r.occupancy_rate || 0),
      adr: Number(r.adr || 0),
      revpar: Number(r.revpar || 0),
      totalRevenue: Number(r.total_room_revenue || 0) + Number(r.total_fnb_revenue || 0) + Number(r.total_other_revenue || 0),
      roomRevenue: Number(r.total_room_revenue || 0),
      fnbRevenue: Number(r.total_fnb_revenue || 0),
      otherRevenue: Number(r.total_other_revenue || 0),
    }));
  }
}
