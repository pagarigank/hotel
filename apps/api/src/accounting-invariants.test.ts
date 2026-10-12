import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import crypto from 'node:crypto';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './kernel/errors/problem-filter.js';
import { loginAs } from './test-utils/auth.js';
import { DatabaseService } from './kernel/database/database.service.js';

describe('Phase 5: Accounting & Vouchering Invariants Test Suite (REQ-ACC-001...018)', () => {
  let app: INestApplication;
  let tokenA = '';
  let db: DatabaseService;
  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const BRANCH_MNL = 'b0000000-0000-0000-0000-000000000001';

  // Seeded IDs from 006_accounting_seed
  const SEEDED_VOUCHER_ID = 'e0000000-0000-0000-0000-000000000001';
  const SEEDED_GL_ENTRY_ID = 'a1000000-0000-0000-0000-000000000001';
  const CLOSED_PERIOD_SEP = 'f0000000-0000-0000-0000-000000000926'; // Sep 2026 (closed)
  const OPEN_PERIOD_OCT = 'f0000000-0000-0000-0000-000000001026';   // Oct 2026 (open)

  // Accounts
  const ACCT_CASH = 'c0000000-0000-0000-0000-000000001010';
  const ACCT_BANK = 'c0000000-0000-0000-0000-000000001020';
  const ACCT_GUEST_LEDGER = 'c0000000-0000-0000-0000-000000001110';
  const ACCT_CITY_LEDGER = 'c0000000-0000-0000-0000-000000001120';
  const ACCT_ROOM_REV = 'c0000000-0000-0000-0000-000000004010';
  const ACCT_TAX_PAYABLE = 'c0000000-0000-0000-0000-000000002210';

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
    tokenA = (await loginAs(app, 'admin@acme.com')).accessToken;
    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // SECTION 1: DATABASE INVARIANTS & ENFORCEMENT (P0)
  // ==========================================================================

  describe('1. Database Invariants: Ledger Immutability, Period Locks & Balance Triggers', () => {
    it('Invariant 1: blocks UPDATE on gl_entries (GL_ENTRIES_IMMUTABLE trigger)', async () => {
      await expect(
        db.transaction(TENANT_A, async (client) => {
          await client.query(
            `UPDATE gl_entries SET debit = 999.0000 WHERE id = $1 AND tenant_id = $2`,
            [SEEDED_GL_ENTRY_ID, TENANT_A],
          );
        }),
      ).rejects.toThrow(/GL_ENTRIES_IMMUTABLE/i);
    });

    it('Invariant 1: blocks DELETE on gl_entries (GL_ENTRIES_IMMUTABLE trigger)', async () => {
      await expect(
        db.transaction(TENANT_A, async (client) => {
          await client.query(
            `DELETE FROM gl_entries WHERE id = $1 AND tenant_id = $2`,
            [SEEDED_GL_ENTRY_ID, TENANT_A],
          );
        }),
      ).rejects.toThrow(/GL_ENTRIES_IMMUTABLE/i);
    });

    it('Invariant 2: blocks insert into gl_entries for closed fiscal period (PERIOD_LOCKED trigger)', async () => {
      await expect(
        db.transaction(TENANT_A, async (client) => {
          const fakeId = crypto.randomUUID();
          await client.query(
            `INSERT INTO gl_entries (
              id, tenant_id, branch_id, voucher_id, voucher_line_id, voucher_no,
              voucher_type, posting_date, fiscal_period_id, account_id, account_code,
              debit, credit, description, source_type
            ) VALUES ($1, $2, $3, $4, $5, 'JV-TEST-001', 'JV', '2026-09-15', $6, $7, '1010', 100, 0, 'Test', 'manual')`,
            [
              fakeId,
              TENANT_A,
              BRANCH_MNL,
              SEEDED_VOUCHER_ID,
              'd0000000-0000-0000-0000-000000000001',
              CLOSED_PERIOD_SEP, // closed period!
              ACCT_CASH,
            ],
          );
        }),
      ).rejects.toThrow(/PERIOD_LOCKED/i);
    });

    it('Invariant 3: deferred constraint trigger rejects unbalanced voucher at transaction COMMIT', async () => {
      await expect(
        db.transaction(TENANT_A, async (client) => {
          const vId = crypto.randomUUID();
          // Insert voucher with status 'posted'
          await client.query(
            `INSERT INTO vouchers (
              id, tenant_id, branch_id, voucher_no, voucher_type, status,
              posting_date, fiscal_period_id, description, source_type,
              total_debit, total_credit, created_by
            ) VALUES ($1, $2, $3, 'JV-UNBALANCED-01', 'JV', 'posted', '2026-10-25', $4, 'Unbalanced Test', 'manual', 100, 50, '10000000-0000-0000-0000-000000000001')`,
            [vId, TENANT_A, BRANCH_MNL, OPEN_PERIOD_OCT],
          );

          // Insert unbalanced lines: Debit 100 vs Credit 50
          await client.query(
            `INSERT INTO voucher_lines (id, tenant_id, voucher_id, line_no, account_id, debit, credit)
             VALUES ($1, $2, $3, 1, $4, 100.0000, 0.0000)`,
            [crypto.randomUUID(), TENANT_A, vId, ACCT_CASH],
          );
          await client.query(
            `INSERT INTO voucher_lines (id, tenant_id, voucher_id, line_no, account_id, debit, credit)
             VALUES ($1, $2, $3, 2, $4, 0.0000, 50.0000)`,
            [crypto.randomUUID(), TENANT_A, vId, ACCT_ROOM_REV],
          );
          // Transaction COMMIT will trigger trg_voucher_balanced
        }),
      ).rejects.toThrow(/VOUCHER_UNBALANCED/i);
    });
  });

  // ==========================================================================
  // SECTION 2: CHART OF ACCOUNTS & FISCAL CALENDAR (P0)
  // ==========================================================================

  describe('2. Chart of Accounts & Fiscal Calendar Management', () => {
    it('GET /api/v1/accounting/accounts returns pre-seeded USALI accounts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/accounts')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(20);

      const guestLedger = res.body.find((a: any) => a.code === '1110');
      expect(guestLedger).toBeDefined();
      expect(guestLedger.accountClass).toBe('asset');
      expect(guestLedger.isControlAccount).toBe(true);
      expect(guestLedger.controlType).toBe('guest_ledger');
    });

    it('POST /api/v1/accounting/accounts creates a new sub-account', async () => {
      const newCode = `9${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 89)}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/accounting/accounts')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          code: newCode,
          name: 'Executive Lounge Petty Cash Float',
          accountClass: 'asset',
          accountGroup: 'cash_and_equivalents',
          normalBalance: 'debit',
          isControlAccount: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(newCode);
      expect(res.body.name).toBe('Executive Lounge Petty Cash Float');
    });

    it('GET /api/v1/accounting/fiscal-periods returns 12 monthly periods for FY2026', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/fiscal-periods')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(12);

      const octPeriod = res.body.find((p: any) => p.name === '2026-10');
      expect(octPeriod).toBeDefined();
      expect(octPeriod.status).toBe('open');

      const sepPeriod = res.body.find((p: any) => p.name === '2026-09');
      expect(sepPeriod).toBeDefined();
      expect(sepPeriod.status).toBe('closed');
    });
  });

  // ==========================================================================
  // SECTION 3: VOUCHER CREATION, POSTING & NUMBERING (P1)
  // ==========================================================================

  describe('3. Voucher Engine: Draft, Gapless Numbering, and Auto-Post', () => {
    it('creates a draft voucher and verifies status is draft with no voucher_no', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/accounting/vouchers')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          branchId: BRANCH_MNL,
          voucherType: 'JV',
          postingDate: '2026-10-25',
          description: 'Draft Laundry Reclass Adjustment',
          autoPost: false,
          lines: [
            { accountId: ACCT_CASH, debit: 50.0, credit: 0, description: 'Lounge Cash' },
            { accountId: ACCT_ROOM_REV, debit: 0, credit: 50.0, description: 'Reclass Revenue' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('draft');
      expect(res.body.voucherNo).toBeNull();
      expect(res.body.totalDebit).toBe(50.0);
      expect(res.body.totalCredit).toBe(50.0);

      // Now post the draft voucher
      const postRes = await request(app.getHttpServer())
        .post(`/api/v1/accounting/vouchers/${res.body.id}/post`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      expect(postRes.status).toBe(201);
      expect(postRes.body.status).toBe('posted');
      expect(postRes.body.voucherNo).toMatch(/^JV-2026-\d{6}$/);
      expect(postRes.body.postedAt).toBeDefined();
    });

    it('creates an auto-posted balanced voucher generating immutable gl_entries', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/accounting/vouchers')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          branchId: BRANCH_MNL,
          voucherType: 'RV',
          postingDate: '2026-10-25',
          description: 'Front Desk Direct Guest Cash Deposit',
          autoPost: true,
          lines: [
            { accountId: ACCT_CASH, debit: 300.0, credit: 0 },
            { accountId: ACCT_GUEST_LEDGER, debit: 0, credit: 300.0 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('posted');
      expect(res.body.voucherNo).toMatch(/^RV-2026-\d{6}$/);

      // Verify gl_entries were written
      const glRes = await request(app.getHttpServer())
        .get(`/api/v1/accounting/reports/general-ledger/${ACCT_CASH}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      expect(glRes.status).toBe(200);
      const entry = glRes.body.entries.find((e: any) => e.voucherId === res.body.id);
      expect(entry).toBeDefined();
      expect(entry.debit).toBe(300.0);
    });

    it('rejects creating an auto-posted voucher if debit != credit', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/accounting/vouchers')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          branchId: BRANCH_MNL,
          voucherType: 'JV',
          postingDate: '2026-10-25',
          description: 'Unbalanced Attempt',
          autoPost: true,
          lines: [
            { accountId: ACCT_CASH, debit: 100.0, credit: 0 },
            { accountId: ACCT_ROOM_REV, debit: 0, credit: 80.0 },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.detail).toMatch(/unbalanced/i);
    });
  });

  // ==========================================================================
  // SECTION 4: REVERSAL VOUCHERS (REQ-ACC-004)
  // ==========================================================================

  describe('4. Reversal Vouchers & Audit Linkage', () => {
    it('reverses a posted voucher, creates paired reversed lines, and links reversal_of / reversed_by', async () => {
      // 1. Create a voucher to be reversed
      const origRes = await request(app.getHttpServer())
        .post('/api/v1/accounting/vouchers')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          branchId: BRANCH_MNL,
          voucherType: 'JV',
          postingDate: '2026-10-25',
          description: 'Erroneous Charge To Be Reversed',
          autoPost: true,
          lines: [
            { accountId: ACCT_GUEST_LEDGER, debit: 120.0, credit: 0 },
            { accountId: ACCT_ROOM_REV, debit: 0, credit: 120.0 },
          ],
        });

      expect(origRes.status).toBe(201);
      const originalVoucherId = origRes.body.id;

      // 2. Reverse it
      const revRes = await request(app.getHttpServer())
        .post(`/api/v1/accounting/vouchers/${originalVoucherId}/reverse`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          reason: 'Correcting billing discrepancy',
        });

      expect(revRes.status).toBe(201);
      expect(revRes.body.status).toBe('posted');
      expect(revRes.body.reversalOf).toBe(originalVoucherId);

      // Verify original voucher now points to reversal
      const origRefreshed = await request(app.getHttpServer())
        .get(`/api/v1/accounting/vouchers/${originalVoucherId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      expect(origRefreshed.body.reversedBy).toBe(revRes.body.id);

      // 3. Attempting to reverse again fails
      const duplicateRevRes = await request(app.getHttpServer())
        .post(`/api/v1/accounting/vouchers/${originalVoucherId}/reverse`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          reason: 'Duplicate reversal attempt',
        });

      expect(duplicateRevRes.status).toBe(400);
      expect(duplicateRevRes.body.detail).toMatch(/already been reversed/i);
    });
  });

  // ==========================================================================
  // SECTION 5: FINANCIAL REPORTS (REQ-ACC-015)
  // ==========================================================================

  describe('5. Core Financial Reporting: Trial Balance, General Ledger, USALI P&L', () => {
    it('GET /api/v1/accounting/reports/trial-balance returns an equilibrium balanced report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/reports/trial-balance')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .query({ branchId: BRANCH_MNL, fiscalPeriodId: OPEN_PERIOD_OCT });

      expect(res.status).toBe(200);
      expect(res.body.isBalanced).toBe(true);
      expect(res.body.totalDebit).toBe(res.body.totalCredit);
      expect(res.body.totalDebit).toBeGreaterThan(0);
      expect(res.body.items.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/accounting/reports/general-ledger/:accountId returns running activity', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/accounting/reports/general-ledger/${ACCT_GUEST_LEDGER}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      expect(res.status).toBe(200);
      expect(res.body.accountCode).toBe('1110');
      expect(res.body.accountName).toBe('Guest Ledger');
      expect(res.body.entries.length).toBeGreaterThan(0);
      expect(res.body.totalDebit).toBeGreaterThan(0);
    });

    it('GET /api/v1/accounting/reports/usali-pnl returns departmental rooms revenue and GOP', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/reports/usali-pnl')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .query({ branchId: BRANCH_MNL });

      expect(res.status).toBe(200);
      expect(res.body.totalRevenue).toBeGreaterThan(0);
      expect(res.body.roomsRevenue).toBeGreaterThan(0);
      expect(res.body.gop).toBeDefined();
      expect(res.body.netIncome).toBeDefined();
    });
  });
});
