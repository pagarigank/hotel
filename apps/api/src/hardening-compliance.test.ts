import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import crypto from 'node:crypto';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './kernel/errors/problem-filter.js';
import { loginAs } from './test-utils/auth.js';
import { DatabaseService } from './kernel/database/database.service.js';

describe('Phase 8: Hardening, Observability, Reporting & GDPR Compliance Test Suite', () => {
  let app: INestApplication;
  let tokenA = '';
  let db: DatabaseService;
  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const BRANCH_MNL = 'b0000000-0000-0000-0000-000000000001';
  const USER_ID = '10000000-0000-0000-0000-000000000001';

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
  // SECTION 1: EXECUTIVE DASHBOARD & REAL-TIME KPIS (REQ-AUD-004, REQ-FNB-011)
  // ==========================================================================
  describe('1. Executive Dashboard & Real-Time KPIs', () => {
    it('GET /api/v1/reporting/dashboard/kpis returns calculated hotel & F&B metrics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reporting/dashboard/kpis')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ branchId: BRANCH_MNL });
      if (res.status !== 200) console.error('TEST 1 FAIL:', res.body);
      expect(res.status).toBe(200);

      expect(res.body).toHaveProperty('occupancyRate');
      expect(res.body).toHaveProperty('adr');
      expect(res.body).toHaveProperty('revpar');
      expect(res.body).toHaveProperty('trevpar');
      expect(res.body).toHaveProperty('roomsRevenue');
      expect(res.body).toHaveProperty('fnbRevenue');
      expect(res.body).toHaveProperty('totalRevenue');
      expect(res.body).toHaveProperty('fnbCovers');
      expect(res.body).toHaveProperty('outstandingGuestBalance');
      expect(res.body).toHaveProperty('nightAuditStatus');

      expect(typeof res.body.occupancyRate).toBe('number');
      expect(typeof res.body.adr).toBe('number');
      expect(typeof res.body.revpar).toBe('number');
      expect(typeof res.body.trevpar).toBe('number');
      expect(res.body.nightAuditStatus).toHaveProperty('currentBusinessDate');
    });
  });

  // ==========================================================================
  // SECTION 2: FRONT-OFFICE REPORTING PACK
  // ==========================================================================
  describe('2. Front-Office Reporting Pack', () => {
    it('GET /api/v1/reporting/flash-report returns Daily Flash Report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reporting/flash-report')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ branchId: BRANCH_MNL })
        .expect(200);

      expect(res.body).toHaveProperty('businessDate');
      expect(res.body).toHaveProperty('rooms');
      expect(res.body.rooms).toHaveProperty('occupancyPct');
      expect(res.body.rooms).toHaveProperty('adr');
      expect(res.body.rooms).toHaveProperty('revpar');
      expect(res.body).toHaveProperty('fnb');
      expect(res.body).toHaveProperty('ledgerSummary');
      expect(res.body.ledgerSummary).toHaveProperty('guestLedgerBeginning');
      expect(res.body.ledgerSummary).toHaveProperty('guestLedgerEnding');
      expect(res.body).toHaveProperty('mtd');
    });

    it('GET /api/v1/reporting/in-house-guests returns in-house guest ledger snapshot', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reporting/in-house-guests')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ branchId: BRANCH_MNL })
        .expect(200);

      expect(res.body).toHaveProperty('totalGuests');
      expect(res.body).toHaveProperty('totalBalance');
      expect(Array.isArray(res.body.records)).toBe(true);
    });

    it('GET /api/v1/reporting/arrivals-departures returns expected movement lists', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reporting/arrivals-departures')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ branchId: BRANCH_MNL })
        .expect(200);

      expect(res.body).toHaveProperty('date');
      expect(Array.isArray(res.body.arrivals)).toBe(true);
      expect(Array.isArray(res.body.departures)).toBe(true);
    });

    it('GET /api/v1/reporting/room-status-summary returns housekeeping & front office cross-tab', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reporting/room-status-summary')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ branchId: BRANCH_MNL })
        .expect(200);

      expect(res.body).toHaveProperty('cleanVacant');
      expect(res.body).toHaveProperty('cleanOccupied');
      expect(res.body).toHaveProperty('dirtyVacant');
      expect(res.body).toHaveProperty('dirtyOccupied');
      expect(res.body).toHaveProperty('totalUnits');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  // ==========================================================================
  // SECTION 3: ASYNCHRONOUS REPORT ENGINE (202 ACCEPTED & STREAMING)
  // ==========================================================================
  describe('3. Asynchronous Report Engine', () => {
    let reportJobId: string;

    it('POST /api/v1/reporting/jobs returns 202 Accepted with job descriptor', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/reporting/jobs')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          reportType: 'daily_flash',
          branchId: BRANCH_MNL,
          format: 'csv',
        })
        .expect(202);

      expect(res.body).toHaveProperty('id');
      expect(res.body.reportType).toBe('daily_flash');
      expect(res.body.format).toBe('csv');
      reportJobId = res.body.id;
    });

    it('GET /api/v1/reporting/jobs lists report jobs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reporting/jobs')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((j: any) => j.id === reportJobId)).toBe(true);
    });

    it('GET /api/v1/reporting/jobs/:id verifies job completed status', async () => {
      // Small pause to allow async processing to finish
      await new Promise((r) => setTimeout(r, 200));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/reporting/jobs/${reportJobId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.id).toBe(reportJobId);
      expect(res.body.status).toBe('completed');
      expect(res.body.fileUrl).toContain(`/api/v1/reporting/jobs/${reportJobId}/download`);
    });

    it('GET /api/v1/reporting/jobs/:id/download streams CSV content with proper attachment header', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reporting/jobs/${reportJobId}/download`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment; filename=');
      expect(res.text).toContain('Metric,Value');
      expect(res.text).toContain('Business Date');
    });
  });

  // ==========================================================================
  // SECTION 4: PRIVACY & DATA GOVERNANCE (GDPR / PHILIPPINE DPA REQ-GST-004)
  // ==========================================================================
  describe('4. Privacy & Data Governance (GDPR / DPA Compliance)', () => {
    const testGuestId = crypto.randomUUID();
    const settledGuestId = crypto.randomUUID();

    beforeAll(async () => {
      // Seed test guests
      await db.withTenantConnection(TENANT_A, undefined, async (client) => {
        // Find an active unit for test stays
        const uRes = await client.query(`SELECT id FROM units WHERE tenant_id = $1 LIMIT 1`, [TENANT_A]);
        const unitId = uRes.rows[0]?.id;

        // Guest 1: With open unsettled folio (cannot be erased)
        const guest1Hash = 'hash_vane_' + crypto.randomUUID().slice(0, 8);
        await client.query(
          `INSERT INTO guests (id, tenant_id, first_name, last_name, email, phone, nationality)
           VALUES ($1, $2, 'Eleanor', 'Vane', 'eleanor.vane@example.com', '+639171234567', 'PH')`,
          [testGuestId, TENANT_A],
        );
        await client.query(
          `INSERT INTO guest_prefs (id, tenant_id, guest_id, category, preference)
           VALUES ($1, $2, $3, 'room', 'High floor, away from elevator')`,
          [crypto.randomUUID(), TENANT_A, testGuestId],
        );
        await client.query(
          `INSERT INTO guest_identifications (id, tenant_id, guest_id, id_type, id_number_hash, id_number_encrypted, issuing_country)
           VALUES ($1, $2, $3, 'passport', $4, 'enc_vane_123', 'PH')`,
          [crypto.randomUUID(), TENANT_A, testGuestId, guest1Hash],
        );
        // Create an open reservation and folio with $150 balance for Guest 1
        const res1Id = crypto.randomUUID();
        await client.query(
          `INSERT INTO reservations (id, tenant_id, branch_id, reservation_no, status, guest_id)
           VALUES ($1, $2, $3, $4, 'confirmed', $5)`,
          [res1Id, TENANT_A, BRANCH_MNL, 'RES-' + crypto.randomUUID().slice(0, 8), testGuestId],
        );
        await client.query(
          `INSERT INTO folios (id, tenant_id, branch_id, folio_no, reservation_id, status, currency, total_charges, total_payments, balance)
           VALUES ($1, $2, $3, $4, $5, 'open', 'USD', 150.0000, 0.0000, 150.0000)`,
          [crypto.randomUUID(), TENANT_A, BRANCH_MNL, 'FOL-' + crypto.randomUUID().slice(0, 8), res1Id],
        );

        // Guest 2: Clean settled guest (can be erased)
        const guest2Hash = 'hash_marcus_' + crypto.randomUUID().slice(0, 8);
        await client.query(
          `INSERT INTO guests (id, tenant_id, first_name, last_name, email, phone, nationality)
           VALUES ($1, $2, 'Marcus', 'Aurelius', 'marcus.aurelius@stoic.org', '+639177654321', 'IT')`,
          [settledGuestId, TENANT_A],
        );
        await client.query(
          `INSERT INTO guest_prefs (id, tenant_id, guest_id, category, preference)
           VALUES ($1, $2, $3, 'dietary', 'Vegan, sparkling water')`,
          [crypto.randomUUID(), TENANT_A, settledGuestId],
        );
        await client.query(
          `INSERT INTO guest_identifications (id, tenant_id, guest_id, id_type, id_number_hash, id_number_encrypted, issuing_country)
           VALUES ($1, $2, $3, 'national_id', $4, 'enc_marcus_999', 'IT')`,
          [crypto.randomUUID(), TENANT_A, settledGuestId, guest2Hash],
        );
        // Create a settled closed reservation and folio with $0 balance for Guest 2
        const res2Id = crypto.randomUUID();
        await client.query(
          `INSERT INTO reservations (id, tenant_id, branch_id, reservation_no, status, guest_id)
           VALUES ($1, $2, $3, $4, 'checked_out', $5)`,
          [res2Id, TENANT_A, BRANCH_MNL, 'RES-' + crypto.randomUUID().slice(0, 8), settledGuestId],
        );
        await client.query(
          `INSERT INTO folios (id, tenant_id, branch_id, folio_no, reservation_id, status, currency, total_charges, total_payments, balance)
           VALUES ($1, $2, $3, $4, $5, 'closed', 'USD', 200.0000, 200.0000, 0.0000)`,
          [crypto.randomUUID(), TENANT_A, BRANCH_MNL, 'FOL-' + crypto.randomUUID().slice(0, 8), res2Id],
        );
      });
    });

    it('GET /api/v1/compliance/gdpr/export/:guestId returns complete personal data export (SAR)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/compliance/gdpr/export/${testGuestId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.guestId).toBe(testGuestId);
      expect(res.body.personalInfo.firstName).toBe('Eleanor');
      expect(res.body.personalInfo.lastName).toBe('Vane');
      expect(res.body.personalInfo.email).toBe('eleanor.vane@example.com');
      expect(res.body.identifications.length).toBeGreaterThan(0);
      expect(res.body.preferences.length).toBeGreaterThan(0);
      expect(res.body.folios.length).toBeGreaterThan(0);
      expect(res.body).toHaveProperty('exportedAt');
    });

    it('POST /api/v1/compliance/gdpr/erase/:guestId blocks erasure if guest has unsettled folios', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/compliance/gdpr/erase/${testGuestId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          reason: 'Guest requested erasure via email',
          confirmConsent: true,
        })
        .expect(400);

      expect(res.body.detail || res.body.message).toMatch(/unsettled balances|open folio/i);
    });

    it('POST /api/v1/compliance/gdpr/erase/:guestId pseudonymizes guest and clears PII while preserving financial history', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/compliance/gdpr/erase/${settledGuestId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          reason: 'Right to erasure invoked by data subject',
          confirmConsent: true,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.pseudonymizedId).toMatch(/^DELETED_GUEST_[a-f0-9]+$/);

      // Verify database record has been pseudonymized
      await db.withTenantConnection(TENANT_A, undefined, async (client) => {
        const gRes = await client.query(`SELECT * FROM guests WHERE id = $1`, [settledGuestId]);
        const g = gRes.rows[0];
        expect(g.first_name).toBe('ERASED');
        expect(g.last_name).toBe(res.body.pseudonymizedId);
        expect(g.email).toBeNull();
        expect(g.phone).toBeNull();
        expect(g.is_pseudonymized).toBe(true);

        // Verify preferences and identifications are purged
        const prefRes = await client.query(`SELECT * FROM guest_prefs WHERE guest_id = $1`, [settledGuestId]);
        expect(prefRes.rows.length).toBe(0);

        const idRes = await client.query(`SELECT * FROM guest_identifications WHERE guest_id = $1`, [settledGuestId]);
        expect(idRes.rows.length).toBe(0);

        // Verify closed folio and financial history remain intact
        const folioRes = await client.query(
          `SELECT f.* FROM folios f JOIN reservations r ON r.id = f.reservation_id WHERE r.guest_id = $1`,
          [settledGuestId],
        );
        expect(folioRes.rows.length).toBe(1);
        expect(folioRes.rows[0].status).toBe('closed');
      });
    });

    it('GET /api/v1/compliance/gdpr/audit-logs logs immutable audit records for export and erasure', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/compliance/gdpr/audit-logs')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((l: any) => l.action === 'data_export')).toBe(true);
      expect(res.body.some((l: any) => l.action === 'pseudonymized_erasure')).toBe(true);
    });
  });
});
