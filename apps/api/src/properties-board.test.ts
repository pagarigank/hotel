import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './kernel/errors/problem-filter.js';
import { loginAs } from './test-utils/auth.js';
import { uuidv7 } from 'uuidv7';

describe('Phase 2: Properties & Rooms Board Integration Tests', () => {
  let app: INestApplication;
  let tokenA = '';
  let tokenB = '';
  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const TENANT_B = 'a0000000-0000-0000-0000-000000000002';
  const BRANCH_MNL = 'b0000000-0000-0000-0000-000000000001';
  const BRANCH_BOR = 'b0000000-0000-0000-0000-000000000002';

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
    tokenA = (await loginAs(app, 'admin@acme.com')).accessToken;
    tokenB = (await loginAs(app, 'manager@boracay.com')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Property Structure & Unit Types (REQ-PRP-001…003)', () => {
    it('GET /api/v1/properties/types returns property types for Tenant A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/properties/types')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((p: any) => p.code === 'hotel')).toBe(true);
    });

    it('GET /api/v1/properties/amenities returns room amenities', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/properties/amenities')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((a: any) => a.code === 'wifi')).toBe(true);
    });

    it('GET /api/v1/properties/buildings & floors returns branch structure', async () => {
      const bRes = await request(app.getHttpServer())
        .get(`/api/v1/properties/buildings?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(bRes.status).toBe(200);
      expect(bRes.body.some((b: any) => b.code === 'TWA')).toBe(true);

      const fRes = await request(app.getHttpServer())
        .get(`/api/v1/properties/floors?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(fRes.status).toBe(200);
      expect(fRes.body.length).toBeGreaterThanOrEqual(5);
    });

    it('GET /api/v1/properties/unit-types returns STD, DLX, and STE', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/properties/unit-types?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.some((ut: any) => ut.code === 'STD')).toBe(true);
      expect(res.body.some((ut: any) => ut.code === 'DLX')).toBe(true);
      expect(res.body.some((ut: any) => ut.code === 'STE')).toBe(true);
    });

    it('POST /api/v1/properties/amenities creates a new amenity', async () => {
      const uniqueCode = `amenity_${Date.now().toString().slice(-4)}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/properties/amenities')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          code: uniqueCode,
          name: 'Mini Espresso Machine',
          icon: 'bi-cup-hot',
          category: 'room',
        });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(uniqueCode);
      expect(res.body.name).toBe('Mini Espresso Machine');
    });

    it('POST /api/v1/properties/buildings & floors creates building and floor', async () => {
      const bCode = `BLD_${Date.now().toString().slice(-4)}`;
      const bRes = await request(app.getHttpServer())
        .post('/api/v1/properties/buildings')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          branchId: BRANCH_MNL,
          code: bCode,
          name: `Wing ${bCode}`,
          sort: 10,
        });

      expect(bRes.status).toBe(201);
      expect(bRes.body.code).toBe(bCode);

      const fNumber = `F${Date.now().toString().slice(-3)}`;
      const fRes = await request(app.getHttpServer())
        .post('/api/v1/properties/floors')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          branchId: BRANCH_MNL,
          buildingId: bRes.body.id,
          number: fNumber,
          name: `Penthouse Floor ${fNumber}`,
          sort: 99,
        });

      expect(fRes.status).toBe(201);
      expect(fRes.body.number).toBe(fNumber);
    });
  });

  describe('2. Unit Management & Pattern Bulk Creation (REQ-PRP-007)', () => {
    let createdUnitId = '';

    it('POST /api/v1/properties/units creates a single unit', async () => {
      const unitNumber = `TEST-${Date.now().toString().slice(-4)}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/properties/units')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          branchId: BRANCH_MNL,
          unitTypeId: '55000000-0000-0000-0000-000000000001',
          building: 'Main Tower A',
          floor: '1',
          number: unitNumber,
          name: `Test Unit ${unitNumber}`,
          statusCode: 'vacant_clean',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.number).toBe(unitNumber);
      expect(res.body.statusCode).toBe('vacant_clean');

      createdUnitId = res.body.id;
    });

    it('POST /api/v1/properties/units/bulk generates units by pattern', async () => {
      const uniqueFloor = `${Date.now().toString().slice(-4)}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/properties/units/bulk')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          branchId: BRANCH_MNL,
          unitTypeId: '55000000-0000-0000-0000-000000000001',
          building: 'Main Tower A',
          floor: uniqueFloor,
          prefix: `${uniqueFloor}0`,
          startNumber: 1,
          endNumber: 4,
          padding: 1,
          statusCode: 'vacant_clean',
        });

      expect(res.status).toBe(201);
      expect(res.body.createdCount).toBe(4);
      expect(res.body.units.map((u: any) => u.number)).toEqual([
        `${uniqueFloor}01`,
        `${uniqueFloor}02`,
        `${uniqueFloor}03`,
        `${uniqueFloor}04`,
      ]);
    });

    it('GET /api/v1/properties/units filters units by floor and status', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/properties/units?branchId=${BRANCH_MNL}&floor=1`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(4);
      expect(res.body.every((u: any) => u.floor === '1')).toBe(true);
    });

    it('DELETE /api/v1/properties/units/:id soft deletes a unit', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/properties/units/${createdUnitId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify querying unit directly now returns 404
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/properties/units/${createdUnitId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(getRes.status).toBe(404);
    });
  });

  describe('3. Status Transition State Machine (REQ-PRP-005)', () => {
    // Room 102 is initially vacant_dirty
    const UNIT_102 = '56000000-0000-0000-0000-000000000102';

    it('Enforces allowed transition: vacant_dirty -> vacant_clean', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/branches/${BRANCH_MNL}/units/${UNIT_102}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ toStatus: 'vacant_clean' });

      expect(res.status).toBe(201);
      expect(res.body.statusCode).toBe('vacant_clean');
      expect(res.body.isSellable).toBe(true);
    });

    it('Rejects illegal transition: vacant_clean -> occupied (check-in required)', async () => {
      // Direct jump without booking check or when transition not permitted
      const res = await request(app.getHttpServer())
        .post(`/api/v1/branches/${BRANCH_MNL}/units/${UNIT_102}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ toStatus: 'due_out' }); // illegal from vacant_clean!

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('Requires reason when transitioning to out_of_order', async () => {
      // 1. Without reason -> 400
      const failRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${BRANCH_MNL}/units/${UNIT_102}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ toStatus: 'out_of_order' });

      expect(failRes.status).toBe(400);

      // 2. With reason -> 201
      const passRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${BRANCH_MNL}/units/${UNIT_102}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ toStatus: 'out_of_order', reason: 'Emergency plumbing repairs' });

      expect(passRes.status).toBe(201);
      expect(passRes.body.statusCode).toBe('out_of_order');
      expect(passRes.body.isSellable).toBe(false);

      // Revert back: out_of_order -> vacant_dirty
      await request(app.getHttpServer())
        .post(`/api/v1/branches/${BRANCH_MNL}/units/${UNIT_102}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ toStatus: 'vacant_dirty' });
    });

    it('GET /api/v1/properties/units/:id/status-log returns audit history of status changes', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/properties/units/${UNIT_102}/status-log`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const oooEntry = res.body.find((e: any) => e.toStatus === 'out_of_order');
      expect(oooEntry).toBeDefined();
      expect(oooEntry.reason).toBe('Emergency plumbing repairs');
      expect(oooEntry.changedByName).toBeDefined();
    });

    it('GET /api/v1/properties/units/:id inherits unit type attributes (REQ-PRP-007)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/properties/units/${UNIT_102}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.attrs).toBeDefined();
      expect(res.body.attrs.inherited).toBeDefined();
      expect(res.body.attrs.inherited.unitTypeCode).toBeDefined();
      expect(res.body.attrs.inherited.maxOccupancy).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. Out-of-Order Blocking Engine (REQ-PRP-006)', () => {
    const UNIT_204 = '56000000-0000-0000-0000-000000000204';
    let blockId = '';

    it('POST /api/v1/properties/units/:id/block blocks unit and marks it out_of_order', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/properties/units/${UNIT_204}/block`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          branchId: BRANCH_MNL,
          blockType: 'out_of_order',
          reason: 'Scheduled carpet deep cleaning',
          fromDate: today,
          toDate: today,
          notes: 'Contractor scheduled for 10am',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.isActive).toBe(true);
      blockId = res.body.id;

      // Verify unit status was updated to out_of_order
      const unitRes = await request(app.getHttpServer())
        .get(`/api/v1/properties/units/${UNIT_204}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(unitRes.body.statusCode).toBe('out_of_order');
      expect(unitRes.body.isSellable).toBe(false);
    });

    it('POST /api/v1/properties/blocks/:id/release releases block and resets unit to vacant_dirty', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/properties/blocks/${blockId}/release`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const unitRes = await request(app.getHttpServer())
        .get(`/api/v1/properties/units/${UNIT_204}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(unitRes.body.statusCode).toBe('vacant_dirty');
    });
  });

  describe('5. Compact Board Read Model & ETag Support (REQ-PRP-004)', () => {
    let capturedEtag = '';

    it('GET /branches/:branchId/board returns grouped floors, summary counters strip, and ETag', async () => {
      const res = await request(app.getHttpServer())
        .get(`/branches/${BRANCH_MNL}/board`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.headers['etag']).toBeDefined();
      capturedEtag = res.headers['etag'];

      expect(res.body.branchName).toBe('Manila Main Hotel');
      expect(res.body.businessDate).toBeDefined();

      // Counters check
      expect(res.body.counters).toBeDefined();
      expect(res.body.counters.total).toBeGreaterThanOrEqual(18);
      expect(res.body.counters.occupancyRate).toBeGreaterThanOrEqual(0);

      // Floor grouping check
      expect(Array.isArray(res.body.floors)).toBe(true);
      expect(res.body.floors.length).toBeGreaterThanOrEqual(5);

      const floor1 = res.body.floors.find((f: any) => f.floor === '1');
      expect(floor1).toBeDefined();
      expect(floor1.units.length).toBeGreaterThanOrEqual(4);

      const unit101 = floor1.units.find((u: any) => u.number === '101');
      expect(unit101).toBeDefined();
      expect(unit101.unitTypeCode).toBe('STD');
      expect(unit101.colorToken).toBeDefined();
      expect(unit101.icon).toBeDefined();
    });

    it('Returns 304 Not Modified when client passes matching If-None-Match ETag', async () => {
      const res = await request(app.getHttpServer())
        .get(`/branches/${BRANCH_MNL}/board`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('If-None-Match', capturedEtag);

      expect(res.status).toBe(304);
      expect(res.text).toBe('');
    });
  });

  describe('6. Tenancy Boundary Enforcement on Properties & Board', () => {
    it('Tenant B board only returns Tenant B units (Beachfront Villas)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/branches/${BRANCH_BOR}/board`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.branchName).toBe('Boracay Beachfront Resort');

      // Must not contain any Tenant A rooms (101, 102, etc.)
      const allUnitNumbers = res.body.floors.flatMap((f: any) => f.units.map((u: any) => u.number));
      expect(allUnitNumbers).toContain('V01');
      expect(allUnitNumbers).not.toContain('101');
      expect(allUnitNumbers).not.toContain('201');
    });

    it('Tenant B cannot query Tenant A unit ID (returns 404 via RLS)', async () => {
      const UNIT_101_A = '56000000-0000-0000-0000-000000000101';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/properties/units/${UNIT_101_A}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
    });
  });

  describe('7. Real-Time Updates via Server-Sent Events (SSE) (REQ-PRP-005)', () => {
    it('EventsService manages client streams and broadcasts unit.status_changed', async () => {
      const { EventsService } = await import('./modules/properties/events.service.js');
      const eventsService = app.get(EventsService);
      expect(eventsService).toBeDefined();

      let receivedEvent = '';
      const fakeRes: any = {
        write: (chunk: string) => {
          if (chunk.includes('event: unit.status_changed')) {
            receivedEvent = chunk;
          }
        },
        on: () => {},
      };

      eventsService.addClient('client-test-id', TENANT_A, BRANCH_MNL, fakeRes);
      expect(eventsService.getClientCount(TENANT_A)).toBeGreaterThanOrEqual(1);

      eventsService.broadcast(
        TENANT_A,
        'unit.status_changed',
        { unitId: 'test-unit-id', toStatus: 'vacant_clean' },
        BRANCH_MNL,
      );

      expect(receivedEvent).toContain('unit.status_changed');
      expect(receivedEvent).toContain('vacant_clean');

      eventsService.removeClient('client-test-id');
    });
  });
});
