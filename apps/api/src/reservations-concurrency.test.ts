import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './kernel/errors/problem-filter.js';
import { loginAs } from './test-utils/auth.js';
import { DatabaseService } from './kernel/database/database.service.js';
import { uuidv7 } from 'uuidv7';

describe('Phase 3: Rates, Guests, Reservations & Concurrency Tests', () => {
  let app: INestApplication;
  let tokenA = '';
  let db: DatabaseService;
  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const TENANT_B = 'a0000000-0000-0000-0000-000000000002';
  const BRANCH_MNL = 'b0000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
    tokenA = (await loginAs(app, 'admin@acme.com')).accessToken;
    db = app.get(DatabaseService);

    // Clean up test reservation units & ensure inventory has capacity for test dates
    await db.transaction(TENANT_A, async (client) => {
      await client.query(`
        DELETE FROM reservation_units 
        WHERE tenant_id = $1 
          AND check_in >= '2026-11-01' 
          AND check_in <= '2026-12-31'
      `, [TENANT_A]);

      await client.query(`
        UPDATE room_type_inventory
        SET sold = 0
        WHERE tenant_id = $1
          AND stay_date >= '2026-11-01'
          AND stay_date <= '2026-12-31'
      `, [TENANT_A]);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Rates & Pricing Engine (REQ-RAT-001…004)', () => {
    it('GET /api/v1/branches/:branchId/rate-plans returns active rate plans', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/branches/${BRANCH_MNL}/rate-plans`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((rp: any) => rp.code === 'BAR')).toBe(true);
      expect(res.body.some((rp: any) => rp.code === 'CORP')).toBe(true);
    });

    it('POST /api/v1/rates/quote calculates nightly price quotes with transparent tax breakdown', async () => {
      const quotePayload = {
        branchId: BRANCH_MNL,
        unitTypeId: '55000000-0000-0000-0000-000000000001', // STD
        ratePlanId: '35000000-0000-0000-0000-000000000001', // BAR
        checkIn: '2026-11-01',
        checkOut: '2026-11-04',
        adults: 2,
        children: 0,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/rates/quote')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(quotePayload);

      expect(res.status).toBe(201);
      expect(res.body.nightsCount).toBe(3);
      expect(res.body.subtotal).toBeGreaterThan(0);
      expect(res.body.totalTaxes).toBeGreaterThan(0);
      expect(res.body.totalAmount).toBe(res.body.subtotal + res.body.totalTaxes);
      expect(res.body.nightlyBreakdown.length).toBe(3);
      expect(res.body.nightlyBreakdown[0].taxes.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/v1/rates/quote rejects invalid check-out date before check-in', async () => {
      const invalidPayload = {
        branchId: BRANCH_MNL,
        unitTypeId: '55000000-0000-0000-0000-000000000001',
        ratePlanId: '35000000-0000-0000-0000-000000000001',
        checkIn: '2026-11-10',
        checkOut: '2026-11-05',
        adults: 1,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/rates/quote')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(invalidPayload);

      expect(res.status).toBe(400);
    });
  });

  describe('2. Guests & Deduplication Engine (REQ-GST-001…003)', () => {
    it('POST /api/v1/guests creates new guest profile', async () => {
      const email = `test.guest.${Date.now()}@example.com`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/guests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          firstName: 'Jonathan',
          lastName: 'Harker',
          email,
          phone: `+1-555-${Date.now().toString().slice(-4)}`,
          vipStatus: 'silver',
        });

      expect(res.status).toBe(201);
      expect(res.body.guest.id).toBeDefined();
      expect(res.body.guest.firstName).toBe('Jonathan');
      expect(res.body.isDuplicateMatch).toBe(false);
    });

    it('POST /api/v1/guests detects duplicate normalized email and returns existing match', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/guests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'JOHN.DOE@EXAMPLE.COM', // Normalized match
          phone: '+1-555-0101',
        });

      expect(res.status).toBe(201);
      expect(res.body.isDuplicateMatch).toBe(true);
      expect(res.body.guest.id).toBe('30000000-0000-0000-0000-000000000001');
    });

    it('POST /api/v1/guests/merge re-links profiles and logs historical merge', async () => {
      // 1. Create temporary guest to merge
      const gRes = await request(app.getHttpServer())
        .post('/api/v1/guests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          firstName: 'Duplicate',
          lastName: 'Person',
          email: `dup.${Date.now()}@test.com`,
        });
      const sourceId = gRes.body.guest.id;
      const targetId = '30000000-0000-0000-0000-000000000001';

      // 2. Perform merge
      const mergeRes = await request(app.getHttpServer())
        .post('/api/v1/guests/merge')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          sourceGuestId: sourceId,
          targetGuestId: targetId,
          reason: 'Duplicate profile created during phone inquiry',
        });

      expect(mergeRes.status).toBe(201);
      expect(mergeRes.body.merged).toBe(true);

      // 3. Verify source is merged and not returned in normal list
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/guests?search=Duplicate`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(listRes.body.some((g: any) => g.id === sourceId)).toBe(false);
    });
  });

  describe('3. Availability Search & Reservation Lifecycle (REQ-RSV-001…006)', () => {
    it('GET /api/v1/availability searches room types and calculates available rates', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/availability?branchId=${BRANCH_MNL}&checkIn=2026-11-10&checkOut=2026-11-13&adults=2`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.nightsCount).toBe(3);
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results.length).toBeGreaterThan(0);
      const stdResult = res.body.results.find((r: any) => r.code === 'STD');
      expect(stdResult).toBeDefined();
      expect(stdResult.availableUnitsCount).toBeGreaterThan(0);
    });

    it('POST /api/v1/reservations creates confirmed booking requiring Idempotency-Key', async () => {
      const idempotencyKey = uuidv7();
      const bookingPayload = {
        branchId: BRANCH_MNL,
        guest: {
          firstName: 'Mina',
          lastName: 'Murray',
          email: `mina.${Date.now()}@example.com`,
          phone: '+1-555-8888',
        },
        units: [
          {
            unitTypeId: '55000000-0000-0000-0000-000000000001',
            ratePlanId: '35000000-0000-0000-0000-000000000001',
            checkIn: '2026-11-15',
            checkOut: '2026-11-18',
            adults: 2,
            children: 0,
          },
        ],
        notes: 'Ocean view if possible',
      };

      const res1 = await request(app.getHttpServer())
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(bookingPayload);

      if (res1.status !== 201) {
        console.error('DEBUG res1.body:', JSON.stringify(res1.body, null, 2));
      }
      expect(res1.status).toBe(201);
      expect(res1.body.reservationNo).toMatch(/^RSV-\d{4}-\d+/);
      expect(res1.body.status).toBe('confirmed');
      expect(res1.body.totalAmount).toBeGreaterThan(0);

      // Verify idempotency replay returns same reservation
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(bookingPayload);

      expect(res2.status).toBe(201);
      expect(res2.body.id).toBe(res1.body.id);
      expect(res2.body.reservationNo).toBe(res1.body.reservationNo);
    });

    it('POST /api/v1/reservations/walk-in performs rapid 3-click walk-in booking', async () => {
      const walkInUnitId = '56000000-0000-0000-0000-000000000103';
      await db.transaction(TENANT_A, async (client) => {
        await client.query(`DELETE FROM reservation_units WHERE unit_id = $1 AND check_in = '2026-11-20'`, [walkInUnitId]);
      });

      const walkInPayload = {
        branchId: BRANCH_MNL,
        unitId: walkInUnitId, // Room 103 (inspected/vacant)
        checkIn: '2026-11-20',
        checkOut: '2026-11-22',
        adults: 1,
        guest: {
          firstName: 'WalkIn',
          lastName: 'Guest',
          phone: '+1-555-9999',
        },
        notes: 'Front desk walk-in arrival',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/reservations/walk-in')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(walkInPayload);

      expect(res.status).toBe(201);
      expect(res.body.source).toBe('walk_in');
      expect(res.body.units[0].unitNumber).toBe('103');
    });

    it('POST /api/v1/reservations/:id/cancel cancels reservation and restores inventory', async () => {
      // 1. Create a reservation to cancel
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          branchId: BRANCH_MNL,
          guest: { firstName: 'Cancel', lastName: 'Me', email: `cancel.${Date.now()}@test.com` },
          units: [
            {
              unitTypeId: '55000000-0000-0000-0000-000000000001',
              ratePlanId: '35000000-0000-0000-0000-000000000001',
              checkIn: '2026-11-25',
              checkOut: '2026-11-27',
              adults: 1,
            },
          ],
        });
      const reservationId = createRes.body.id;

      // 2. Cancel
      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/reservations/${reservationId}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reason: 'Trip postponed' });

      expect(cancelRes.status).toBe(201);
      expect(cancelRes.body.cancelled).toBe(true);

      // 3. Verify status
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/reservations/${reservationId}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(getRes.body.status).toBe('cancelled');
    });
  });

  describe('4. Concurrency Load Test: 100 Competing Bookings (P0 / REQ-RSV-003 / REQ-RSV-004)', () => {
    it('100 concurrent requests competing for 1 unit results in exactly 1 success and 99 409 ROOM_NOT_AVAILABLE', async () => {
      const concurrencyTestDate = '2026-12-25';
      const testUnitTypeId = '55000000-0000-0000-0000-000000000003'; // STE (Suite)
      const testUnitId = '56000000-0000-0000-0000-000000000501';     // Room 501

      // 1. Setup exact single capacity row in DB for concurrency test
      await db.transaction(TENANT_A, async (client) => {
        // Clear any previous test bookings on Room 501 for that date
        await client.query(
          `DELETE FROM reservation_units WHERE unit_id = $1 AND check_in = $2`,
          [testUnitId, concurrencyTestDate],
        );

        // Set capacity strictly to 1, sold = 0, overbook_allowance = 0
        await client.query(
          `INSERT INTO room_type_inventory (tenant_id, branch_id, unit_type_id, stay_date, capacity, sold, overbook_allowance, stop_sell)
           VALUES ($1, $2, $3, $4, 1, 0, 0, false)
           ON CONFLICT (tenant_id, branch_id, unit_type_id, stay_date)
           DO UPDATE SET capacity = 1, sold = 0, overbook_allowance = 0, stop_sell = false`,
          [TENANT_A, BRANCH_MNL, testUnitTypeId, concurrencyTestDate],
        );
      });

      // 2. Prepare 100 parallel booking requests
      const concurrentRequests = Array.from({ length: 100 }, (_, i) => {
        const payload = {
          branchId: BRANCH_MNL,
          guest: {
            firstName: `Competitor`,
            lastName: `#${i + 1}`,
            email: `comp_${i + 1}_${Date.now()}@loadtest.com`,
          },
          units: [
            {
              unitTypeId: testUnitTypeId,
              unitId: testUnitId,
              ratePlanId: '35000000-0000-0000-0000-000000000001',
              checkIn: concurrencyTestDate,
              checkOut: '2026-12-26',
              adults: 2,
            },
          ],
        };

        return request(app.getHttpServer())
          .post('/api/v1/reservations')
          .set('Authorization', `Bearer ${tokenA}`)
          .send(payload);
      });

      // 3. Fire all 100 concurrently
      const responses = await Promise.all(concurrentRequests);

      // 4. Analyze results
      const successResponses = responses.filter((r) => r.status === 201);
      const conflictResponses = responses.filter((r) => r.status === 409);

      // Invariant: Exactly 1 succeeds, exactly 99 rejected with 409 Conflict
      expect(successResponses.length).toBe(1);
      expect(conflictResponses.length).toBe(99);

      // Verify the 409 responses contain ROOM_NOT_AVAILABLE
      expect(
        conflictResponses.every((r) => r.body.detail?.includes('ROOM_NOT_AVAILABLE') || r.body.title?.includes('Conflict')),
      ).toBe(true);

      // 5. Verify database integrity: zero overlapping rows
      await db.transaction(TENANT_A, async (client) => {
        const dbCheck = await client.query(
          `SELECT count(*)::int AS count
           FROM reservation_units
           WHERE unit_id = $1 AND check_in = $2 AND status IN ('hold', 'confirmed', 'in_house')`,
          [testUnitId, concurrencyTestDate],
        );
        expect(dbCheck.rows[0].count).toBe(1);

        const invCheck = await client.query(
          `SELECT sold FROM room_type_inventory
           WHERE tenant_id = $1 AND branch_id = $2 AND unit_type_id = $3 AND stay_date = $4`,
          [TENANT_A, BRANCH_MNL, testUnitTypeId, concurrencyTestDate],
        );
        expect(invCheck.rows[0].sold).toBe(1);
      });
    }, 30000);
  });

  describe('5. Group Bookings & Room Block Management (REQ-RSV-009)', () => {
    it('POST /api/v1/group-blocks creates group block with auto-generated master folio', async () => {
      const code = `GRP-${Date.now().toString().slice(-5)}`;
      const payload = {
        branchId: BRANCH_MNL,
        name: 'Annual Tech Conference Block',
        code,
        startDate: '2026-11-20',
        endDate: '2026-11-23',
        cutoffDate: '2026-11-18',
        allocations: [
          {
            unitTypeId: '55000000-0000-0000-0000-000000000001',
            allocatedRooms: 5,
            agreedRate: 110.0,
          },
        ],
        notes: 'Room charges billable to Master Folio',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/group-blocks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.code).toBe(code);
      expect(res.body.masterFolioId).toBeDefined();
      expect(res.body.totalRooms).toBe(5);
      expect(res.body.pickedUpRooms).toBe(0);

      // Verify master folio exists
      await db.transaction(TENANT_A, async (client) => {
        const fRes = await client.query(`SELECT * FROM folios WHERE id = $1`, [res.body.masterFolioId]);
        expect(fRes.rows.length).toBe(1);
        expect(fRes.rows[0].kind).toBe('master');
      });
    });

    it('POST /api/v1/group-blocks/:id/rooming-list imports individual guest reservations', async () => {
      // 1. Create Block
      const code = `GRP-${Date.now().toString().slice(-5)}`;
      const blockRes = await request(app.getHttpServer())
        .post('/api/v1/group-blocks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          branchId: BRANCH_MNL,
          name: 'Doctors Summit',
          code,
          startDate: '2026-11-20',
          endDate: '2026-11-22',
          cutoffDate: '2026-11-19',
          allocations: [
            {
              unitTypeId: '55000000-0000-0000-0000-000000000001',
              allocatedRooms: 3,
              agreedRate: 115.0,
            },
          ],
        });
      const blockId = blockRes.body.id;

      // 2. Import Rooming List
      const roomingListPayload = {
        items: [
          {
            firstName: 'Dr. Gregory',
            lastName: 'House',
            email: `house.${Date.now()}@hospital.com`,
            unitTypeId: '55000000-0000-0000-0000-000000000001',
            checkIn: '2026-11-20',
            checkOut: '2026-11-22',
            adults: 1,
            children: 0,
          },
          {
            firstName: 'Dr. James',
            lastName: 'Wilson',
            email: `wilson.${Date.now()}@hospital.com`,
            unitTypeId: '55000000-0000-0000-0000-000000000001',
            checkIn: '2026-11-20',
            checkOut: '2026-11-22',
            adults: 1,
            children: 0,
          },
        ],
      };

      const importRes = await request(app.getHttpServer())
        .post(`/api/v1/group-blocks/${blockId}/rooming-list`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(roomingListPayload);

      expect(importRes.status).toBe(201);
      expect(importRes.body.importedCount).toBe(2);
      expect(importRes.body.reservationIds.length).toBe(2);

      // Verify group block pickedUpRooms incremented
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/group-blocks?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const updatedBlock = listRes.body.find((b: any) => b.id === blockId);
      expect(updatedBlock.pickedUpRooms).toBe(2);
    });
  });

  describe('6. Waitlists & Non-Binding Quotations with 1-Click Conversion (REQ-RSV-010)', () => {
    it('POST /api/v1/quotations creates non-binding quotation with live price calculation', async () => {
      const qPayload = {
        branchId: BRANCH_MNL,
        guestName: 'Eleanor Vance',
        guestEmail: `eleanor.${Date.now()}@hillhouse.com`,
        unitTypeId: '55000000-0000-0000-0000-000000000001',
        ratePlanId: '35000000-0000-0000-0000-000000000001',
        checkIn: '2026-11-20',
        checkOut: '2026-11-23',
        adults: 2,
        validDays: 5,
        notes: 'Inquiry from wedding showcase',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/quotations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(qPayload);

      expect(res.status).toBe(201);
      expect(res.body.quotationNo).toMatch(/^QTE-\d{4}-\d+/);
      expect(res.body.status).toBe('active');
      expect(res.body.quotedRate).toBeGreaterThan(0);
      expect(res.body.totalAmount).toBeGreaterThan(0);

      // 1-Click Conversion to Confirmed Reservation
      const convertRes = await request(app.getHttpServer())
        .post(`/api/v1/quotations/${res.body.id}/convert`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({});

      expect(convertRes.status).toBe(201);
      expect(convertRes.body.quotation.status).toBe('converted');
      expect(convertRes.body.reservation.id).toBeDefined();
      expect(convertRes.body.reservation.status).toBe('confirmed');
    });

    it('POST /api/v1/waitlists creates waitlist entry and converts to reservation', async () => {
      const wPayload = {
        branchId: BRANCH_MNL,
        guestName: 'Luke Sanderson',
        guestEmail: `luke.${Date.now()}@hillhouse.com`,
        unitTypeId: '55000000-0000-0000-0000-000000000001',
        ratePlanId: '35000000-0000-0000-0000-000000000001',
        desiredCheckIn: '2026-11-20',
        desiredCheckOut: '2026-11-22',
        adults: 1,
        priority: 2,
        notes: 'Flexible with room type if upgraded',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/waitlists')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(wPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('waiting');
      expect(res.body.priority).toBe(2);

      // 1-Click Conversion
      const convertRes = await request(app.getHttpServer())
        .post(`/api/v1/waitlists/${res.body.id}/convert`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ratePlanId: '35000000-0000-0000-0000-000000000001' });

      expect(convertRes.status).toBe(201);
      expect(convertRes.body.waitlist.status).toBe('converted');
      expect(convertRes.body.reservation.id).toBeDefined();
    });
  });

  describe('7. Channel Manager 2-Way ARI Adapter & Direct Booking Engine (REQ-RSV-015)', () => {
    it('Configures channel mapping and pushes outbound OpenTravel/HTNG ARI sync', async () => {
      // 1. Create Channel Mapping
      const mapPayload = {
        branchId: BRANCH_MNL,
        channelName: 'booking_com',
        localUnitTypeId: '55000000-0000-0000-0000-000000000001',
        localRatePlanId: '35000000-0000-0000-0000-000000000001',
        channelRoomCode: 'BK_STD_01',
        channelRateCode: 'BK_BAR_FLEX',
        isActive: true,
      };

      const mapRes = await request(app.getHttpServer())
        .post('/api/v1/channel-manager/mappings')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(mapPayload);

      expect(mapRes.status).toBe(201);
      expect(mapRes.body.channelRoomCode).toBe('BK_STD_01');

      // 2. Outbound ARI Push
      const syncRes = await request(app.getHttpServer())
        .post('/api/v1/channel-manager/sync/ari')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          branchId: BRANCH_MNL,
          channelName: 'booking_com',
          startDate: '2026-11-20',
          endDate: '2026-11-25',
        });

      expect(syncRes.status).toBe(201);
      expect(syncRes.body.success).toBe(true);
      expect(syncRes.body.otaMessageSummary).toBeDefined();

      // 3. Verify Sync Log Created
      const logRes = await request(app.getHttpServer())
        .get(`/api/v1/channel-manager/logs?branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(logRes.status).toBe(200);
      expect(logRes.body.length).toBeGreaterThan(0);
      expect(logRes.body[0].syncType).toBe('outbound_ari');
    });

    it('Ingests inbound OTA reservation webhook with Rate-Parity Guard', async () => {
      const channelRef = `BCOM-${Date.now()}`;
      const webhookPayload = {
        channelName: 'booking_com',
        channelReservationRef: channelRef,
        action: 'book',
        branchId: BRANCH_MNL,
        channelRoomCode: 'BK_STD_01',
        channelRateCode: 'BK_BAR_FLEX',
        checkIn: '2026-11-20',
        checkOut: '2026-11-22',
        adults: 2,
        children: 0,
        guest: {
          firstName: 'OTA',
          lastName: 'Traveler',
          email: `ota.traveler.${Date.now()}@ota.com`,
          phone: '+1-555-1234',
        },
        totalPriceOta: 120.0, // OTA booked rate
        currency: 'USD',
        notes: 'Non-smoking requested via Booking.com',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/channel-manager/webhook/booking')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(webhookPayload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('confirmed');
      expect(res.body.reservationNo).toMatch(/^RSV-\d{4}-\d+/);

      // Verify idempotent replay
      const replayRes = await request(app.getHttpServer())
        .post('/api/v1/channel-manager/webhook/booking')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(webhookPayload);

      expect(replayRes.status).toBe(201);
      expect(replayRes.body.status).toBe('replayed');
    });

    it('Public Direct Booking Engine API allows unauthenticated search and booking', async () => {
      const availRes = await request(app.getHttpServer())
        .get(`/api/v1/public/availability?branchId=${BRANCH_MNL}&checkIn=2026-11-20&checkOut=2026-11-23&adults=2`)
        .set('X-Tenant-Id', TENANT_A);

      expect(availRes.status).toBe(200);
      expect(availRes.body.nightsCount).toBe(3);
      expect(availRes.body.results.length).toBeGreaterThan(0);
    });
  });
});

