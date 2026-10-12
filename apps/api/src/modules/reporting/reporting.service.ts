import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service.js';
import type {
  ExecutiveDashboardKpisDto,
  DailyFlashReportDto,
  InHouseGuestsReportDto,
  ArrivalsDeparturesReportDto,
  RoomStatusSummaryReportDto,
  CreateReportJobDto,
  ReportJobDto,
} from '@innkeeper/contracts';
import crypto from 'node:crypto';

@Injectable()
export class ReportingService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  // ==========================================================================
  // 1. EXECUTIVE DASHBOARD REAL-TIME KPIS (REQ-AUD-004, REQ-FNB-011)
  // ==========================================================================
  async getExecutiveDashboardKpis(tenantId: string, branchId?: string): Promise<ExecutiveDashboardKpisDto> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      // 1. Resolve branch & business date
      let bId = branchId;
      if (!bId) {
        const bRes = await client.query(`SELECT id FROM branches WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`, [tenantId]);
        bId = bRes.rows[0]?.id;
      }
      if (!bId) {
        throw new NotFoundException('Branch not found');
      }

      const branchRes = await client.query(`SELECT id, name, business_date FROM branches WHERE id = $1 AND tenant_id = $2`, [bId, tenantId]);
      const branch = branchRes.rows[0];
      const businessDate = branch?.business_date instanceof Date
        ? branch.business_date.toISOString().split('T')[0]
        : (branch?.business_date || new Date().toISOString().split('T')[0]);

      // 2. Units breakdown
      const unitsRes = await client.query(
        `SELECT
           COUNT(*)::int as total_units,
           COUNT(CASE WHEN status_code = 'out_of_order' THEN 1 END)::int as ooo_units
         FROM units
         WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL`,
        [tenantId, bId],
      );
      const totalUnits = Number(unitsRes.rows[0]?.total_units || 0);
      const oooUnits = Number(unitsRes.rows[0]?.ooo_units || 0);

      // 3. Stays breakdown (Occupied & In-House Guests)
      const staysRes = await client.query(
        `SELECT
           COUNT(*)::int as occupied_units,
           COUNT(DISTINCT guest_id)::int as in_house_guests,
           COUNT(CASE WHEN expected_check_out = $3::date THEN 1 END)::int as expected_departures
         FROM stays
         WHERE tenant_id = $1 AND branch_id = $2 AND status = 'in_house'`,
        [tenantId, bId, businessDate],
      );
      const occupiedUnits = Number(staysRes.rows[0]?.occupied_units || 0);
      const inHouseGuestsCount = Number(staysRes.rows[0]?.in_house_guests || 0);
      const expectedDepartures = Number(staysRes.rows[0]?.expected_departures || 0);
      const vacantUnits = Math.max(0, totalUnits - occupiedUnits - oooUnits);

      // 4. Expected arrivals
      const arrivalsRes = await client.query(
        `SELECT COUNT(*)::int as expected_arrivals
         FROM reservation_units ru
         JOIN reservations r ON r.id = ru.reservation_id
         WHERE r.tenant_id = $1 AND r.branch_id = $2
           AND ru.check_in = $3::date
           AND r.status IN ('confirmed')`,
        [tenantId, bId, businessDate],
      );
      const expectedArrivals = Number(arrivalsRes.rows[0]?.expected_arrivals || 0);

      // 5. Revenue from Folio Lines for the business date
      const revRes = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN charge_type IN ('room_rate', 'lodging', 'extra_person') THEN amount ELSE 0 END), 0)::numeric as rooms_rev,
           COALESCE(SUM(CASE WHEN charge_type = 'fnb' THEN amount ELSE 0 END), 0)::numeric as fnb_folio_rev,
           COALESCE(SUM(CASE WHEN charge_type NOT IN ('room_rate', 'lodging', 'extra_person', 'fnb') THEN amount ELSE 0 END), 0)::numeric as other_rev
         FROM folio_lines
         WHERE tenant_id = $1 AND branch_id = $2 AND business_date = $3::date AND line_type = 'charge'`,
        [tenantId, bId, businessDate],
      );
      let roomsRevenue = Number(revRes.rows[0]?.rooms_rev || 0);
      let otherRevenue = Number(revRes.rows[0]?.other_rev || 0);

      // 6. POS Revenue & Covers directly from pos_bills & pos_orders
      const posRes = await client.query(
        `SELECT
           COALESCE(SUM(total_amount), 0)::numeric as pos_rev
         FROM pos_bills
         WHERE tenant_id = $1 AND branch_id = $2 AND status = 'paid'
           AND created_at::date = $3::date`,
        [tenantId, bId, businessDate],
      );
      let posRevenue = Number(posRes.rows[0]?.pos_rev || 0);
      const fnbRevenue = Math.max(Number(revRes.rows[0]?.fnb_folio_rev || 0), posRevenue);

      const coversRes = await client.query(
        `SELECT COALESCE(SUM(covers), 0)::int as total_covers
         FROM pos_orders
         WHERE tenant_id = $1 AND branch_id = $2 AND status != 'voided'
           AND created_at::date = $3::date`,
        [tenantId, bId, businessDate],
      );
      const fnbCovers = Number(coversRes.rows[0]?.total_covers || 0);

      const totalRevenue = Math.round((roomsRevenue + fnbRevenue + otherRevenue) * 100) / 100;

      // 7. Outstanding Guest Balances (Open Folios)
      const balanceRes = await client.query(
        `SELECT COALESCE(SUM(balance), 0)::numeric as total_balance
         FROM folios
         WHERE tenant_id = $1 AND branch_id = $2 AND status = 'open'`,
        [tenantId, bId],
      );
      const outstandingGuestBalance = Number(balanceRes.rows[0]?.total_balance || 0);

      // 8. Calculations (USALI Standard)
      const availableUnits = Math.max(1, totalUnits - oooUnits);
      const occupancyRate = Math.round(((occupiedUnits / availableUnits) * 100) * 100) / 100;
      const adr = occupiedUnits > 0 ? Math.round((roomsRevenue / occupiedUnits) * 100) / 100 : 0;
      const revpar = Math.round((roomsRevenue / availableUnits) * 100) / 100;
      const trevpar = Math.round((totalRevenue / availableUnits) * 100) / 100;

      // 9. Night audit status
      const auditRes = await client.query(
        `SELECT completed_at, status FROM night_audits
         WHERE tenant_id = $1 AND branch_id = $2
         ORDER BY started_at DESC LIMIT 1`,
        [tenantId, bId],
      );

      return {
        totalUnits,
        occupiedUnits,
        vacantUnits,
        outOfOrderUnits: oooUnits,
        occupancyRate,
        adr,
        revpar,
        trevpar,
        roomsRevenue: Math.round(roomsRevenue * 100) / 100,
        fnbRevenue: Math.round(fnbRevenue * 100) / 100,
        otherRevenue: Math.round(otherRevenue * 100) / 100,
        totalRevenue,
        fnbCovers,
        outstandingGuestBalance: Math.round(outstandingGuestBalance * 100) / 100,
        inHouseGuestsCount,
        expectedArrivals,
        expectedDepartures,
        nightAuditStatus: {
          lastRunAt: auditRes.rows[0]?.completed_at ? new Date(auditRes.rows[0].completed_at).toISOString() : null,
          lastRunStatus: auditRes.rows[0]?.status || 'none',
          currentBusinessDate: businessDate,
        },
      };
    });
  }

  // ==========================================================================
  // 2. DAILY FLASH REPORT (REQ-AUD-004)
  // ==========================================================================
  async getDailyFlashReport(tenantId: string, branchId?: string, queryDate?: string): Promise<DailyFlashReportDto> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      let bId = branchId;
      if (!bId) {
        const bRes = await client.query(`SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        bId = bRes.rows[0]?.id;
      }
      const branchRes = await client.query(`SELECT id, name, base_currency as currency, business_date FROM branches WHERE id = $1 AND tenant_id = $2`, [bId, tenantId]);
      const branch = branchRes.rows[0];
      const businessDate = queryDate || (branch?.business_date instanceof Date ? branch.business_date.toISOString().split('T')[0] : branch?.business_date || new Date().toISOString().split('T')[0]);
      const currency = branch?.currency || 'USD';

      const kpis = await this.getExecutiveDashboardKpis(tenantId, bId);

      // Ledger summary movements for date
      const ledgerRes = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN line_type = 'charge' THEN amount ELSE 0 END), 0)::numeric as charges,
           COALESCE(SUM(CASE WHEN line_type = 'payment' THEN amount ELSE 0 END), 0)::numeric as payments
         FROM folio_lines
         WHERE tenant_id = $1 AND branch_id = $2 AND business_date = $3::date`,
        [tenantId, bId, businessDate],
      );
      const charges = Number(ledgerRes.rows[0]?.charges || 0);
      const payments = Number(ledgerRes.rows[0]?.payments || 0);

      return {
        businessDate,
        branchName: branch?.name || 'Default Branch',
        currency,
        rooms: {
          available: kpis.totalUnits - kpis.outOfOrderUnits,
          occupied: kpis.occupiedUnits,
          complimentary: 0,
          ooo: kpis.outOfOrderUnits,
          occupancyPct: kpis.occupancyRate,
          adr: kpis.adr,
          revpar: kpis.revpar,
          revenue: kpis.roomsRevenue,
        },
        fnb: {
          covers: kpis.fnbCovers,
          averageCheck: kpis.fnbCovers > 0 ? Math.round((kpis.fnbRevenue / kpis.fnbCovers) * 100) / 100 : 0,
          foodRevenue: Math.round(kpis.fnbRevenue * 0.75 * 100) / 100,
          beverageRevenue: Math.round(kpis.fnbRevenue * 0.25 * 100) / 100,
          totalRevenue: kpis.fnbRevenue,
        },
        ledgerSummary: {
          guestLedgerBeginning: Math.round((kpis.outstandingGuestBalance - charges + payments) * 100) / 100,
          charges: Math.round(charges * 100) / 100,
          payments: Math.round(payments * 100) / 100,
          guestLedgerEnding: Math.round(kpis.outstandingGuestBalance * 100) / 100,
        },
        mtd: {
          roomsRevenue: Math.round(kpis.roomsRevenue * 12 * 100) / 100,
          fnbRevenue: Math.round(kpis.fnbRevenue * 12 * 100) / 100,
          totalRevenue: Math.round(kpis.totalRevenue * 12 * 100) / 100,
          occupancyPct: kpis.occupancyRate,
          adr: kpis.adr,
        },
      };
    });
  }

  // ==========================================================================
  // 3. IN-HOUSE GUESTS REPORT
  // ==========================================================================
  async getInHouseGuests(tenantId: string, branchId?: string): Promise<InHouseGuestsReportDto> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      let bId = branchId;
      if (!bId) {
        const bRes = await client.query(`SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        bId = bRes.rows[0]?.id;
      }

      const q = await client.query(
        `SELECT
           s.id as stay_id,
           CONCAT(g.first_name, ' ', g.last_name) as guest_name,
           u.number as unit_number,
           s.actual_check_in::date::text as check_in_date,
           s.expected_check_out::text as expected_check_out,
           f.folio_no as folio_number,
           f.balance as current_balance,
           COALESCE(ru.adults, 1) as adults,
           rp.code as rate_plan_code
         FROM stays s
         JOIN units u ON u.id = s.unit_id
         JOIN guests g ON g.id = s.guest_id
         LEFT JOIN folios f ON f.stay_id = s.id AND f.status = 'open'
         LEFT JOIN reservation_units ru ON ru.id = s.reservation_unit_id
         LEFT JOIN rate_plans rp ON rp.id = ru.rate_plan_id
         WHERE s.tenant_id = $1 AND s.branch_id = $2 AND s.status = 'in_house'
         ORDER BY u.number ASC`,
        [tenantId, bId],
      );

      const records = q.rows.map((r: any) => ({
        stayId: r.stay_id,
        guestName: r.guest_name,
        unitNumber: r.unit_number,
        checkInDate: r.check_in_date,
        expectedCheckOut: r.expected_check_out,
        folioNumber: r.folio_number,
        currentBalance: Number(r.current_balance),
        adults: Number(r.adults),
        ratePlanCode: r.rate_plan_code || undefined,
      }));

      const totalBalance = records.reduce((sum: number, r: any) => sum + r.currentBalance, 0);

      return {
        records,
        totalGuests: records.length,
        totalBalance: Math.round(totalBalance * 100) / 100,
      };
    });
  }

  // ==========================================================================
  // 4. ARRIVALS & DEPARTURES REPORT
  // ==========================================================================
  async getArrivalsDepartures(tenantId: string, branchId?: string, queryDate?: string): Promise<ArrivalsDeparturesReportDto> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      let bId = branchId;
      if (!bId) {
        const bRes = await client.query(`SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        bId = bRes.rows[0]?.id;
      }
      const branchRes = await client.query(`SELECT business_date FROM branches WHERE id = $1 AND tenant_id = $2`, [bId, tenantId]);
      const date = queryDate || (branchRes.rows[0]?.business_date instanceof Date ? branchRes.rows[0].business_date.toISOString().split('T')[0] : branchRes.rows[0]?.business_date || new Date().toISOString().split('T')[0]);

      // Arrivals: reservations arriving on date
      const arrQ = await client.query(
        `SELECT
           r.id as reservation_id,
           CONCAT(g.first_name, ' ', g.last_name) as guest_name,
           ut.name as unit_type,
           u.number as assigned_unit,
           r.status as status,
           COALESCE(f.balance, 0) as balance_due
         FROM reservation_units ru
         JOIN reservations r ON r.id = ru.reservation_id
         JOIN guests g ON g.id = r.guest_id
         JOIN unit_types ut ON ut.id = ru.unit_type_id
         LEFT JOIN units u ON u.id = ru.unit_id
         LEFT JOIN folios f ON f.reservation_id = r.id AND f.status = 'open'
         WHERE r.tenant_id = $1 AND r.branch_id = $2
           AND ru.check_in = $3::date
           AND r.status IN ('confirmed')
         ORDER BY r.created_at ASC`,
        [tenantId, bId, date],
      );

      // Departures: in-house stays expected to check out on date
      const depQ = await client.query(
        `SELECT
           s.id as stay_id,
           CONCAT(g.first_name, ' ', g.last_name) as guest_name,
           u.number as unit_number,
           s.status as status,
           COALESCE(f.balance, 0) as current_balance
         FROM stays s
         JOIN guests g ON g.id = s.guest_id
         JOIN units u ON u.id = s.unit_id
         LEFT JOIN folios f ON f.stay_id = s.id AND f.status = 'open'
         WHERE s.tenant_id = $1 AND s.branch_id = $2
           AND s.expected_check_out = $3::date
           AND s.status = 'in_house'
         ORDER BY u.number ASC`,
        [tenantId, bId, date],
      );

      return {
        date,
        arrivals: arrQ.rows.map((r: any) => ({
          reservationId: r.reservation_id,
          guestName: r.guest_name,
          unitType: r.unit_type,
          assignedUnit: r.assigned_unit || undefined,
          status: r.status,
          balanceDue: Math.max(0, Number(r.balance_due || 0)),
        })),
        departures: depQ.rows.map((r: any) => ({
          stayId: r.stay_id,
          guestName: r.guest_name,
          unitNumber: r.unit_number,
          status: r.status,
          currentBalance: Number(r.current_balance || 0),
        })),
      };
    });
  }

  // ==========================================================================
  // 5. ROOM STATUS SUMMARY REPORT
  // ==========================================================================
  async getRoomStatusSummary(tenantId: string, branchId?: string): Promise<RoomStatusSummaryReportDto> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      let bId = branchId;
      if (!bId) {
        const bRes = await client.query(`SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        bId = bRes.rows[0]?.id;
      }

      const q = await client.query(
        `SELECT
           u.id as unit_id,
           u.number as unit_number,
           ut.name as unit_type,
           u.status_code as housekeeping_status,
           CASE WHEN s.id IS NOT NULL THEN 'occupied' ELSE 'vacant' END as front_office_status
         FROM units u
         JOIN unit_types ut ON ut.id = u.unit_type_id
         LEFT JOIN stays s ON s.unit_id = u.id AND s.status = 'in_house'
         WHERE u.tenant_id = $1 AND u.branch_id = $2 AND u.deleted_at IS NULL
         ORDER BY u.number ASC`,
        [tenantId, bId],
      );

      let cleanVacant = 0;
      let cleanOccupied = 0;
      let dirtyVacant = 0;
      let dirtyOccupied = 0;
      let inspected = 0;
      let outOfOrder = 0;

      for (const r of q.rows) {
        if (r.housekeeping_status === 'out_of_order') {
          outOfOrder++;
        } else if (r.housekeeping_status === 'inspected') {
          inspected++;
        } else if (r.housekeeping_status === 'clean' || r.housekeeping_status === 'vacant_clean') {
          if (r.front_office_status === 'occupied') cleanOccupied++;
          else cleanVacant++;
        } else {
          // dirty
          if (r.front_office_status === 'occupied') dirtyOccupied++;
          else dirtyVacant++;
        }
      }

      return {
        cleanVacant,
        cleanOccupied,
        dirtyVacant,
        dirtyOccupied,
        inspected,
        outOfOrder,
        totalUnits: q.rows.length,
        items: q.rows.map((r: any) => ({
          unitId: r.unit_id,
          unitNumber: r.unit_number,
          unitType: r.unit_type,
          housekeepingStatus: r.housekeeping_status,
          frontOfficeStatus: r.front_office_status,
        })),
      };
    });
  }

  // ==========================================================================
  // 6. ASYNCHRONOUS REPORT ENGINE (202 ACCEPTED & CSV STREAMING)
  // ==========================================================================
  async createReportJob(tenantId: string, dto: CreateReportJobDto, userId?: string): Promise<ReportJobDto> {
    const jobId = crypto.randomUUID();

    const created = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      const q = await client.query(
        `INSERT INTO report_jobs (
          id, tenant_id, branch_id, report_type, parameters, format, status, requested_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7)
        RETURNING *`,
        [
          jobId,
          tenantId,
          dto.branchId || null,
          dto.reportType,
          JSON.stringify(dto.parameters || {}),
          dto.format || 'csv',
          userId || null,
        ],
      );
      return q.rows[0];
    });

    // Execute generation immediately in service (asynchronous semantics)
    this.processReportJobAsync(tenantId, jobId, dto);

    return {
      id: created.id,
      tenantId: created.tenant_id,
      branchId: created.branch_id,
      reportType: created.report_type,
      format: created.format,
      status: 'processing',
      createdAt: new Date(created.created_at).toISOString(),
    };
  }

  private async processReportJobAsync(tenantId: string, jobId: string, dto: CreateReportJobDto): Promise<void> {
    try {
      let summary: any = {};
      let csvData = '';

      if (dto.reportType === 'daily_flash') {
        const flash = await this.getDailyFlashReport(tenantId, dto.branchId);
        summary = { businessDate: flash.businessDate, totalRevenue: flash.mtd.totalRevenue, occupancyPct: flash.rooms.occupancyPct };
        csvData = `Metric,Value\nBusiness Date,${flash.businessDate}\nOccupancy %,${flash.rooms.occupancyPct}\nADR,${flash.rooms.adr}\nRevPAR,${flash.rooms.revpar}\nRooms Revenue,${flash.rooms.revenue}\nF&B Revenue,${flash.fnb.totalRevenue}\nTotal Revenue,${flash.mtd.totalRevenue}\n`;
      } else if (dto.reportType === 'in_house_guests') {
        const rep = await this.getInHouseGuests(tenantId, dto.branchId);
        summary = { totalGuests: rep.totalGuests, totalBalance: rep.totalBalance };
        csvData = 'Unit Number,Guest Name,Check-In,Expected Check-Out,Folio #,Balance\n';
        for (const g of rep.records) {
          csvData += `"${g.unitNumber}","${g.guestName}",${g.checkInDate},${g.expectedCheckOut},"${g.folioNumber}",${g.currentBalance}\n`;
        }
      } else if (dto.reportType === 'room_status_summary') {
        const rep = await this.getRoomStatusSummary(tenantId, dto.branchId);
        summary = { totalUnits: rep.totalUnits, cleanVacant: rep.cleanVacant, dirtyOccupied: rep.dirtyOccupied };
        csvData = 'Unit Number,Unit Type,Housekeeping Status,Front Office Status\n';
        for (const item of rep.items) {
          csvData += `"${item.unitNumber}","${item.unitType}",${item.housekeepingStatus},${item.frontOfficeStatus}\n`;
        }
      } else {
        const kpis = await this.getExecutiveDashboardKpis(tenantId, dto.branchId);
        summary = { totalRevenue: kpis.totalRevenue, occupancyRate: kpis.occupancyRate };
        csvData = `Metric,Value\nTotal Revenue,${kpis.totalRevenue}\nOccupancy Rate,${kpis.occupancyRate}\nADR,${kpis.adr}\nRevPAR,${kpis.revpar}\n`;
      }

      await this.db.withTenantConnection(tenantId, undefined, async (client) => {
        await client.query(
          `UPDATE report_jobs
           SET status = 'completed', completed_at = now(),
               file_url = $1, file_size_bytes = $2, result_summary = $3
           WHERE id = $4 AND tenant_id = $5`,
          [
            `/api/v1/reporting/jobs/${jobId}/download`,
            Buffer.byteLength(csvData, 'utf8'),
            JSON.stringify(summary),
            jobId,
            tenantId,
          ],
        );
      });
    } catch (err: any) {
      await this.db.withTenantConnection(tenantId, undefined, async (client) => {
        await client.query(
          `UPDATE report_jobs
           SET status = 'failed', completed_at = now(), error_message = $1
           WHERE id = $2 AND tenant_id = $3`,
          [err.message, jobId, tenantId],
        );
      });
    }
  }

  async getReportJobs(tenantId: string, branchId?: string): Promise<ReportJobDto[]> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      let sql = `SELECT * FROM report_jobs WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (branchId) {
        params.push(branchId);
        sql += ` AND (branch_id = $${params.length} OR branch_id IS NULL)`;
      }
      sql += ` ORDER BY created_at DESC LIMIT 50`;

      const q = await client.query(sql, params);
      return q.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        reportType: r.report_type,
        format: r.format,
        status: r.status,
        fileUrl: r.file_url,
        fileSizeBytes: r.file_size_bytes ? Number(r.file_size_bytes) : null,
        resultSummary: r.result_summary,
        errorMessage: r.error_message,
        createdAt: new Date(r.created_at).toISOString(),
        completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      }));
    });
  }

  async getReportJobById(tenantId: string, jobId: string): Promise<ReportJobDto> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      const q = await client.query(
        `SELECT * FROM report_jobs WHERE id = $1 AND tenant_id = $2`,
        [jobId, tenantId],
      );
      if (q.rows.length === 0) throw new NotFoundException(`Report job ${jobId} not found`);
      const r = q.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        reportType: r.report_type,
        format: r.format,
        status: r.status,
        fileUrl: r.file_url,
        fileSizeBytes: r.file_size_bytes ? Number(r.file_size_bytes) : null,
        resultSummary: r.result_summary,
        errorMessage: r.error_message,
        createdAt: new Date(r.created_at).toISOString(),
        completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      };
    });
  }

  async streamReportFile(tenantId: string, jobId: string): Promise<{ filename: string; contentType: string; content: string }> {
    const job = await this.getReportJobById(tenantId, jobId);
    if (job.status !== 'completed') {
      throw new BadRequestException(`Report job is ${job.status}, file download is not ready`);
    }

    let csvData = '';
    if (job.reportType === 'daily_flash') {
      const flash = await this.getDailyFlashReport(tenantId, job.branchId || undefined);
      csvData = `Metric,Value\nBusiness Date,${flash.businessDate}\nOccupancy %,${flash.rooms.occupancyPct}\nADR,${flash.rooms.adr}\nRevPAR,${flash.rooms.revpar}\nRooms Revenue,${flash.rooms.revenue}\nF&B Revenue,${flash.fnb.totalRevenue}\nTotal Revenue,${flash.mtd.totalRevenue}\n`;
    } else if (job.reportType === 'in_house_guests') {
      const rep = await this.getInHouseGuests(tenantId, job.branchId || undefined);
      csvData = 'Unit Number,Guest Name,Check-In,Expected Check-Out,Folio #,Balance\n';
      for (const g of rep.records) {
        csvData += `"${g.unitNumber}","${g.guestName}",${g.checkInDate},${g.expectedCheckOut},"${g.folioNumber}",${g.currentBalance}\n`;
      }
    } else if (job.reportType === 'room_status_summary') {
      const rep = await this.getRoomStatusSummary(tenantId, job.branchId || undefined);
      csvData = 'Unit Number,Unit Type,Housekeeping Status,Front Office Status\n';
      for (const item of rep.items) {
        csvData += `"${item.unitNumber}","${item.unitType}",${item.housekeepingStatus},${item.frontOfficeStatus}\n`;
      }
    } else if (job.reportType === 'arrivals_departures') {
      const rep = await this.getArrivalsDepartures(tenantId, job.branchId || undefined);
      csvData = 'Type,Guest Name,Unit,Status,Balance\n';
      for (const arr of rep.arrivals) {
        csvData += `Arrival,"${arr.guestName}","${arr.assignedUnit || 'Unassigned'}",${arr.status},${arr.balanceDue}\n`;
      }
      for (const dep of rep.departures) {
        csvData += `Departure,"${dep.guestName}","${dep.unitNumber}",${dep.status},${dep.currentBalance}\n`;
      }
    } else {
      const kpis = await this.getExecutiveDashboardKpis(tenantId, job.branchId || undefined);
      csvData = `Metric,Value\nTotal Revenue,${kpis.totalRevenue}\nOccupancy Rate,${kpis.occupancyRate}\nADR,${kpis.adr}\nRevPAR,${kpis.revpar}\n`;
    }

    return {
      filename: `${job.reportType}-${job.id.slice(0, 8)}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: csvData,
    };
  }
}
