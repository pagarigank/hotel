import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuthStore } from './useAuthStore';
import { useAppStore } from './useAppStore';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const LOGIN_SUCCESS = {
  accessToken: 'header.payload.sig',
  refreshToken: 'refresh-token-value',
  expiresIn: 900,
  user: { id: '10000000-0000-0000-0000-000000000001', email: 'admin@acme.com', name: 'Acme Admin' },
  tenant: {
    id: 'a0000000-0000-0000-0000-000000000001',
    slug: 'acme-hotel',
    name: 'Acme Grand Hotel',
    plan: 'enterprise',
    active: true,
    createdAt: new Date().toISOString(),
  },
  permittedBranches: [
    {
      id: 'b0000000-0000-0000-0000-000000000001',
      code: 'MNL-MAIN',
      name: 'Manila Main Hotel',
      timezone: 'Asia/Manila',
      base_currency: 'PHP',
      business_date: '2026-10-12',
    },
  ],
  roles: ['admin'],
  permissions: ['*'],
};

describe('useAuthStore IAM session invariants', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'idle',
      user: null,
      roles: [],
      permissions: [],
      error: null,
    });
    useAppStore.getState().setTenant('a0000000-0000-0000-0000-000000000001', 'Acme Grand Hotel');
    useAppStore.getState().setBranch('b0000000-0000-0000-0000-000000000001', 'Manila Main Hotel');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('login authenticates and syncs tenant/branch scope into the app store', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/csrf'))
        return jsonResponse({ token: 'csrf-token-abcdefghij' });
      if (url.endsWith('/api/v1/auth/login')) return jsonResponse(LOGIN_SUCCESS, 201);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await useAuthStore.getState().login('admin@acme.com', 'Password123!');

    const auth = useAuthStore.getState();
    expect(auth.status).toBe('authenticated');
    expect(auth.user?.email).toBe('admin@acme.com');
    expect(auth.hasPermission('anything.at.all')).toBe(true);
    expect(useAppStore.getState().activeTenantName).toBe('Acme Grand Hotel');
    expect(useAppStore.getState().activeBranchName).toBe('Manila Main Hotel');
  });

  it('login records an error and stays anonymous on invalid credentials', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/csrf'))
        return jsonResponse({ token: 'csrf-token-abcdefghij' });
      if (url.endsWith('/api/v1/auth/login')) {
        return jsonResponse(
          { title: 'Unauthorized', detail: 'Invalid credentials', code: 'UNAUTHORIZED' },
          401,
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(useAuthStore.getState().login('admin@acme.com', 'wrong')).rejects.toThrow();
    const auth = useAuthStore.getState();
    expect(auth.status).toBe('anonymous');
    expect(auth.error).toBe('Invalid credentials');
  });

  it('boot falls back to anonymous when the refresh cookie is absent', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/csrf'))
        return jsonResponse({ token: 'csrf-token-abcdefghij' });
      if (url.endsWith('/api/v1/auth/refresh')) return jsonResponse({ title: 'Unauthorized' }, 401);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await useAuthStore.getState().boot();

    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('hasPermission denies unpermitted keys without the wildcard', () => {
    useAuthStore.setState({ permissions: ['frontdesk.stay.checkin'] });
    expect(useAuthStore.getState().hasPermission('frontdesk.stay.checkin')).toBe(true);
    expect(useAuthStore.getState().hasPermission('accounting.voucher.post')).toBe(false);
    expect(useAuthStore.getState().hasPermission(undefined)).toBe(true);
  });
});
