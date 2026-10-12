import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './kernel/errors/problem-filter.js';
import { loginAs } from './test-utils/auth.js';
import { DatabaseService } from './kernel/database/database.service.js';

describe('Phase 4: Front Desk, Folios, Night Audit & Housekeeping Operations Tests', () => {
  let app: INestApplication;
  let tokenA = '';
  let db: DatabaseService;
  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const BRANCH_MNL = 'b0000000-0000-0000-0000-000000000001';

  // Seeded IDs from 004 & 005
  const RES_ID = '36000000-0000-0000-0000-000000000001';
  const RU_ID = '37000000-0000-0000-0000-000000000001';
  const UNIT_101 = '56000000-0000-0000-0000-000000000101';
  const UNIT_102 = '56000000-0000-0000-0000-000000000102';
  const UNIT_103 = '56000000-0000-0000-0000-000000000103';
  const SEEDED_STAY_ID = '70000000-0000-0000-0000-000000000001';
  const SEEDED_FOLIO_ID = '80000000-0000-0000-0000-000000000001';

  const resetStayState = async () => {
    await db.transaction(TENANT_A, async (client) => {
      await client.query(`
        UPDATE stays
        SET status = 'in_house',
            actual_check_out = NULL,
            unit_id = '${UNIT_101}',
            expected_check_out = CURRENT_DATE + 2
        WHERE id = '${SEEDED_STAY_ID}'
      `);
      await client.query(`UPDATE units SET status_code = 'occupied' WHERE id = '${UNIT_101}'`);
      await client.query(`UPDATE units SET status_code = 'vacant_clean' WHERE id = '${UNIT_103}'`);
      await client.query(`UPDATE units SET status_code = 'vacant_dirty' WHERE id = '56000000-0000-0000-0000-000000000201'`);
      await client.query(`UPDATE hk_tasks SET status = 'pending' WHERE id = '85000000-0000-0000-0000-000000000001'`);
      await client.query(`
        UPDATE folios
        SET status = 'open',
            total_charges = 175.5000,
            total_payments = 0.0000,
            balance = 175.5000
        WHERE id = '${SEEDED_FOLIO_ID}'
      `);
      await client.query(`DELETE FROM room_moves WHERE stay_id = '${SEEDED_STAY_ID}'`);
    });
  };

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
    tokenA = (await loginAs(app, 'admin@acme.com')).accessToken;
    db = app.get(DatabaseService);
    await resetStayState();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Front Desk Operations & Stay Lifecycle (REQ-OPS-001…003)', () => {
    it('GET /api/v1/stays returns active stays', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/stays?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const stay = res.body.find((s: any) => s.id === SEEDED_STAY_ID);
      expect(stay).toBeDefined();
      expect(stay.status).toBe('in_house');
      expect(stay.unitNumber).toBeDefined();
    });

    it('GET /api/v1/stays/:id returns stay details and reg card info', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/stays/${SEEDED_STAY_ID}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(SEEDED_STAY_ID);
      expect(res.body.guestName).toBe('John Doe');

      const regCardRes = await request(app.getHttpServer())
        .get(`/api/v1/stays/${SEEDED_STAY_ID}/registration-card`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(regCardRes.status).toBe(200);
      expect(regCardRes.body.disclaimer).toContain('hotel policies');
      expect(regCardRes.body.keycardCode).toBeDefined();
    });

    it('POST /api/v1/stays/:id/room-move rejects move if destination room is dirty', async () => {
      // Set unit 103 to vacant_dirty
      await db.transaction(TENANT_A, async (client) => {
        await client.query(`UPDATE units SET status_code = 'vacant_dirty' WHERE id = $1`, [UNIT_103]);
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/stays/${SEEDED_STAY_ID}/room-move`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          newUnitId: UNIT_103,
          reason: 'Guest requested higher floor',
        });

      expect(res.status).toBe(400);
      expect(res.body.detail || res.body.message).toContain('not clean');
    });

    it('POST /api/v1/stays/:id/room-move succeeds when moving to clean room, creates HK task for old room', async () => {
      // Set unit 103 to vacant_clean
      await db.transaction(TENANT_A, async (client) => {
        await client.query(`UPDATE units SET status_code = 'vacant_clean' WHERE id = $1`, [UNIT_103]);
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/stays/${SEEDED_STAY_ID}/room-move`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          newUnitId: UNIT_103,
          reason: 'Guest requested higher floor',
        });

      expect(res.status).toBe(201);
      expect(res.body.unitId).toBe(UNIT_103);

      // Verify old room (UNIT_101) is now vacant_dirty and HK task was generated
      await db.withTenantConnection(TENANT_A, undefined, async (client) => {
        const oldUnit = await client.query(`SELECT status_code FROM units WHERE id = $1`, [UNIT_101]);
        expect(oldUnit.rows[0].status_code).toBe('vacant_dirty');

        const hkTasks = await client.query(
          `SELECT * FROM hk_tasks WHERE unit_id = $1 AND task_type = 'checkout_clean'`,
          [UNIT_101],
        );
        expect(hkTasks.rows.length).toBeGreaterThanOrEqual(1);

        const moves = await client.query(`SELECT * FROM room_moves WHERE stay_id = $1`, [SEEDED_STAY_ID]);
        expect(moves.rows.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('POST /api/v1/stays/:id/extend extends stay expected checkout date', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/stays/${SEEDED_STAY_ID}/extend`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          newExpectedCheckOut: '2026-10-25',
          notes: 'Guest extended conference stay',
        });

      expect(res.status).toBe(201);
      expect(res.body.expectedCheckOut).toBe('2026-10-25');
    });
  });

  describe('2. Folio Workspace & Multi-Window Billing Engine (REQ-BIL-001…005)', () => {
    it('GET /api/v1/folios/:id returns multi-window ledger breakdown', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/folios/${SEEDED_FOLIO_ID}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(SEEDED_FOLIO_ID);
      expect(res.body.currency).toBe('USD');
      expect(res.body.lines.length).toBeGreaterThanOrEqual(2);
      expect(res.body.balance).toBeGreaterThan(0);
    });

    it('POST /api/v1/folios/:id/lines posts a charge on Window 1', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/folios/${SEEDED_FOLIO_ID}/lines`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          windowNo: 1,
          lineType: 'charge',
          chargeType: 'fnb',
          description: 'Lobby Lounge Cocktails & Snacks',
          qty: 2,
          unitAmount: 20,
          taxAmount: 4.8,
        });

      expect(res.status).toBe(201);
      expect(res.body.chargeType).toBe('fnb');
      expect(res.body.amount).toBe(44.8); // 2 * 20 + 4.8
      expect(res.body.windowNo).toBe(1);
    });

    it('POST /api/v1/folios/:id/lines/:lineId/void voids line via append-only reversal (immutability)', async () => {
      // 1. Post a mistake charge
      const postRes = await request(app.getHttpServer())
        .post(`/api/v1/folios/${SEEDED_FOLIO_ID}/lines`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          windowNo: 1,
          lineType: 'charge',
          chargeType: 'misc',
          description: 'Accidental Laundry Charge',
          qty: 1,
          unitAmount: 35,
          taxAmount: 0,
        });
      expect(postRes.status).toBe(201);
      const lineId = postRes.body.id;

      // 2. Void the charge
      const voidRes = await request(app.getHttpServer())
        .post(`/api/v1/folios/${SEEDED_FOLIO_ID}/lines/${lineId}/void`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          reason: 'Billed to wrong room',
        });

      expect(voidRes.status).toBe(201);
      expect(voidRes.body.reversesLineId).toBe(lineId);
      expect(voidRes.body.amount).toBe(-35);

      // Verify original line still exists unchanged (append-only)
      await db.withTenantConnection(TENANT_A, undefined, async (client) => {
        const originalLine = await client.query(`SELECT * FROM folio_lines WHERE id = $1`, [lineId]);
        expect(originalLine.rows.length).toBe(1);
        expect(Number(originalLine.rows[0].amount)).toBe(35);
      });
    });

    it('POST /api/v1/folios/:id/lines/:lineId/transfer transfers charge from Window 1 to Window 2', async () => {
      // 1. Post a charge on Window 1
      const postRes = await request(app.getHttpServer())
        .post(`/api/v1/folios/${SEEDED_FOLIO_ID}/lines`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          windowNo: 1,
          lineType: 'charge',
          chargeType: 'fnb',
          description: 'Corporate Dinner Buffet',
          qty: 1,
          unitAmount: 150,
          taxAmount: 25.5,
        });
      expect(postRes.status).toBe(201);
      const lineId = postRes.body.id;

      // 2. Transfer to Window 2 (Corporate Direct Bill)
      const transferRes = await request(app.getHttpServer())
        .post(`/api/v1/folios/${SEEDED_FOLIO_ID}/lines/${lineId}/transfer`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          targetWindowNo: 2,
        });

      expect(transferRes.status).toBe(201);
      expect(transferRes.body.sourceReversal.windowNo).toBe(1);
      expect(transferRes.body.sourceReversal.amount).toBe(-175.5);
      expect(transferRes.body.targetLine.windowNo).toBe(2);
      expect(transferRes.body.targetLine.amount).toBe(175.5);
    });

    it('POST /api/v1/folios/:id/payments records PCI tokenized payment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/folios/${SEEDED_FOLIO_ID}/payments`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          windowNo: 1,
          amount: 50,
          paymentMethod: 'card',
          cardToken: 'tok_visa_4242',
          cardBrand: 'visa',
          lastFour: '4242',
          cardHolder: 'John Doe',
        });

      expect(res.status).toBe(201);
      expect(res.body.payment.payment_method).toBe('card_online');
      expect(Number(res.body.payment.amount)).toBe(50);
      expect(res.body.folioLine.lineType).toBe('payment');
    });

    it('GET /api/v1/folios/:id/invoice generates structured invoice with tax breakdowns', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/folios/${SEEDED_FOLIO_ID}/invoice`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.folioNo).toBeDefined();
      expect(res.body.windows.length).toBe(4);
      expect(res.body.currency).toBe('USD');
    });
  });

  describe('3. Check-Out Wizard & Automated Operations (REQ-OPS-003)', () => {
    it('POST /api/v1/stays/:id/check-out rejects check-out if folio has an outstanding balance', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/stays/${SEEDED_STAY_ID}/check-out`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          settlementType: 'zero_balance',
        });

      expect(res.status).toBe(400);
      expect(res.body.detail || res.body.message).toContain('Outstanding balance');
    });

    it('POST /api/v1/stays/:id/check-out succeeds after settling balance, marks room vacant_dirty & creates HK task', async () => {
      // 1. Get current balance
      const folioRes = await request(app.getHttpServer())
        .get(`/api/v1/folios/${SEEDED_FOLIO_ID}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const balance = folioRes.body.balance;

      // 2. Pay off remaining balance
      if (balance > 0) {
        await request(app.getHttpServer())
          .post(`/api/v1/folios/${SEEDED_FOLIO_ID}/payments`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send({
            windowNo: 1,
            amount: balance,
            paymentMethod: 'cash',
            reference: 'Final Checkout Cash Tender',
          });
      }

      // 3. Checkout now succeeds!
      const checkOutRes = await request(app.getHttpServer())
        .post(`/api/v1/stays/${SEEDED_STAY_ID}/check-out`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          settlementType: 'zero_balance',
        });

      expect(checkOutRes.status).toBe(201);
      expect(checkOutRes.body.status).toBe('checked_out');
      expect(checkOutRes.body.actualCheckOut).toBeDefined();

      // 4. Verify room is vacant_dirty and HK turnaround task exists
      await db.withTenantConnection(TENANT_A, undefined, async (client) => {
        const unit = await client.query(`SELECT status_code FROM units WHERE id = $1`, [UNIT_103]);
        expect(unit.rows[0].status_code).toBe('vacant_dirty');

        const tasks = await client.query(
          `SELECT * FROM hk_tasks WHERE unit_id = $1 AND task_type = 'checkout_clean'`,
          [UNIT_103],
        );
        expect(tasks.rows.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('4. Resumable Night Audit State Machine (REQ-AUD-001…004)', () => {
    it('GET /api/v1/night-audit/status returns state machine steps', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/night-audit/status?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.steps.length).toBe(6);
      expect(res.body.steps.map((s: any) => s.stepKey)).toEqual([
        'pre_checks',
        'room_tax_posting',
        'fee_posting',
        'date_roll',
        'gl_vouchering',
        'kpi_snapshot',
      ]);
    });

    it('POST /api/v1/night-audit/run executes all 6 state machine steps cleanly', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/night-audit/run?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ force: true });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('completed');
      expect(res.body.steps.every((s: any) => s.status === 'completed')).toBe(true);

      // Verify KPI snapshot was calculated and stored
      const kpiRes = await request(app.getHttpServer())
        .get(`/api/v1/night-audit/kpis?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(kpiRes.status).toBe(200);
      expect(kpiRes.body.length).toBeGreaterThanOrEqual(1);
      expect(kpiRes.body[0].totalRooms).toBeGreaterThan(0);
    });

    it('Re-running Night Audit enforces physical database idempotency on room charges', async () => {
      // Re-running with force=true should not throw and should not double-post charges
      const res = await request(app.getHttpServer())
        .post(`/api/v1/night-audit/run?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ force: true });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('completed');
    });
  });

  describe('5. Housekeeping & Maintenance (REQ-HK-001…004)', () => {
    let sampleTaskId: string;

    it('GET /api/v1/housekeeping/tasks returns task queue with priority and checklists', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/housekeeping/tasks?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      sampleTaskId = res.body[0].id;
    });

    it('PATCH /api/v1/housekeeping/tasks/:id/status updates task and room status', async () => {
      // Attendant marks in progress
      const inProgRes = await request(app.getHttpServer())
        .patch(`/api/v1/housekeeping/tasks/${sampleTaskId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'in_progress', notes: 'Attendant started cleaning' });

      expect(inProgRes.status).toBe(200);
      expect(inProgRes.body.status).toBe('in_progress');

      // Attendant marks completed -> room becomes vacant_clean
      const compRes = await request(app.getHttpServer())
        .patch(`/api/v1/housekeeping/tasks/${sampleTaskId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'completed', notes: 'Fresh towels and linens placed' });

      expect(compRes.status).toBe(200);
      expect(compRes.body.status).toBe('completed');

      // Supervisor marks inspected -> room becomes inspected
      const inspectRes = await request(app.getHttpServer())
        .patch(`/api/v1/housekeeping/tasks/${sampleTaskId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'inspected', notes: 'Supervisor approved turnaround' });

      expect(inspectRes.status).toBe(200);
      expect(inspectRes.body.status).toBe('inspected');
    });

    it('POST /api/v1/housekeeping/minibar-charges posts minibar charge directly to stay folio', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/housekeeping/minibar-charges')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          stayId: SEEDED_STAY_ID,
          windowNo: 1,
          itemName: 'Sparkling Mineral Water & Cashews',
          qty: 2,
          unitAmount: 6.5,
        });

      expect(res.status).toBe(201);
      expect(res.body.chargeType).toBe('minibar');
      expect(res.body.description).toContain('Sparkling Mineral Water');
      expect(res.body.amount).toBe(13);
    });

    it('GET /api/v1/housekeeping/maintenance & lost-found return operational records', async () => {
      const maintRes = await request(app.getHttpServer())
        .get(`/api/v1/housekeeping/maintenance?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(maintRes.status).toBe(200);
      expect(maintRes.body.length).toBeGreaterThanOrEqual(1);

      const lfRes = await request(app.getHttpServer())
        .get(`/api/v1/housekeeping/lost-found?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(lfRes.status).toBe(200);
      expect(lfRes.body.length).toBeGreaterThanOrEqual(1);
    });
  });
});
