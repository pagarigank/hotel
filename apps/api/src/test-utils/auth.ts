import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

export interface TestSession {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  branchId?: string;
  user: { id: string; email: string; name: string };
  roles: string[];
  permissions: string[];
}

/**
 * Logs in as a seeded demo user and returns the session material tests need to
 * authenticate. Global guards derive identity from the verified access token,
 * so tests must present `Authorization: Bearer <token>` instead of identity
 * headers.
 */
export async function loginAs(
  app: INestApplication,
  email: string,
  password = 'Password123!',
): Promise<TestSession> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });

  if (res.status !== 201) {
    throw new Error(`loginAs(${email}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    tenantId: res.body.tenant?.id,
    branchId: res.body.permittedBranches?.[0]?.id,
    user: res.body.user,
    roles: res.body.roles ?? [],
    permissions: res.body.permissions ?? [],
  };
}
