import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './kernel/errors/problem-filter.js';
import { loginAs } from './test-utils/auth.js';
import { uuidv7 } from 'uuidv7';

describe('Innkeeper API Kernel & Vertical Slice E2E Test', () => {
  let app: INestApplication;
  let tokenA = '';
  let tokenB = '';
  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const TENANT_B = 'a0000000-0000-0000-0000-000000000002';

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

  it('GET /health/live returns UP status', async () => {
    const res = await request(app.getHttpServer()).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.uptime).toBeTypeOf('number');
  });

  it('GET /health/ready connects to PostgreSQL as innkeeper_app', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.database.connected).toBe(true);
    expect(res.body.database.user).toBe('innkeeper_app');
  });

  it('POST /api/v1/test-records creates a record within Tenant A context', async () => {
    const title = `E2E Test Record ${Date.now()}`;
    const idempotencyKey = uuidv7();

    const res = await request(app.getHttpServer())
      .post('/api/v1/test-records')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title, content: 'E2E testing content' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe(title);
    expect(res.body.tenantId).toBe(TENANT_A);
    expect(res.body.id).toBeDefined();

    // Verify Idempotency replay with same key returns the exact same result
    const replayRes = await request(app.getHttpServer())
      .post('/api/v1/test-records')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title, content: 'E2E testing content' });

    expect(replayRes.status).toBe(201);
    expect(replayRes.body.id).toBe(res.body.id);
  });

  it('Reusing Idempotency-Key with conflicting payload returns 422 problem+json', async () => {
    const idempotencyKey = uuidv7();

    // First request
    await request(app.getHttpServer())
      .post('/api/v1/test-records')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: 'Original Payload', content: 'v1' });

    // Conflicting request with different payload
    const conflictRes = await request(app.getHttpServer())
      .post('/api/v1/test-records')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: 'Conflicting Payload', content: 'v2' });

    expect(conflictRes.status).toBe(422);
    expect(conflictRes.headers['content-type']).toContain('application/problem+json');
    expect(conflictRes.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('Enforces Tenant RLS boundary across API requests', async () => {
    const uniqueTitle = `Tenant A Secret ${uuidv7()}`;

    // 1. Create record as Tenant A
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/test-records')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: uniqueTitle, content: 'Top Secret' });

    expect(createRes.status).toBe(201);
    const recordId = createRes.body.id;

    // 2. Query list as Tenant B: must not include Tenant A's record
    const listB = await request(app.getHttpServer())
      .get('/api/v1/test-records')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(listB.status).toBe(200);
    const foundInB = listB.body.find((r: any) => r.id === recordId);
    expect(foundInB).toBeUndefined();

    // 3. Query specific ID as Tenant B: returns 404 RECORD_NOT_FOUND (RLS filtered)
    const singleB = await request(app.getHttpServer())
      .get(`/api/v1/test-records/${recordId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(singleB.status).toBe(404);
    expect(singleB.headers['content-type']).toContain('application/problem+json');
    expect(singleB.body.code).toBe('RECORD_NOT_FOUND');
  });

  it('Returns RFC 7807 problem+json on validation failure', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test-records')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: '' }); // Invalid: title min length is 1

    expect(res.status).toBe(422);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.invalidParams).toBeDefined();
    expect(res.body.invalidParams.length).toBeGreaterThan(0);
  });
});
