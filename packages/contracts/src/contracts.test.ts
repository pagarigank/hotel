import { describe, it, expect } from 'vitest';
import { ProblemErrorSchema, TenantSchema, BranchSchema } from './index.js';

describe('Contracts & DTOs Validation', () => {
  it('validates RFC 7807 ProblemError structure', () => {
    const err = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      code: 'ROOM_NOT_AVAILABLE',
      correlationId: '01a12bcf-13ec-7665-b2cb-9987acf9c707',
      detail: 'Unit is occupied',
    };
    expect(() => ProblemErrorSchema.parse(err)).not.toThrow();
  });

  it('validates Tenant DTO', () => {
    const tenant = {
      id: 'a0000000-0000-0000-0000-000000000001',
      slug: 'acme-hotel',
      name: 'Acme Grand Hotel',
      plan: 'enterprise',
      active: true,
      createdAt: new Date().toISOString(),
    };
    expect(() => TenantSchema.parse(tenant)).not.toThrow();
  });

  it('validates Branch DTO with business date', () => {
    const branch = {
      id: 'b0000000-0000-0000-0000-000000000001',
      tenantId: 'a0000000-0000-0000-0000-000000000001',
      code: 'MNL-MAIN',
      name: 'Manila Main Hotel',
      timezone: 'Asia/Manila',
      baseCurrency: 'PHP',
      businessDate: '2026-10-12',
      active: true,
    };
    expect(() => BranchSchema.parse(branch)).not.toThrow();
  });
});
