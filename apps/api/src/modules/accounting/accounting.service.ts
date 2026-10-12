import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import pg from 'pg';
import crypto from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { EventsService } from '../properties/events.service.js';
import type {
  AccountDto,
  CreateAccountDto,
  FiscalYearDto,
  FiscalPeriodDto,
  ClosePeriodDto,
  VoucherDto,
  CreateVoucherDto,
  ReverseVoucherDto,
  GlEntryDto,
  TrialBalanceReportDto,
  GeneralLedgerReportDto,
  UsaliPnlReportDto,
} from '@innkeeper/contracts';

function formatDateOnly(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.split('T')[0];
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(val);
}

@Injectable()
export class AccountingService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventsService) private readonly eventsService: EventsService,
  ) {}

  // ==========================================================================
  // 1. Chart of Accounts (CoA)
  // ==========================================================================

  async getAccounts(tenantId: string, accountClass?: string): Promise<AccountDto[]> {
    let sql = `SELECT * FROM accounts WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    if (accountClass) {
      params.push(accountClass);
      sql += ` AND account_class = $2`;
    }
    sql += ` ORDER BY code ASC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => this.mapAccountRow(r));
  }

  async getAccountById(tenantId: string, id: string): Promise<AccountDto> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(`SELECT * FROM accounts WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    });
    if (res.rows.length === 0) throw new NotFoundException(`Account ${id} not found`);
    return this.mapAccountRow(res.rows[0]);
  }

  async createAccount(tenantId: string, dto: CreateAccountDto): Promise<AccountDto> {
    const id = crypto.randomUUID();
    const res = await this.db.transaction(tenantId, async (client) => {
      const insert = await client.query(
        `INSERT INTO accounts (
          id, tenant_id, code, name, account_class, account_group,
          normal_balance, is_control_account, control_type, parent_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          id,
          tenantId,
          dto.code,
          dto.name,
          dto.accountClass,
          dto.accountGroup,
          dto.normalBalance,
          dto.isControlAccount ?? false,
          dto.controlType || null,
          dto.parentId || null,
        ],
      );
      return insert.rows[0];
    });
    return this.mapAccountRow(res);
  }

  // ==========================================================================
  // 2. Fiscal Calendar & Periods
  // ==========================================================================

  async getFiscalYears(tenantId: string): Promise<FiscalYearDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(`SELECT * FROM fiscal_years WHERE tenant_id = $1 ORDER BY start_date DESC`, [tenantId]);
    });
    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      name: r.name,
      startDate: formatDateOnly(r.start_date),
      endDate: formatDateOnly(r.end_date),
      status: r.status,
    }));
  }

  async getFiscalPeriods(tenantId: string, fiscalYearId?: string): Promise<FiscalPeriodDto[]> {
    let sql = `SELECT * FROM fiscal_periods WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    if (fiscalYearId) {
      params.push(fiscalYearId);
      sql += ` AND fiscal_year_id = $2`;
    }
    sql += ` ORDER BY start_date ASC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      fiscalYearId: r.fiscal_year_id,
      periodNo: r.period_no,
      name: r.name,
      startDate: formatDateOnly(r.start_date),
      endDate: formatDateOnly(r.end_date),
      status: r.status,
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    }));
  }

  async updatePeriodStatus(
    tenantId: string,
    periodId: string,
    dto: ClosePeriodDto,
    userId?: string,
  ): Promise<FiscalPeriodDto> {
    const res = await this.db.transaction(tenantId, async (client) => {
      const closedAt = dto.status === 'closed' || dto.status === 'soft_closed' ? new Date() : null;
      const closedBy = closedAt ? userId : null;

      const update = await client.query(
        `UPDATE fiscal_periods
         SET status = $1, closed_at = $2, closed_by = $3, updated_at = now()
         WHERE id = $4 AND tenant_id = $5
         RETURNING *`,
        [dto.status, closedAt, closedBy, periodId, tenantId],
      );
      if (update.rows.length === 0) throw new NotFoundException(`Fiscal period ${periodId} not found`);
      return update.rows[0];
    });

    return {
      id: res.id,
      tenantId: res.tenant_id,
      fiscalYearId: res.fiscal_year_id,
      periodNo: res.period_no,
      name: res.name,
      startDate: formatDateOnly(res.start_date),
      endDate: formatDateOnly(res.end_date),
      status: res.status,
      closedAt: res.closed_at ? new Date(res.closed_at).toISOString() : null,
    };
  }

  // ==========================================================================
  // 3. Vouchers & Double-Entry Postings
  // ==========================================================================

  async getVouchers(
    tenantId: string,
    filters?: { branchId?: string; status?: string; voucherType?: string; startDate?: string; endDate?: string },
  ): Promise<VoucherDto[]> {
    let sql = `
      SELECT v.*, fp.name as fiscal_period_name
      FROM vouchers v
      LEFT JOIN fiscal_periods fp ON fp.id = v.fiscal_period_id
      WHERE v.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (filters?.branchId) {
      params.push(filters.branchId);
      sql += ` AND v.branch_id = $${params.length}`;
    }
    if (filters?.status) {
      params.push(filters.status);
      sql += ` AND v.status = $${params.length}`;
    }
    if (filters?.voucherType) {
      params.push(filters.voucherType);
      sql += ` AND v.voucher_type = $${params.length}`;
    }
    if (filters?.startDate) {
      params.push(filters.startDate);
      sql += ` AND v.posting_date >= $${params.length}`;
    }
    if (filters?.endDate) {
      params.push(filters.endDate);
      sql += ` AND v.posting_date <= $${params.length}`;
    }

    sql += ` ORDER BY v.posting_date DESC, v.created_at DESC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => this.mapVoucherRow(r));
  }

  async getVoucherById(tenantId: string, id: string, existingClient?: pg.PoolClient): Promise<VoucherDto> {
    const run = async (client: pg.PoolClient) => {
      const vRes = await client.query(
        `SELECT v.*, fp.name as fiscal_period_name
         FROM vouchers v
         LEFT JOIN fiscal_periods fp ON fp.id = v.fiscal_period_id
         WHERE v.id = $1 AND v.tenant_id = $2`,
        [id, tenantId],
      );
      if (vRes.rows.length === 0) throw new NotFoundException(`Voucher ${id} not found`);

      const linesRes = await client.query(
        `SELECT vl.*, a.code as account_code, a.name as account_name
         FROM voucher_lines vl
         JOIN accounts a ON a.id = vl.account_id
         WHERE vl.voucher_id = $1 AND vl.tenant_id = $2
         ORDER BY vl.line_no ASC`,
        [id, tenantId],
      );

      const v = this.mapVoucherRow(vRes.rows[0]);
      v.lines = linesRes.rows.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        voucherId: l.voucher_id,
        lineNo: l.line_no,
        accountId: l.account_id,
        accountCode: l.account_code,
        accountName: l.account_name,
        description: l.description,
        debit: Number(l.debit),
        credit: Number(l.credit),
        currency: l.currency,
        partyType: l.party_type,
        partyId: l.party_id,
        createdAt: new Date(l.created_at).toISOString(),
      }));
      return v;
    };

    if (existingClient) {
      return run(existingClient);
    }
    return this.db.withTenantConnection(tenantId, undefined, run);
  }

  /**
   * Create Voucher (Draft or Auto-Post)
   * REQ-ACC-001, REQ-ACC-003, REQ-ACC-007
   */
  async createVoucher(
    tenantId: string,
    dto: CreateVoucherDto,
    userId: string,
    existingClient?: pg.PoolClient,
  ): Promise<VoucherDto> {
    const runInClient = async (client: pg.PoolClient) => {
      // 1. Resolve open fiscal period for posting date
      const periodRes = await client.query(
        `SELECT id, status FROM fiscal_periods
         WHERE tenant_id = $1 AND start_date <= $2 AND end_date >= $2
         LIMIT 1`,
        [tenantId, dto.postingDate],
      );
      if (periodRes.rows.length === 0) {
        throw new BadRequestException(`No fiscal period defined for posting date ${dto.postingDate}`);
      }
      const period = periodRes.rows[0];
      if (dto.autoPost && period.status !== 'open') {
        throw new BadRequestException(`Fiscal period is ${period.status}; only open periods accept posted vouchers`);
      }

      // 2. Validate line totals
      let totalDebit = 0;
      let totalCredit = 0;
      for (const line of dto.lines) {
        totalDebit += Number(line.debit || 0);
        totalCredit += Number(line.credit || 0);
      }
      totalDebit = Math.round(totalDebit * 10000) / 10000;
      totalCredit = Math.round(totalCredit * 10000) / 10000;

      if (dto.autoPost && Math.abs(totalDebit - totalCredit) > 0.0001) {
        throw new BadRequestException(`Voucher is unbalanced: total debit (${totalDebit}) != total credit (${totalCredit})`);
      }

      const voucherId = crypto.randomUUID();
      const status = dto.autoPost ? 'posted' : 'draft';

      // 3. Generate gapless voucher_no if posting
      let voucherNo: string | null = null;
      let postedAt: Date | null = null;
      let postedBy: string | null = null;

      if (dto.autoPost) {
        voucherNo = await this.generateNextVoucherNo(client, tenantId, dto.branchId, dto.voucherType, dto.postingDate);
        postedAt = new Date();
        postedBy = userId;
      }

      // 4. Insert Voucher Header
      await client.query(
        `INSERT INTO vouchers (
          id, tenant_id, branch_id, voucher_no, voucher_type, status,
          posting_date, fiscal_period_id, description, source_type, source_id,
          total_debit, total_credit, created_by, approved_by, posted_by, posted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          voucherId,
          tenantId,
          dto.branchId,
          voucherNo,
          dto.voucherType,
          status,
          dto.postingDate,
          period.id,
          dto.description,
          dto.sourceType || 'manual',
          dto.sourceId || null,
          totalDebit,
          totalCredit,
          userId,
          dto.autoPost ? userId : null,
          postedBy,
          postedAt,
        ],
      );

      // 5. Insert Voucher Lines
      let lineNo = 1;
      for (const l of dto.lines) {
        const lineId = crypto.randomUUID();
        await client.query(
          `INSERT INTO voucher_lines (
            id, tenant_id, voucher_id, line_no, account_id, description,
            debit, credit, currency, party_type, party_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            lineId,
            tenantId,
            voucherId,
            lineNo++,
            l.accountId,
            l.description || dto.description,
            l.debit || 0,
            l.credit || 0,
            l.currency || 'USD',
            l.partyType || null,
            l.partyId || null,
          ],
        );

        // 6. If posted, write immutable gl_entries & update gl_balances
        if (dto.autoPost && voucherNo) {
          const acctRes = await client.query(`SELECT code FROM accounts WHERE id = $1`, [l.accountId]);
          const accountCode = acctRes.rows[0]?.code || '0000';

          const glEntryId = crypto.randomUUID();
          await client.query(
            `INSERT INTO gl_entries (
              id, tenant_id, branch_id, voucher_id, voucher_line_id, voucher_no,
              voucher_type, posting_date, fiscal_period_id, account_id, account_code,
              debit, credit, description, party_type, party_id, source_type, source_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
            [
              glEntryId,
              tenantId,
              dto.branchId,
              voucherId,
              lineId,
              voucherNo,
              dto.voucherType,
              dto.postingDate,
              period.id,
              l.accountId,
              accountCode,
              l.debit || 0,
              l.credit || 0,
              l.description || dto.description,
              l.partyType || null,
              l.partyId || null,
              dto.sourceType || 'manual',
              dto.sourceId || null,
            ],
          );

          // Update gl_balances cache
          await this.updateGlBalance(
            client,
            tenantId,
            dto.branchId,
            l.accountId,
            period.id,
            Number(l.debit || 0),
            Number(l.credit || 0),
          );
        }
      }

      return this.getVoucherById(tenantId, voucherId, client);
    };

    if (existingClient) {
      return runInClient(existingClient);
    }
    return this.db.transaction(tenantId, runInClient);
  }

  /**
   * Post Draft Voucher
   */
  async postVoucher(tenantId: string, voucherId: string, userId: string): Promise<VoucherDto> {
    return this.db.transaction(tenantId, async (client) => {
      const vRes = await client.query(
        `SELECT * FROM vouchers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [voucherId, tenantId],
      );
      if (vRes.rows.length === 0) throw new NotFoundException(`Voucher ${voucherId} not found`);
      const voucher = vRes.rows[0];

      if (voucher.status === 'posted') {
        throw new BadRequestException(`Voucher ${voucherId} is already posted`);
      }
      if (voucher.status === 'cancelled') {
        throw new BadRequestException(`Cancelled voucher cannot be posted`);
      }

      // Check period status
      const periodRes = await client.query(
        `SELECT status FROM fiscal_periods WHERE id = $1 AND tenant_id = $2`,
        [voucher.fiscal_period_id, tenantId],
      );
      if (periodRes.rows.length === 0 || periodRes.rows[0].status !== 'open') {
        throw new BadRequestException(`Fiscal period is not open for postings`);
      }

      // Generate gapless voucher_no
      const voucherNo = await this.generateNextVoucherNo(
        client,
        tenantId,
        voucher.branch_id,
        voucher.voucher_type,
        formatDateOnly(voucher.posting_date),
      );

      // Update header
      await client.query(
        `UPDATE vouchers
         SET status = 'posted', voucher_no = $1, posted_by = $2, posted_at = now(), updated_at = now()
         WHERE id = $3`,
        [voucherNo, userId, voucherId],
      );

      // Insert GL entries for each line
      const linesRes = await client.query(
        `SELECT vl.*, a.code as account_code
         FROM voucher_lines vl
         JOIN accounts a ON a.id = vl.account_id
         WHERE vl.voucher_id = $1 AND vl.tenant_id = $2`,
        [voucherId, tenantId],
      );

      for (const line of linesRes.rows) {
        const glId = crypto.randomUUID();
        await client.query(
          `INSERT INTO gl_entries (
            id, tenant_id, branch_id, voucher_id, voucher_line_id, voucher_no,
            voucher_type, posting_date, fiscal_period_id, account_id, account_code,
            debit, credit, description, party_type, party_id, source_type, source_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            glId,
            tenantId,
            voucher.branch_id,
            voucherId,
            line.id,
            voucherNo,
            voucher.voucher_type,
            voucher.posting_date,
            voucher.fiscal_period_id,
            line.account_id,
            line.account_code,
            line.debit,
            line.credit,
            line.description,
            line.party_type,
            line.party_id,
            voucher.source_type,
            voucher.source_id,
          ],
        );

        await this.updateGlBalance(
          client,
          tenantId,
          voucher.branch_id,
          line.account_id,
          voucher.fiscal_period_id,
          Number(line.debit),
          Number(line.credit),
        );
      }

      return this.getVoucherById(tenantId, voucherId, client);
    });
  }

  /**
   * Reverse Posted Voucher (REQ-ACC-004)
   * Creates an opposing voucher with debit/credit swapped, links reversal_of/reversed_by,
   * and posts it with a distinct gapless voucher number.
   */
  async reverseVoucher(
    tenantId: string,
    voucherId: string,
    dto: ReverseVoucherDto,
    userId: string,
  ): Promise<VoucherDto> {
    return this.db.transaction(tenantId, async (client) => {
      const vRes = await client.query(
        `SELECT * FROM vouchers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [voucherId, tenantId],
      );
      if (vRes.rows.length === 0) throw new NotFoundException(`Voucher ${voucherId} not found`);
      const original = vRes.rows[0];

      if (original.status !== 'posted') {
        throw new BadRequestException(`Only posted vouchers can be reversed`);
      }
      if (original.reversed_by) {
        throw new BadRequestException(`Voucher ${original.voucher_no || voucherId} has already been reversed`);
      }

      const linesRes = await client.query(
        `SELECT * FROM voucher_lines WHERE voucher_id = $1 AND tenant_id = $2 ORDER BY line_no ASC`,
        [voucherId, tenantId],
      );

      const postingDate = dto.postingDate || formatDateOnly(original.posting_date);

      // Build inverted lines: swap debit and credit
      const invertedLines = linesRes.rows.map((l: any) => ({
        accountId: l.account_id,
        description: `Reversal of ${original.voucher_no || 'Voucher'}: ${dto.reason}`,
        debit: Number(l.credit), // swapped
        credit: Number(l.debit), // swapped
        currency: l.currency,
        partyType: l.party_type,
        partyId: l.party_id,
      }));

      // Create and post reversal voucher
      const reversal = await this.createVoucher(
        tenantId,
        {
          branchId: original.branch_id,
          voucherType: original.voucher_type,
          postingDate,
          description: `Reversal of ${original.voucher_no || 'Voucher'} (${dto.reason})`,
          sourceType: 'reversal',
          sourceId: original.id,
          lines: invertedLines,
          autoPost: true,
        },
        userId,
        client,
      );

      // Link reversal_of and reversed_by
      await client.query(
        `UPDATE vouchers SET reversed_by = $1, updated_at = now() WHERE id = $2`,
        [reversal.id, original.id],
      );
      await client.query(
        `UPDATE vouchers SET reversal_of = $1, updated_at = now() WHERE id = $2`,
        [original.id, reversal.id],
      );

      return this.getVoucherById(tenantId, reversal.id, client);
    });
  }

  // ==========================================================================
  // 4. Posting Engine (PostingService for Operational Events)
  // REQ-ACC-011: Automatically generates balanced vouchers for night audit, settlements, etc.
  // ==========================================================================

  async postOperationalEvent(
    tenantId: string,
    branchId: string,
    eventType: string,
    payload: {
      date: string;
      description: string;
      grossAmount: number;
      netAmount?: number;
      taxAmount?: number;
      sourceType: string;
      sourceId: string;
      partyType?: 'guest' | 'company' | 'supplier';
      partyId?: string;
    },
    client: pg.PoolClient,
  ): Promise<VoucherDto> {
    // 1. Find matching posting rule
    const ruleRes = await client.query(
      `SELECT * FROM posting_rules
       WHERE tenant_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
         AND event_type = $3 AND is_active = true
       ORDER BY priority DESC LIMIT 1`,
      [tenantId, branchId, eventType],
    );

    if (ruleRes.rows.length === 0) {
      throw new BadRequestException(`No active posting rule found for event '${eventType}'`);
    }
    const rule = ruleRes.rows[0];
    const ruleLines: Array<{ account_code: string; side: 'debit' | 'credit'; formula: string; label?: string }> =
      rule.rule_lines;

    // 2. Build balanced lines
    const voucherLines: any[] = [];
    for (const rl of ruleLines) {
      const acctRes = await client.query(
        `SELECT id FROM accounts WHERE code = $1 AND tenant_id = $2`,
        [rl.account_code, tenantId],
      );
      if (acctRes.rows.length === 0) {
        throw new NotFoundException(`Posting rule account ${rl.account_code} not found in chart of accounts`);
      }
      const accountId = acctRes.rows[0].id;

      let amount = 0;
      if (rl.formula === 'gross' || rl.formula === 'amount') {
        amount = payload.grossAmount;
      } else if (rl.formula === 'net') {
        amount = payload.netAmount ?? payload.grossAmount;
      } else if (rl.formula === 'tax') {
        amount = payload.taxAmount ?? 0;
      }

      amount = Math.round(amount * 10000) / 10000;
      if (amount <= 0) continue;

      voucherLines.push({
        accountId,
        description: rl.label ? `${payload.description} (${rl.label})` : payload.description,
        debit: rl.side === 'debit' ? amount : 0,
        credit: rl.side === 'credit' ? amount : 0,
        partyType: payload.partyType,
        partyId: payload.partyId,
      });
    }

    if (voucherLines.length < 2) {
      throw new BadRequestException(`Operational posting generated fewer than 2 balanced lines for ${eventType}`);
    }

    // 3. Create & auto-post voucher inside caller's transaction
    return this.createVoucher(
      tenantId,
      {
        branchId,
        voucherType: 'JV',
        postingDate: payload.date,
        description: payload.description,
        sourceType: payload.sourceType,
        sourceId: payload.sourceId,
        lines: voucherLines,
        autoPost: true,
      },
      '10000000-0000-0000-0000-000000000001', // system user
      client,
    );
  }

  // ==========================================================================
  // 5. Core Financial Reporting
  // REQ-ACC-015: Trial Balance, General Ledger, USALI P&L
  // ==========================================================================

  async getTrialBalance(
    tenantId: string,
    branchId: string,
    fiscalPeriodId?: string,
  ): Promise<TrialBalanceReportDto> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      let periodName = 'All Open Periods';
      let periodFilter = '';
      const params: any[] = [tenantId, branchId];

      if (fiscalPeriodId) {
        params.push(fiscalPeriodId);
        periodFilter = `AND gle.fiscal_period_id = $${params.length}`;
        const pRes = await client.query(`SELECT name FROM fiscal_periods WHERE id = $1`, [fiscalPeriodId]);
        if (pRes.rows.length > 0) periodName = pRes.rows[0].name;
      }

      const sql = `
        SELECT
          a.id as account_id,
          a.code as account_code,
          a.name as account_name,
          a.account_class,
          a.normal_balance,
          COALESCE(SUM(gle.debit), 0.0000) as period_debit,
          COALESCE(SUM(gle.credit), 0.0000) as period_credit
        FROM accounts a
        LEFT JOIN gl_entries gle ON gle.account_id = a.id
          AND gle.tenant_id = $1
          AND gle.branch_id = $2
          ${periodFilter}
        WHERE a.tenant_id = $1 AND a.is_active = true
        GROUP BY a.id, a.code, a.name, a.account_class, a.normal_balance
        ORDER BY a.code ASC
      `;

      const res = await client.query(sql, params);

      let totalDebit = 0;
      let totalCredit = 0;
      const items = res.rows.map((r: any) => {
        const pDr = Number(r.period_debit);
        const pCr = Number(r.period_credit);
        totalDebit += pDr;
        totalCredit += pCr;

        // Closing debit / credit representation based on normal balance
        let closingDebit = 0;
        let closingCredit = 0;
        const net = pDr - pCr;
        if (net > 0) {
          closingDebit = net;
        } else if (net < 0) {
          closingCredit = Math.abs(net);
        }

        return {
          accountId: r.account_id,
          accountCode: r.account_code,
          accountName: r.account_name,
          accountClass: r.account_class,
          openingBalance: 0,
          periodDebit: pDr,
          periodCredit: pCr,
          closingDebit,
          closingCredit,
        };
      });

      totalDebit = Math.round(totalDebit * 10000) / 10000;
      totalCredit = Math.round(totalCredit * 10000) / 10000;
      const isBalanced = Math.abs(totalDebit - totalCredit) < 0.0001;

      return {
        branchId,
        fiscalPeriodId,
        periodName,
        asOfDate: new Date().toISOString().split('T')[0],
        items,
        totalDebit,
        totalCredit,
        isBalanced,
      };
    });
  }

  async getGeneralLedger(
    tenantId: string,
    accountId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<GeneralLedgerReportDto> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      const acctRes = await client.query(
        `SELECT id, code, name FROM accounts WHERE id = $1 AND tenant_id = $2`,
        [accountId, tenantId],
      );
      if (acctRes.rows.length === 0) throw new NotFoundException(`Account ${accountId} not found`);
      const acct = acctRes.rows[0];

      let sql = `
        SELECT gle.*, a.code as account_code, a.name as account_name
        FROM gl_entries gle
        JOIN accounts a ON a.id = gle.account_id
        WHERE gle.account_id = $1 AND gle.tenant_id = $2
      `;
      const params: any[] = [accountId, tenantId];

      if (startDate) {
        params.push(startDate);
        sql += ` AND gle.posting_date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        sql += ` AND gle.posting_date <= $${params.length}`;
      }
      sql += ` ORDER BY gle.posting_date ASC, gle.created_at ASC`;

      const res = await client.query(sql, params);

      let totalDebit = 0;
      let totalCredit = 0;
      const entries: GlEntryDto[] = res.rows.map((r: any) => {
        const dr = Number(r.debit);
        const cr = Number(r.credit);
        totalDebit += dr;
        totalCredit += cr;
        return {
          id: r.id,
          tenantId: r.tenant_id,
          branchId: r.branch_id,
          voucherId: r.voucher_id,
          voucherLineId: r.voucher_line_id,
          voucherNo: r.voucher_no,
          voucherType: r.voucher_type,
          postingDate: formatDateOnly(r.posting_date),
          fiscalPeriodId: r.fiscal_period_id,
          accountId: r.account_id,
          accountCode: r.account_code,
          accountName: r.account_name,
          debit: dr,
          credit: cr,
          description: r.description,
          sourceType: r.source_type,
          createdAt: new Date(r.created_at).toISOString(),
        };
      });

      return {
        accountId: acct.id,
        accountCode: acct.code,
        accountName: acct.name,
        startDate: startDate || '2026-01-01',
        endDate: endDate || '2026-12-31',
        openingBalance: 0,
        entries,
        totalDebit,
        totalCredit,
        closingBalance: totalDebit - totalCredit,
      };
    });
  }

  async getUsaliPnl(
    tenantId: string,
    branchId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<UsaliPnlReportDto> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      let dateFilter = '';
      const params: any[] = [tenantId, branchId];
      if (startDate) {
        params.push(startDate);
        dateFilter += ` AND gle.posting_date >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate);
        dateFilter += ` AND gle.posting_date <= $${params.length}`;
      }

      const sql = `
        SELECT
          a.account_class,
          a.code,
          COALESCE(SUM(gle.debit), 0.0000) as sum_debit,
          COALESCE(SUM(gle.credit), 0.0000) as sum_credit
        FROM accounts a
        LEFT JOIN gl_entries gle ON gle.account_id = a.id
          AND gle.tenant_id = $1 AND gle.branch_id = $2
          ${dateFilter}
        WHERE a.tenant_id = $1 AND a.account_class IN ('revenue', 'cogs', 'expense')
        GROUP BY a.account_class, a.code
      `;

      const res = await client.query(sql, params);

      let roomsRevenue = 0;
      let fnbRevenue = 0;
      let otherRevenue = 0;
      let roomsExpenses = 0;
      let fnbExpenses = 0;
      let cogsTotal = 0;
      let adminExpenses = 0;
      let utilitiesExpenses = 0;
      let maintenanceExpenses = 0;

      for (const r of res.rows) {
        const netCredit = Number(r.sum_credit) - Number(r.sum_debit);
        const netDebit = Number(r.sum_debit) - Number(r.sum_credit);

        if (r.code === '4010' || r.code === '4040') roomsRevenue += netCredit;
        else if (r.code === '4020' || r.code === '4030') fnbRevenue += netCredit;
        else if (r.account_class === 'revenue') otherRevenue += netCredit;
        else if (r.account_class === 'cogs') cogsTotal += netDebit;
        else if (r.code === '6010' || r.code === '6020' || r.code === '6030') roomsExpenses += netDebit;
        else if (r.code === '6040') adminExpenses += netDebit;
        else if (r.code === '6050') utilitiesExpenses += netDebit;
        else if (r.code === '6060') maintenanceExpenses += netDebit;
      }

      const totalRevenue = roomsRevenue + fnbRevenue + otherRevenue;
      const totalOperatingExpenses =
        roomsExpenses + fnbExpenses + cogsTotal + adminExpenses + utilitiesExpenses + maintenanceExpenses;
      const gop = totalRevenue - (roomsExpenses + fnbExpenses + cogsTotal);
      const netIncome = totalRevenue - totalOperatingExpenses;

      return {
        branchId,
        periodName: `${startDate || '2026-01-01'} to ${endDate || '2026-12-31'}`,
        startDate: startDate || '2026-01-01',
        endDate: endDate || '2026-12-31',
        roomsRevenue,
        fnbRevenue,
        otherRevenue,
        totalRevenue,
        roomsExpenses,
        fnbExpenses,
        cogsTotal,
        adminExpenses,
        utilitiesExpenses,
        maintenanceExpenses,
        totalOperatingExpenses,
        gop,
        netIncome,
      };
    });
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async generateNextVoucherNo(
    client: pg.PoolClient,
    tenantId: string,
    branchId: string,
    voucherType: string,
    postingDate: string,
  ): Promise<string> {
    const year = postingDate.split('-')[0] || new Date().getFullYear().toString();
    const docType = `voucher_${voucherType.toLowerCase()}`;

    // Lock sequence row FOR UPDATE to guarantee gapless numbers
    let seqRes = await client.query(
      `SELECT id, prefix, pattern, reset_policy, next_no
       FROM numbering_sequences
       WHERE tenant_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
         AND doc_type = $3
       FOR UPDATE`,
      [tenantId, branchId, docType],
    );

    if (seqRes.rows.length === 0) {
      // Find highest number currently in vouchers to start at or above
      const maxRes = await client.query(
        `SELECT voucher_no FROM vouchers
         WHERE tenant_id = $1 AND branch_id = $2 AND voucher_type = $3 AND voucher_no LIKE $4
         ORDER BY voucher_no DESC LIMIT 1`,
        [tenantId, branchId, voucherType, `${voucherType}-${year}-%`],
      );
      let initialNo = 1;
      if (maxRes.rows.length > 0 && maxRes.rows[0].voucher_no) {
        const parts = maxRes.rows[0].voucher_no.split('-');
        const lastNum = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastNum)) {
          initialNo = lastNum + 1;
        }
      }

      const seqId = crypto.randomUUID();
      await client.query(
        `INSERT INTO numbering_sequences (
          id, tenant_id, branch_id, doc_type, prefix, pattern, reset_policy, next_no, is_gapless
        ) VALUES ($1, $2, $3, $4, $5, '{PREFIX}-{YYYY}-{#6}', 'yearly', $6, true)
        ON CONFLICT (tenant_id, branch_id, doc_type) DO UPDATE SET next_no = GREATEST(numbering_sequences.next_no, EXCLUDED.next_no)`,
        [seqId, tenantId, branchId, docType, voucherType, initialNo],
      );

      seqRes = await client.query(
        `SELECT id, prefix, pattern, reset_policy, next_no
         FROM numbering_sequences
         WHERE tenant_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
           AND doc_type = $3
         FOR UPDATE`,
        [tenantId, branchId, docType],
      );
    }

    const seq = seqRes.rows[0];
    let currentNo = Number(seq.next_no);
    let voucherNo = '';

    while (true) {
      let candidate = (seq.pattern || '{PREFIX}-{YYYY}-{#6}')
        .replace('{PREFIX}', seq.prefix || voucherType)
        .replace('{YYYY}', year);

      const padMatch = candidate.match(/\{#(\d+)\}/);
      if (padMatch) {
        const digits = parseInt(padMatch[1], 10);
        candidate = candidate.replace(padMatch[0], String(currentNo).padStart(digits, '0'));
      } else {
        candidate = candidate.replace('{#}', String(currentNo));
      }

      const existCheck = await client.query(
        `SELECT 1 FROM vouchers WHERE tenant_id = $1 AND branch_id = $2 AND voucher_no = $3`,
        [tenantId, branchId, candidate],
      );
      if (existCheck.rows.length === 0) {
        voucherNo = candidate;
        break;
      }
      currentNo++;
    }

    const nextNo = currentNo + 1;
    await client.query(
      `UPDATE numbering_sequences
       SET next_no = $1
       WHERE id = $2 AND tenant_id = $3`,
      [nextNo, seq.id, tenantId],
    );

    return voucherNo;
  }

  private async updateGlBalance(
    client: pg.PoolClient,
    tenantId: string,
    branchId: string,
    accountId: string,
    fiscalPeriodId: string,
    debitDelta: number,
    creditDelta: number,
  ): Promise<void> {
    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO gl_balances (
        id, tenant_id, branch_id, account_id, fiscal_period_id,
        opening_balance, total_debit, total_credit, closing_balance
      ) VALUES ($1, $2, $3, $4, $5, 0.0000, $6, $7, $8)
      ON CONFLICT (tenant_id, branch_id, account_id, fiscal_period_id) DO UPDATE SET
        total_debit = gl_balances.total_debit + EXCLUDED.total_debit,
        total_credit = gl_balances.total_credit + EXCLUDED.total_credit,
        closing_balance = gl_balances.closing_balance + (EXCLUDED.total_debit - EXCLUDED.total_credit),
        updated_at = now()`,
      [
        id,
        tenantId,
        branchId,
        accountId,
        fiscalPeriodId,
        debitDelta,
        creditDelta,
        debitDelta - creditDelta,
      ],
    );
  }

  private mapAccountRow(r: any): AccountDto {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      name: r.name,
      accountClass: r.account_class,
      accountGroup: r.account_group,
      normalBalance: r.normal_balance,
      isControlAccount: r.is_control_account,
      controlType: r.control_type,
      parentId: r.parent_id,
      isReconciliationActive: r.is_reconciliation_active,
      isActive: r.is_active,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  private mapVoucherRow(r: any): VoucherDto {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      voucherNo: r.voucher_no,
      voucherType: r.voucher_type,
      status: r.status,
      postingDate: formatDateOnly(r.posting_date),
      fiscalPeriodId: r.fiscal_period_id,
      fiscalPeriodName: r.fiscal_period_name,
      description: r.description,
      sourceType: r.source_type,
      sourceId: r.source_id,
      reversalOf: r.reversal_of,
      reversedBy: r.reversed_by,
      totalDebit: Number(r.total_debit),
      totalCredit: Number(r.total_credit),
      createdBy: r.created_by,
      approvedBy: r.approved_by,
      postedBy: r.posted_by,
      postedAt: r.posted_at ? new Date(r.posted_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }
}
