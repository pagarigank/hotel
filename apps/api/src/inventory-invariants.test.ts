import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './kernel/errors/problem-filter.js';
import { loginAs } from './test-utils/auth.js';
import { DatabaseService } from './kernel/database/database.service.js';

describe('Phase 6: Inventory & Purchasing Invariants Test Suite (REQ-INV-001...010)', () => {
  let app: INestApplication;
  let tokenA = '';
  let db: DatabaseService;

  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const BRANCH_MNL = 'b0000000-0000-0000-0000-000000000001';

  // Seeded IDs
  const WH_CENTRAL = 'c3000000-0000-0000-0000-000000000001';
  const WH_KITCHEN = 'c3000000-0000-0000-0000-000000000002';
  const SUP_FOOD = 'c4000000-0000-0000-0000-000000000001';
  const ITM_RIBEYE = 'c5000000-0000-0000-0000-000000000001';
  const UOM_KG = 'c1000000-0000-0000-0000-000000000001';
  const CAT_FOOD = 'c2000000-0000-0000-0000-000000000001';

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
  // SECTION 1: DATABASE INVARIANTS & LEDGER IMMUTABILITY (P0)
  // ==========================================================================

  describe('1. Database Invariant: Append-Only Stock Ledger Immutability', () => {
    it('blocks direct UPDATE on stock_ledger raising SQLSTATE 55000', async () => {
      await expect(
        db.withTenantConnection(TENANT_A, undefined, async (client) => {
          // Get any existing stock_ledger row
          const r = await client.query(`SELECT id FROM stock_ledger LIMIT 1`);
          expect(r.rows.length).toBeGreaterThan(0);
          const ledgerId = r.rows[0].id;

          await client.query(`UPDATE stock_ledger SET qty_delta = 999 WHERE id = $1`, [ledgerId]);
        }),
      ).rejects.toThrow(/stock_ledger entries are append-only/);
    });

    it('blocks direct DELETE on stock_ledger raising SQLSTATE 55000', async () => {
      await expect(
        db.withTenantConnection(TENANT_A, undefined, async (client) => {
          const r = await client.query(`SELECT id FROM stock_ledger LIMIT 1`);
          const ledgerId = r.rows[0].id;

          await client.query(`DELETE FROM stock_ledger WHERE id = $1`, [ledgerId]);
        }),
      ).rejects.toThrow(/stock_ledger entries are append-only/);
    });
  });

  // ==========================================================================
  // SECTION 2: WEIGHTED AVERAGE COST (WAC) ENGINE (P1 / REQ-INV-005)
  // ==========================================================================

  describe('2. Weighted Average Cost (WAC) Engine Mathematical Verification', () => {
    it('verifies exact WAC formula: 10 @ $5 then 10 @ $7 -> rate $6; issue 5 -> value -$30, rate remains $6', async () => {
      // 1. Create a dedicated test item
      const itemCode = `TEST-WAC-${Date.now().toString().slice(-6)}`;
      const itemRes = await request(app.getHttpServer())
        .post('/api/v1/inventory/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          categoryId: CAT_FOOD,
          code: itemCode,
          name: 'WAC Test Truffle Butter',
          baseUomId: UOM_KG,
          valuationMethod: 'wac',
          standardCost: 5.0,
        });

      expect(itemRes.status).toBe(201);
      const itemId = itemRes.body.id;

      // 2. First Receipt: 10 units @ $5.00
      const grn1Res = await request(app.getHttpServer())
        .post('/api/v1/inventory/grns')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          branchId: BRANCH_MNL,
          supplierId: SUP_FOOD,
          warehouseId: WH_CENTRAL,
          receiptDate: '2026-10-25',
          lines: [
            { itemId, uomId: UOM_KG, qtyReceived: 10, unitCost: 5.0 },
          ],
        });

      expect(grn1Res.status).toBe(201);

      // Verify balance: Qty 10, Value 50.00, Rate 5.00
      const bal1 = await request(app.getHttpServer())
        .get(`/api/v1/inventory/stock-on-hand?warehouseId=${WH_CENTRAL}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      const itemBal1 = bal1.body.find((b: any) => b.itemId === itemId);
      expect(itemBal1).toBeDefined();
      expect(itemBal1.balanceQty).toBe(10);
      expect(itemBal1.balanceValue).toBe(50.0);
      expect(itemBal1.valuationRate).toBe(5.0);

      // 3. Second Receipt: 10 units @ $7.00 -> New Rate = (50 + 70) / 20 = $6.00
      const grn2Res = await request(app.getHttpServer())
        .post('/api/v1/inventory/grns')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          branchId: BRANCH_MNL,
          supplierId: SUP_FOOD,
          warehouseId: WH_CENTRAL,
          receiptDate: '2026-10-25',
          lines: [
            { itemId, uomId: UOM_KG, qtyReceived: 10, unitCost: 7.0 },
          ],
        });

      expect(grn2Res.status).toBe(201);

      const bal2 = await request(app.getHttpServer())
        .get(`/api/v1/inventory/stock-on-hand?warehouseId=${WH_CENTRAL}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      const itemBal2 = bal2.body.find((b: any) => b.itemId === itemId);
      expect(itemBal2.balanceQty).toBe(20);
      expect(itemBal2.balanceValue).toBe(120.0);
      expect(itemBal2.valuationRate).toBe(6.0);

      // 4. Issue: 5 units -> Value delta = - (5 * 6.00) = -30.00; Balance: 15 units, Value: 90.00, Rate remains $6.00
      const issueRes = await request(app.getHttpServer())
        .post('/api/v1/inventory/issues')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          branchId: BRANCH_MNL,
          warehouseId: WH_CENTRAL,
          issueDate: '2026-10-25',
          department: 'kitchen',
          lines: [
            { itemId, qty: 5 },
          ],
        });

      expect(issueRes.status).toBe(201);
      expect(issueRes.body.totalValue).toBe(30.0);

      const bal3 = await request(app.getHttpServer())
        .get(`/api/v1/inventory/stock-on-hand?warehouseId=${WH_CENTRAL}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      const itemBal3 = bal3.body.find((b: any) => b.itemId === itemId);
      expect(itemBal3.balanceQty).toBe(15);
      expect(itemBal3.balanceValue).toBe(90.0);
      expect(itemBal3.valuationRate).toBe(6.0);
    });
  });

  // ==========================================================================
  // SECTION 3: NEGATIVE STOCK POLICY CONTROL (P1 / REQ-INV-006)
  // ==========================================================================

  describe('3. Negative Stock Control: Warehouse Policy Enforcement', () => {
    it('blocks issue exceeding available stock when warehouse policy is block', async () => {
      // Create fresh item with 2 units in WH_CENTRAL (policy: block)
      const itemCode = `TEST-BLK-${Date.now().toString().slice(-6)}`;
      const itemRes = await request(app.getHttpServer())
        .post('/api/v1/inventory/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          categoryId: CAT_FOOD,
          code: itemCode,
          name: 'Limited Saffron',
          baseUomId: UOM_KG,
          valuationMethod: 'wac',
          standardCost: 50.0,
        });

      const itemId = itemRes.body.id;

      await request(app.getHttpServer())
        .post('/api/v1/inventory/grns')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          branchId: BRANCH_MNL,
          supplierId: SUP_FOOD,
          warehouseId: WH_CENTRAL,
          receiptDate: '2026-10-25',
          lines: [{ itemId, uomId: UOM_KG, qtyReceived: 2, unitCost: 50.0 }],
        });

      // Attempt to issue 5 units (exceeds balance 2)
      const badIssueRes = await request(app.getHttpServer())
        .post('/api/v1/inventory/issues')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          branchId: BRANCH_MNL,
          warehouseId: WH_CENTRAL,
          issueDate: '2026-10-25',
          department: 'kitchen',
          lines: [{ itemId, qty: 5 }],
        });

      expect(badIssueRes.status).toBe(400);
      expect(badIssueRes.body.detail || badIssueRes.body.message).toMatch(/Negative stock blocked/i);
    });
  });

  // ==========================================================================
  // SECTION 4: PROCUREMENT & AUTOMATED ACCOUNTING VOUCHERS (P1 / REQ-INV-003)
  // ==========================================================================

  describe('4. Goods Receipt Note (GRN) & Automated Double-Entry Posting', () => {
    it('creates GRN, updates stock ledger, and automatically posts balanced Dr Inventory / Cr GRNI voucher', async () => {
      const grnRes = await request(app.getHttpServer())
        .post('/api/v1/inventory/grns')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          branchId: BRANCH_MNL,
          supplierId: SUP_FOOD,
          warehouseId: WH_CENTRAL,
          receiptDate: '2026-10-25',
          supplierInvoiceNo: 'INV-TEST-8841',
          lines: [
            { itemId: ITM_RIBEYE, uomId: UOM_KG, qtyReceived: 10, unitCost: 35.0 },
          ],
        });

      expect(grnRes.status).toBe(201);
      expect(grnRes.body.status).toBe('received');
      expect(grnRes.body.grnNo).toMatch(/^GRN-2026-\d{6}$/);
      expect(grnRes.body.totalAmount).toBe(350.0);
      expect(grnRes.body.voucherId).toBeDefined();

      // Verify the generated Accounting Voucher
      const voucherRes = await request(app.getHttpServer())
        .get(`/api/v1/accounting/vouchers/${grnRes.body.voucherId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      expect(voucherRes.status).toBe(200);
      expect(voucherRes.body.status).toBe('posted');
      expect(voucherRes.body.totalDebit).toBe(350.0);
      expect(voucherRes.body.totalCredit).toBe(350.0);
      expect(voucherRes.body.lines.length).toBe(2);

      const drLine = voucherRes.body.lines.find((l: any) => l.debit > 0);
      const crLine = voucherRes.body.lines.find((l: any) => l.credit > 0);

      expect(drLine.accountCode).toBe('1210'); // Inventory - Food & Beverage
      expect(crLine.accountCode).toBe('2020'); // Goods Received Not Invoiced (GRNI)
    });
  });

  // ==========================================================================
  // SECTION 5: INTER-WAREHOUSE TRANSFERS (P1)
  // ==========================================================================

  describe('5. Stock Transfers between Warehouses', () => {
    it('transfers stock from WH-CENTRAL to WH-KITCHEN at source WAC rate', async () => {
      // Check initial balance of Ribeye in Kitchen
      const preBalRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/stock-on-hand?warehouseId=${WH_KITCHEN}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      const preKitchenRibeye = preBalRes.body.find((b: any) => b.itemId === ITM_RIBEYE);
      const initialKitchenQty = preKitchenRibeye ? preKitchenRibeye.balanceQty : 0;

      // Transfer 5 KG from Central to Kitchen
      const trfRes = await request(app.getHttpServer())
        .post('/api/v1/inventory/transfers')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          branchId: BRANCH_MNL,
          fromWarehouseId: WH_CENTRAL,
          toWarehouseId: WH_KITCHEN,
          transferDate: '2026-10-25',
          notes: 'Daily kitchen pantry replenishment',
          lines: [{ itemId: ITM_RIBEYE, qty: 5 }],
        });

      expect(trfRes.status).toBe(201);
      expect(trfRes.body.status).toBe('completed');
      expect(trfRes.body.transferNo).toMatch(/^TRF-2026-\d{6}$/);

      // Verify Kitchen balance increased by exactly 5 KG
      const postBalRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/stock-on-hand?warehouseId=${WH_KITCHEN}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      const postKitchenRibeye = postBalRes.body.find((b: any) => b.itemId === ITM_RIBEYE);
      expect(postKitchenRibeye.balanceQty).toBe(initialKitchenQty + 5);
      expect(postKitchenRibeye.valuationRate).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // SECTION 6: PHYSICAL STOCK COUNT AUDIT WORKFLOW (P2 / REQ-INV-008)
  // ==========================================================================

  describe('6. Stock Count Audit: Snapshot Freeze, Count Entry & Variance Reconciliation', () => {
    it('freezes warehouse snapshot, records count variance, and reconciles via auto-adjustment', async () => {
      // 1. Create Stock Count (Freezes snapshot)
      const countRes = await request(app.getHttpServer())
        .post('/api/v1/inventory/counts')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          branchId: BRANCH_MNL,
          warehouseId: WH_CENTRAL,
          countDate: '2026-10-25',
          notes: 'End-of-Month Commissary Physical Audit',
        });

      expect(countRes.status).toBe(201);
      expect(countRes.body.status).toBe('snapshot_frozen');
      expect(countRes.body.countNo).toMatch(/^CNT-2026-\d{6}$/);
      const countId = countRes.body.id;

      // 2. Submit Physical Count Lines (e.g. 1 unit less of Ribeye due to trim waste)
      // Check snapshot quantity of Ribeye in lines
      const snapshotQ = await db.withTenantConnection(TENANT_A, undefined, async (client) => {
        return client.query(
          `SELECT snapshot_qty FROM stock_count_lines WHERE count_id = $1 AND item_id = $2`,
          [countId, ITM_RIBEYE],
        );
      });
      const snapshotQty = Number(snapshotQ.rows[0].snapshot_qty);

      const recordRes = await request(app.getHttpServer())
        .post(`/api/v1/inventory/counts/${countId}/lines`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL)
        .send({
          lines: [
            { itemId: ITM_RIBEYE, countedQty: snapshotQty - 1 },
          ],
        });

      expect(recordRes.status).toBe(201);
      expect(recordRes.body.status).toBe('counting');

      // 3. Reconcile Count
      const reconcileRes = await request(app.getHttpServer())
        .post(`/api/v1/inventory/counts/${countId}/reconcile`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      expect(reconcileRes.status).toBe(201);
      expect(reconcileRes.body.status).toBe('adjusted');
      expect(reconcileRes.body.adjustmentId).toBeDefined();

      // Verify stock balance in WH_CENTRAL now matches the physical count
      const postBalRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory/stock-on-hand?warehouseId=${WH_CENTRAL}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      const ribeyeBal = postBalRes.body.find((b: any) => b.itemId === ITM_RIBEYE);
      expect(ribeyeBal.balanceQty).toBe(snapshotQty - 1);
    });
  });

  // ==========================================================================
  // SECTION 7: INVENTORY VALUATION VS GL RECONCILIATION (P2 / REQ-INV-010)
  // ==========================================================================

  describe('7. Inventory Valuation & GL Reconciliation Report', () => {
    it('computes physical valuation across items and compares with GL Inventory account balance', async () => {
      const valRes = await request(app.getHttpServer())
        .get('/api/v1/inventory/valuation-report')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Branch-Id', BRANCH_MNL);

      expect(valRes.status).toBe(200);
      expect(valRes.body.branchId).toBe(BRANCH_MNL);
      expect(valRes.body.totalValuation).toBeGreaterThan(0);
      expect(valRes.body.itemsCount).toBeGreaterThan(0);
      expect(valRes.body.asOfDate).toBeDefined();
      expect(typeof valRes.body.variance).toBe('number');
      expect(Array.isArray(valRes.body.items)).toBe(true);
    });
  });
});
