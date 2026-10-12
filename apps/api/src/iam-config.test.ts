import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './kernel/errors/problem-filter.js';
import { loginAs } from './test-utils/auth.js';

describe('Phase 1: IAM & Configuration Engine Integration Tests', () => {
  let app: INestApplication;
  let tokenA = '';
  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const TENANT_B = 'a0000000-0000-0000-0000-000000000002';
  const BRANCH_MNL = 'b0000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
    tokenA = (await loginAs(app, 'admin@acme.com')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('0. Authentication Enforcement (no header-trust identity)', () => {
    it('Rejects protected request without access token with 401 problem+json', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/roles');

      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('Ignores spoofed X-Tenant-Id header and derives tenant from token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Tenant-Id', TENANT_B);

      expect(res.status).toBe(200);
      expect(res.body.tenant.id).toBe(TENANT_A);
    });
  });

  describe('1. Multi-Tenant Authentication & Session Rotation', () => {
    let currentRefreshToken = '';

    it('POST /api/v1/auth/login validates credentials and issues JWT + rotating session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          email: 'admin@acme.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe('admin@acme.com');
      expect(res.body.tenant.id).toBe(TENANT_A);
      expect(res.body.permittedBranches.length).toBeGreaterThan(0);
      expect(res.body.roles).toContain('admin');
      expect(res.body.permissions).toContain('*');

      // Check httpOnly cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('innkeeper_refresh_token');

      currentRefreshToken = res.body.refreshToken;
    });

    it('POST /api/v1/auth/login rejects invalid password with 401 problem+json', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          email: 'admin@acme.com',
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('POST /api/v1/auth/refresh rotates refresh token preventing replay attacks', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ refreshToken: currentRefreshToken });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(currentRefreshToken);

      const rotatedToken = res.body.refreshToken;

      // Old refresh token must now be invalid!
      const replayRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ refreshToken: currentRefreshToken });

      expect(replayRes.status).toBe(401);

      currentRefreshToken = rotatedToken;
    });

    it('GET /api/v1/auth/me returns current user profile and tenant scope', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('admin@acme.com');
      expect(res.body.tenant.name).toBe('Acme Grand Hotel');
      expect(res.body.roles).toContain('admin');
    });

    it('POST /api/v1/auth/logout terminates the session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: currentRefreshToken });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Refresh after logout fails
      const checkRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: currentRefreshToken });

      expect(checkRes.status).toBe(401);
    });
  });

  describe('2. Manager Override Workflow', () => {
    it('POST /api/v1/auth/manager-override authorizes sensitive actions with PIN + audit log', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/manager-override')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          managerEmail: 'admin@acme.com',
          managerPin: '1234',
          reason: 'Compensating guest for delayed check-in',
          action: 'apply_folio_discount',
          discountPct: 20,
        });

      expect(res.status).toBe(201);
      expect(res.body.approved).toBe(true);
      expect(res.body.managerName).toBe('Acme Admin');
      expect(res.body.overrideToken).toBeDefined();
    });

    it('POST /api/v1/auth/manager-override rejects invalid PIN with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/manager-override')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          managerEmail: 'admin@acme.com',
          managerPin: '9999',
          reason: 'Unauthorized discount attempt',
          action: 'apply_folio_discount',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('3. RBAC Roles & Permissions Catalog', () => {
    it('GET /api/v1/roles lists tenant roles', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((r: any) => r.code === 'admin')).toBe(true);
    });

    it('GET /api/v1/permissions returns system permission strings', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.permissions).toContain('frontdesk.stay.checkin');
      expect(res.body.permissions).toContain('folio.charge.post');
      expect(res.body.permissions).toContain('config.settings.update');
    });

    it('POST /api/v1/roles creates a new tenant role', async () => {
      const code = `concierge_${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          code,
          name: 'VIP Concierge',
          permissions: ['frontdesk.stay.checkin', 'reservation.booking.create'],
          limits: { max_discount_pct: 10 },
        });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(code);
      expect(res.body.limits.max_discount_pct).toBe(10);
    });
  });

  describe('4. Settings Registry & Hierarchical Resolution', () => {
    it('Resolves default tenant setting', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/settings/resolve?key=frontdesk.checkin.requireCleanRoom')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.value).toBe('clean');
      expect(res.body.effectiveScope).toBe('tenant');
    });

    it('Branch override takes precedence over tenant setting', async () => {
      // 1. Set branch override
      const putRes = await request(app.getHttpServer())
        .put('/api/v1/settings/frontdesk.checkin.requireCleanRoom')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          scopeType: 'branch',
          scopeId: BRANCH_MNL,
          value: 'inspected',
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.value).toBe('inspected');

      // 2. Resolve for branch -> inspected
      const resolveBranch = await request(app.getHttpServer())
        .get(`/api/v1/settings/resolve?key=frontdesk.checkin.requireCleanRoom&branchId=${BRANCH_MNL}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(resolveBranch.status).toBe(200);
      expect(resolveBranch.body.value).toBe('inspected');
      expect(resolveBranch.body.effectiveScope).toBe('branch');

      // 3. Resolve for tenant without branch -> still clean
      const resolveTenant = await request(app.getHttpServer())
        .get('/api/v1/settings/resolve?key=frontdesk.checkin.requireCleanRoom')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(resolveTenant.status).toBe(200);
      expect(resolveTenant.body.value).toBe('clean');
      expect(resolveTenant.body.effectiveScope).toBe('tenant');
    });
  });

  describe('5. UI Evaluator: Statuses, Actions, Navigation', () => {
    it('GET /api/v1/ui/status-defs returns unit status definitions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ui/status-defs?entity=unit')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(8);

      const vacantClean = res.body.find((s: any) => s.code === 'vacant_clean');
      expect(vacantClean).toBeDefined();
      expect(vacantClean.colorToken).toBe('status-vacant-clean');
      expect(vacantClean.isSellable).toBe(true);
    });

    it('GET /api/v1/ui/actions evaluates state-machine actions for unit status', async () => {
      // For status 'due_in', check-in should be available
      const dueInRes = await request(app.getHttpServer())
        .get('/api/v1/ui/actions?entity=unit&status=due_in')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(dueInRes.status).toBe(200);
      expect(dueInRes.body.some((a: any) => a.code === 'check_in')).toBe(true);
      expect(dueInRes.body.some((a: any) => a.code === 'mark_clean')).toBe(false);

      // For status 'vacant_dirty', mark clean should be available
      const dirtyRes = await request(app.getHttpServer())
        .get('/api/v1/ui/actions?entity=unit&status=vacant_dirty')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(dirtyRes.status).toBe(200);
      expect(dirtyRes.body.some((a: any) => a.code === 'mark_clean')).toBe(true);
      expect(dirtyRes.body.some((a: any) => a.code === 'check_in')).toBe(false);
    });

    it('GET /api/v1/ui/navigation returns server-driven navigation tree', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ui/navigation')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(res.body.items.some((i: any) => i.key === 'frontdesk')).toBe(true);
      expect(res.body.items.some((i: any) => i.key === 'settings')).toBe(true);
    });
  });

  describe('6. Gapless Numbering Sequences', () => {
    it('POST /api/v1/numbering/next generates sequential document numbers', async () => {
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/numbering/next')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          branchId: BRANCH_MNL,
          docType: 'reservation',
        });

      expect(res1.status).toBe(201);
      expect(res1.body.docNumber).toMatch(/^RES-\d{4}-\d{6}$/);
      const seq1 = res1.body.sequenceNo;

      const res2 = await request(app.getHttpServer())
        .post('/api/v1/numbering/next')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          branchId: BRANCH_MNL,
          docType: 'reservation',
        });

      expect(res2.status).toBe(201);
      expect(res2.body.sequenceNo).toBe(seq1 + 1);
    });
  });
});
