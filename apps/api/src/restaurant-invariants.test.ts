import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './kernel/errors/problem-filter.js';
import { loginAs } from './test-utils/auth.js';
import { DatabaseService } from './kernel/database/database.service.js';

describe('Phase 7: Restaurant / F&B POS Invariants Test Suite (REQ-FNB-001...012)', () => {
  let app: INestApplication;
  let tokenA = '';
  let db: DatabaseService;

  const tenantId = 'a0000000-0000-0000-0000-000000000001';
  const branchId = 'b0000000-0000-0000-0000-000000000001';
  const userId = '10000000-0000-0000-0000-000000000001';

  let outletId: string;
  let grillStationId: string;
  let tableId: string;
  let ribeyeItemId: string;
  let wineItemId: string;
  let shiftId: string;
  let stayId: string;
  let folioId: string;
  let unitId: string;
  let guestId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
    tokenA = (await loginAs(app, 'admin@acme.com')).accessToken;
    db = app.get(DatabaseService);

    // Look up seeded master data
    await db.withTenantConnection(tenantId, undefined, async (client) => {
      // 1. Outlet & Stations & Table
      const oRes = await client.query(
        `SELECT id FROM outlets WHERE tenant_id = $1 AND code = 'OUT-BISTRO'`,
        [tenantId],
      );
      outletId = oRes.rows[0]?.id;

      const ksRes = await client.query(
        `SELECT id FROM kitchen_stations WHERE tenant_id = $1 AND code = 'GRILL'`,
        [tenantId],
      );
      grillStationId = ksRes.rows[0]?.id;

      const tRes = await client.query(
        `SELECT id FROM dining_tables WHERE tenant_id = $1 AND table_number = 'T-01'`,
        [tenantId],
      );
      tableId = tRes.rows[0]?.id;

      // 2. Menu Items
      const miRibeye = await client.query(
        `SELECT id FROM menu_items WHERE tenant_id = $1 AND code = 'MNU-RIBEYE'`,
        [tenantId],
      );
      ribeyeItemId = miRibeye.rows[0]?.id;

      const miWine = await client.query(
        `SELECT id FROM menu_items WHERE tenant_id = $1 AND code = 'MNU-WINE-GLS'`,
        [tenantId],
      );
      wineItemId = miWine.rows[0]?.id;

      // 3. Ensure in-house guest exists for Room Charge testing
      const guestRes = await client.query(`SELECT id FROM guests WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
      guestId = guestRes.rows[0]?.id;

      const unitRes = await client.query(
        `SELECT id, number FROM units WHERE tenant_id = $1 AND branch_id = $2 LIMIT 1`,
        [tenantId, branchId],
      );
      unitId = unitRes.rows[0]?.id;

      // Create test stay & folio if not existing
      stayId = crypto.randomUUID();
      folioId = crypto.randomUUID();

      const resvRes = await client.query(
        `SELECT id FROM reservations WHERE tenant_id = $1 LIMIT 1`,
        [tenantId],
      );
      const resvId = resvRes.rows[0]?.id;

      const ruRes = await client.query(
        `SELECT id FROM reservation_units WHERE tenant_id = $1 LIMIT 1`,
        [tenantId],
      );
      const ruId = ruRes.rows[0]?.id;

      await client.query(
        `INSERT INTO stays (
          id, tenant_id, branch_id, reservation_id, reservation_unit_id, unit_id, guest_id,
          actual_check_in, expected_check_out, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), CURRENT_DATE + 3, 'in_house')
        ON CONFLICT DO NOTHING`,
        [stayId, tenantId, branchId, resvId, ruId, unitId, guestId],
      );

      const testFolioNo = `FOL-TEST-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900) + 100}`;
      await client.query(
        `INSERT INTO folios (
          id, tenant_id, branch_id, folio_no, kind, stay_id, status, currency
        ) VALUES ($1, $2, $3, $4, 'guest', $5, 'open', 'USD')`,
        [folioId, tenantId, branchId, testFolioNo, stayId],
      );

      // Reset dining tables to 'free'
      await client.query(
        `UPDATE dining_tables SET status = 'free', current_order_id = null WHERE tenant_id = $1`,
        [tenantId],
      );

      // Close lingering shifts for test user to avoid conflict
      await client.query(
        `UPDATE pos_shifts SET status = 'closed', closed_at = now() WHERE tenant_id = $1 AND user_id = $2 AND status = 'open'`,
        [tenantId, userId],
      );

      // Seed warehouse inventory for recipe items
      const outQ = await client.query(`SELECT warehouse_id FROM outlets WHERE id = $1`, [outletId]);
      const bistroWhId = outQ.rows[0]?.warehouse_id;
      if (bistroWhId) {
        await client.query(
          `INSERT INTO stock_balances (id, tenant_id, branch_id, warehouse_id, item_id, balance_qty, balance_value, valuation_rate, last_cost)
           SELECT gen_random_uuid(), $1, $2, $3, rl.item_id, 100.0000, 3500.0000, 35.0000, 35.0000
           FROM recipe_lines rl
           JOIN recipes r ON r.id = rl.recipe_id
           JOIN menu_items mi ON mi.id = r.menu_item_id
           WHERE mi.outlet_id = $4
           ON CONFLICT (tenant_id, warehouse_id, item_id)
           DO UPDATE SET balance_qty = 100.0000, balance_value = 3500.0000, valuation_rate = 35.0000`,
          [tenantId, branchId, bistroWhId, outletId],
        );
      }
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // TEST 1: OUTLETS & DINING TABLES & SHIFT LIFECYCLE (REQ-FNB-001/010)
  // ==========================================================================
  it('1. Outlets & Tables & POS Shift Opening (REQ-FNB-001/010)', async () => {
    // A. List Outlets
    const outletsRes = await request(app.getHttpServer())
      .get(`/api/v1/restaurant/outlets?branchId=${branchId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId);

    expect(outletsRes.status).toBe(200);
    expect(outletsRes.body.length).toBeGreaterThanOrEqual(1);
    const bistro = outletsRes.body.find((o: any) => o.code === 'OUT-BISTRO');
    expect(bistro).toBeDefined();
    expect(bistro.outletType).toBe('restaurant');

    // B. List Dining Tables
    const tablesRes = await request(app.getHttpServer())
      .get(`/api/v1/restaurant/tables?outletId=${outletId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId);

    expect(tablesRes.status).toBe(200);
    expect(tablesRes.body.length).toBeGreaterThanOrEqual(5);
    const t01 = tablesRes.body.find((t: any) => t.tableNumber === 'T-01');
    expect(t01.status).toBe('free');

    // C. Open POS Shift with float $150.00
    const shiftRes = await request(app.getHttpServer())
      .post('/api/v1/restaurant/shifts/open')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({
        branchId,
        outletId,
        openingFloat: 150.0,
      });

    expect(shiftRes.status).toBe(201);
    expect(shiftRes.body.shiftNo).toContain('SHF-');
    expect(shiftRes.body.openingFloat).toBe(150.0);
    expect(shiftRes.body.status).toBe('open');
    shiftId = shiftRes.body.id;

    // D. Record Cash Drop $50.00
    const dropRes = await request(app.getHttpServer())
      .post(`/api/v1/restaurant/shifts/${shiftId}/cash-drop`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({
        amount: 50.0,
        reason: 'Mid-shift safe drop',
      });

    expect(dropRes.status).toBe(201);
  });

  // ==========================================================================
  // TEST 2: MENU ENGINEERING & RECIPE THEORETICAL COST (REQ-FNB-002, REQ-FNB-008)
  // ==========================================================================
  it('2. Menu Items & Recipe Theoretical Cost Calculation (REQ-FNB-002, REQ-FNB-008)', async () => {
    // A. Fetch Menu Items
    const itemsRes = await request(app.getHttpServer())
      .get(`/api/v1/restaurant/items?outletId=${outletId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId);

    expect(itemsRes.status).toBe(200);
    const ribeye = itemsRes.body.find((i: any) => i.code === 'MNU-RIBEYE');
    expect(ribeye).toBeDefined();
    expect(ribeye.basePrice).toBe(68.0);
    expect(ribeye.hasRecipe).toBe(true);

    // B. Fetch Recipe for Ribeye
    const rcpRes = await request(app.getHttpServer())
      .get(`/api/v1/restaurant/recipes/${ribeyeItemId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId);

    expect(rcpRes.status).toBe(200);
    expect(rcpRes.body).toBeDefined();
    expect(rcpRes.body.lines.length).toBeGreaterThanOrEqual(1);

    const ribeyeLine = rcpRes.body.lines[0];
    expect(ribeyeLine.qty).toBe(0.35); // 350g
    expect(ribeyeLine.yieldPct).toBe(95);
    expect(ribeyeLine.wastePct).toBe(5);
    expect(rcpRes.body.theoreticalCost).toBeGreaterThan(0);

    // C. 86 Availability Toggle
    const toggleRes = await request(app.getHttpServer())
      .patch(`/api/v1/restaurant/items/${ribeyeItemId}/availability`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({ isAvailable: false });

    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.isAvailable).toBe(false);

    // Toggle back
    await request(app.getHttpServer())
      .patch(`/api/v1/restaurant/items/${ribeyeItemId}/availability`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({ isAvailable: true });
  });

  // ==========================================================================
  // TEST 3: ORDER LIFECYCLE & KITCHEN TICKET (KOT) DISPATCH (REQ-FNB-004)
  // ==========================================================================
  it('3. Order Creation, Table Status Transition & KOT Dispatch by Station (REQ-FNB-004)', async () => {
    // A. Create Order on Table T-01
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/restaurant/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({
        branchId,
        outletId,
        tableId,
        shiftId,
        covers: 2,
        notes: 'VIP Window Seating',
        lines: [
          {
            menuItemId: ribeyeItemId,
            quantity: 2,
            seatNo: 1,
            course: 'main',
            notes: 'Medium Rare, Truffle butter',
          },
          {
            menuItemId: wineItemId,
            quantity: 2,
            seatNo: 2,
            course: 'drinks',
            notes: 'Decanted',
          },
        ],
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.orderNo).toContain('ORD-');
    expect(orderRes.body.status).toBe('open');
    expect(orderRes.body.covers).toBe(2);
    expect(orderRes.body.lines.length).toBe(2);

    const orderId = orderRes.body.id;

    // Verify Table status transitioned to 'ordered'
    const tableRes = await request(app.getHttpServer())
      .get(`/api/v1/restaurant/tables?outletId=${outletId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId);

    const table = tableRes.body.find((t: any) => t.id === tableId);
    expect(table.status).toBe('ordered');

    // B. Fire Order Lines to Kitchen (KDS)
    const fireRes = await request(app.getHttpServer())
      .post(`/api/v1/restaurant/orders/${orderId}/fire`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({});

    expect(fireRes.status).toBe(201);
    expect(fireRes.body.length).toBeGreaterThanOrEqual(1);

    // KOTs partitioned by station (GRILL and BAR)
    const grillKot = fireRes.body.find((k: any) => k.kotNo.includes('GRILL'));
    expect(grillKot).toBeDefined();
    expect(grillKot.status).toBe('pending');
    expect(grillKot.lines.length).toBe(1);
    expect(grillKot.lines[0].quantity).toBe(2);

    // Verify Order status is now 'fired'
    const updatedOrder = await request(app.getHttpServer())
      .get(`/api/v1/restaurant/orders/${orderId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId);

    expect(updatedOrder.body.status).toBe('fired');
  });

  // ==========================================================================
  // TEST 4: POST-FIRE VOID HANDLING & AUDIT TRAIL (REQ-FNB-005)
  // ==========================================================================
  it('4. Post-Fire Void Emits Void KOT and Recalculates Totals (REQ-FNB-005)', async () => {
    // Create new order with 2 lines, fire it, then void 1 line
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/restaurant/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({
        branchId,
        outletId,
        covers: 1,
        lines: [
          { menuItemId: ribeyeItemId, quantity: 1, course: 'main' },
          { menuItemId: wineItemId, quantity: 1, course: 'drinks' },
        ],
      });

    const orderId = orderRes.body.id;
    const ribeyeLineId = orderRes.body.lines[0].id;
    const initialTotal = orderRes.body.totalAmount;

    // Fire lines
    await request(app.getHttpServer())
      .post(`/api/v1/restaurant/orders/${orderId}/fire`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({});

    // Void the Ribeye line post-fire
    const voidRes = await request(app.getHttpServer())
      .post(`/api/v1/restaurant/orders/${orderId}/lines/${ribeyeLineId}/void`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({ reason: 'Guest changed mind after order sent to kitchen' });

    expect(voidRes.status).toBe(201);
    expect(voidRes.body.totalAmount).toBeLessThan(initialTotal);

    // Verify Void KOT was emitted in DB
    await db.withTenantConnection(tenantId, undefined, async (client) => {
      const voidKotRes = await client.query(
        `SELECT * FROM kots WHERE order_id = $1 AND is_void = true`,
        [orderId],
      );
      expect(voidKotRes.rows.length).toBe(1);
      expect(voidKotRes.rows[0].kot_no).toContain('VOID-');
      expect(voidKotRes.rows[0].status).toBe('voided');
    });
  });

  // ==========================================================================
  // TEST 5: ATOMIC SETTLEMENT WITH ROOM CHARGE & WAC DEPLETION (REQ-FNB-006, 007, 009)
  // ==========================================================================
  it('5. Atomic Settlement with Room Charge + WAC Inventory Depletion + GL Posting (REQ-FNB-006, 007, 009)', async () => {
    // A. Create Fresh Order
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/restaurant/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({
        branchId,
        outletId,
        tableId,
        covers: 2,
        lines: [
          { menuItemId: ribeyeItemId, quantity: 1, course: 'main' },
          { menuItemId: wineItemId, quantity: 1, course: 'drinks' },
        ],
      });
    const orderId = orderRes.body.id;

    // Fire lines
    await request(app.getHttpServer())
      .post(`/api/v1/restaurant/orders/${orderId}/fire`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({});

    // B. Create Bill
    const billRes = await request(app.getHttpServer())
      .post('/api/v1/restaurant/bills')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({
        orderId,
        discountAmount: 0,
        tipAmount: 10.0,
      });

    expect(billRes.status).toBe(201);
    const billId = billRes.body.id;
    const totalAmount = billRes.body.totalAmount;
    expect(totalAmount).toBeGreaterThan(0);

    // Look up room number of in-house guest
    const guestUnitRes = await db.withTenantConnection(tenantId, undefined, async (client) => {
      const q = await client.query(
        `SELECT u.number FROM stays s JOIN units u ON u.id = s.unit_id WHERE s.id = $1`,
        [stayId],
      );
      return q.rows[0]?.number;
    });

    // C. Settle Bill via Room Charge
    const settleRes = await request(app.getHttpServer())
      .post(`/api/v1/restaurant/bills/${billId}/settle`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({
        payments: [
          {
            paymentMethod: 'room_charge',
            amount: totalAmount,
            roomNumber: guestUnitRes,
          },
        ],
      });

    expect(settleRes.status).toBe(201);
    expect(settleRes.body.status).toBe('paid');
    expect(settleRes.body.paidAmount).toBe(totalAmount);
    expect(settleRes.body.settledAt).toBeDefined();

    const targetFolioId = settleRes.body.payments?.[0]?.folioId || folioId;

    // D. Verify In-House Stay Folio Line Atomically Created (REQ-FNB-007)
    await db.withTenantConnection(tenantId, undefined, async (client) => {
      const folioLineRes = await client.query(
        `SELECT * FROM folio_lines WHERE folio_id = $1 AND charge_type = 'fnb'`,
        [targetFolioId],
      );
      expect(folioLineRes.rows.length).toBeGreaterThanOrEqual(1);
      const fLine = folioLineRes.rows[folioLineRes.rows.length - 1];
      expect(Number(fLine.amount)).toBe(totalAmount);
      expect(fLine.description).toContain('Restaurant');

      // E. Verify WAC Recipe Inventory Depletion in stock_ledger (REQ-FNB-009)
      const ledgerRes = await client.query(
        `SELECT * FROM stock_ledger WHERE doc_id = $1 AND doc_type = 'fnb_pos'`,
        [billId],
      );
      expect(ledgerRes.rows.length).toBeGreaterThanOrEqual(1);
      for (const entry of ledgerRes.rows) {
        expect(Number(entry.qty_delta)).toBeLessThan(0); // Outward movement
        expect(Number(entry.unit_cost)).toBeGreaterThanOrEqual(0);
        expect(Number(entry.value_delta)).toBeLessThan(0);
      }

      // F. Verify Automated Accounting Vouchers (Revenue & COGS)
      const billDb = (await client.query(`SELECT * FROM pos_bills WHERE id = $1`, [billId])).rows[0];
      expect(billDb.revenue_voucher_id).toBeDefined();
      expect(billDb.cogs_voucher_id).toBeDefined();

      const revVoucher = (await client.query(`SELECT * FROM vouchers WHERE id = $1`, [billDb.revenue_voucher_id])).rows[0];
      expect(revVoucher.status).toBe('posted');

      const cogsVoucher = (await client.query(`SELECT * FROM vouchers WHERE id = $1`, [billDb.cogs_voucher_id])).rows[0];
      expect(cogsVoucher.status).toBe('posted');

      // G. Verify Dining Table Status transitioned to 'dirty'
      const tableDb = (await client.query(`SELECT * FROM dining_tables WHERE id = $1`, [tableId])).rows[0];
      expect(tableDb.status).toBe('dirty');
      expect(tableDb.current_order_id).toBeNull();
    });
  });

  // ==========================================================================
  // TEST 6: ATOMIC ROLLBACK INVARIANT ON FAILED ROOM CHARGE
  // ==========================================================================
  it('6. Atomic Rollback Invariant: Invalid Room Charge Leaves Zero Orphaned Data', async () => {
    // Create new order & bill
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/restaurant/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({
        branchId,
        outletId,
        covers: 1,
        lines: [{ menuItemId: ribeyeItemId, quantity: 1, course: 'main' }],
      });
    const orderId = orderRes.body.id;

    const billRes = await request(app.getHttpServer())
      .post('/api/v1/restaurant/bills')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({ orderId });
    const billId = billRes.body.id;
    const totalAmount = billRes.body.totalAmount;

    // Count stock ledger and folio lines before attempt
    const beforeCounts = await db.withTenantConnection(tenantId, undefined, async (client) => {
      const fCount = (await client.query(`SELECT count(*) as count FROM folio_lines WHERE folio_id = $1`, [folioId])).rows[0].count;
      const lCount = (await client.query(`SELECT count(*) as count FROM stock_ledger WHERE doc_id = $1`, [billId])).rows[0].count;
      return { fCount, lCount };
    });

    // Attempt settlement with a NON-EXISTENT room number
    const failSettleRes = await request(app.getHttpServer())
      .post(`/api/v1/restaurant/bills/${billId}/settle`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({
        payments: [
          {
            paymentMethod: 'room_charge',
            amount: totalAmount,
            roomNumber: 'ROOM-NONEXISTENT-999',
          },
        ],
      });

    // Expect Failure (400 Bad Request)
    expect(failSettleRes.status).toBe(400);

    // Verify 100% Rollback Integrity
    await db.withTenantConnection(tenantId, undefined, async (client) => {
      const fCountAfter = (await client.query(`SELECT count(*) as count FROM folio_lines WHERE folio_id = $1`, [folioId])).rows[0].count;
      const lCountAfter = (await client.query(`SELECT count(*) as count FROM stock_ledger WHERE doc_id = $1`, [billId])).rows[0].count;

      expect(fCountAfter).toBe(beforeCounts.fCount);
      expect(lCountAfter).toBe(beforeCounts.lCount);

      const billAfter = (await client.query(`SELECT * FROM pos_bills WHERE id = $1`, [billId])).rows[0];
      expect(billAfter.status).toBe('open');
      expect(billAfter.settled_at).toBeNull();
    });
  });

  // ==========================================================================
  // TEST 7: SHIFT CLOSE WITH CASH OVER/SHORT VARIANCE VOUCHER
  // ==========================================================================
  it('7. Shift Close with Cash Discrepancy Generates Balanced Over/Short Voucher', async () => {
    // Close shift with discrepancy: closing cash $80 (expected was $150 float - $50 drop = $100) -> -$20 variance
    const closeRes = await request(app.getHttpServer())
      .post(`/api/v1/restaurant/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Branch-Id', branchId)
      .send({ closingCash: 80.0 });

    expect(closeRes.status).toBe(201);
    expect(closeRes.body.status).toBe('closed');
    expect(closeRes.body.variance).toBe(-20.0);
    expect(closeRes.body.voucherId).toBeDefined();

    // Verify Cash Over/Short Voucher in DB
    await db.withTenantConnection(tenantId, undefined, async (client) => {
      const voucherRes = await client.query(
        `SELECT * FROM vouchers WHERE id = $1`,
        [closeRes.body.voucherId],
      );
      expect(voucherRes.rows.length).toBe(1);
      const v = voucherRes.rows[0];
      expect(v.status).toBe('posted');
      expect(Number(v.total_debit)).toBe(20.0);
      expect(Number(v.total_credit)).toBe(20.0);
    });
  });
});
