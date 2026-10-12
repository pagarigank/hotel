/**
 * Thin fetch wrapper around the Innkeeper API.
 *
 * Maintains a module-level auth snapshot (access token is memory-only; the
 * rotating refresh token lives in an httpOnly cookie set by the backend) and
 * transparently handles:
 *  - Authorization / X-Tenant-Id / X-Branch-Id / X-User-Id headers
 *  - CSRF double-submit header (x-csrf-token) on mutating requests
 *  - One-shot 401 -> refresh -> retry using the refresh cookie
 *
 * The Zustand auth store syncs the snapshot via setAuthSnapshot()/clearAuthSnapshot()
 * and registers the unauthorized handler; http.ts never imports the store to
 * avoid a circular dependency.
 */

export interface AuthSnapshot {
  accessToken?: string;
  csrfToken?: string;
  userId?: string;
  tenantId?: string;
  branchId?: string;
}

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001';
const DEFAULT_BRANCH_ID = 'b0000000-0000-0000-0000-000000000001';

let nativeFetch: typeof fetch | null = null;

/**
 * The unpatched fetch. Once installAuthFetch() has run it returns the captured
 * original; otherwise it resolves the global fetch lazily (browser or Node/test).
 */
function getNativeFetch(): typeof fetch {
  if (nativeFetch) return nativeFetch;
  return typeof window !== 'undefined' ? window.fetch.bind(window) : globalThis.fetch;
}

let snapshot: AuthSnapshot = { tenantId: DEFAULT_TENANT_ID, branchId: DEFAULT_BRANCH_ID };
let unauthorizedHandler: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function setAuthSnapshot(update: Partial<AuthSnapshot>): AuthSnapshot {
  snapshot = { ...snapshot, ...update };
  return snapshot;
}

export function getAuthSnapshot(): AuthSnapshot {
  return { ...snapshot };
}

export function clearAuthSnapshot(): void {
  snapshot = { tenantId: DEFAULT_TENANT_ID, branchId: DEFAULT_BRANCH_ID };
}

export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

function buildHeaders(options: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {};
  if (snapshot.accessToken) headers['Authorization'] = `Bearer ${snapshot.accessToken}`;
  if (snapshot.tenantId) headers['X-Tenant-Id'] = snapshot.tenantId;
  if (snapshot.branchId) headers['X-Branch-Id'] = snapshot.branchId;
  if (snapshot.userId) headers['X-User-Id'] = snapshot.userId;

  const method = (options.method ?? 'GET').toUpperCase();
  if (snapshot.csrfToken && !SAFE_METHODS.has(method)) {
    headers['X-CSRF-Token'] = snapshot.csrfToken;
  }
  return headers;
}

function mergeHeaders(
  base: Record<string, string>,
  extra: HeadersInit | undefined,
): Record<string, string> {
  const merged: Record<string, string> = { ...base };
  if (extra) {
    const entries =
      extra instanceof Headers
        ? Array.from(extra.entries())
        : Array.isArray(extra)
          ? extra
          : Object.entries(extra);
    for (const [key, value] of entries) {
      if (value !== undefined && value !== null) {
        merged[key] = String(value);
      }
    }
  }
  return merged;
}

function isAuthPath(path: string): boolean {
  return path.startsWith('/api/v1/auth/');
}

async function toApiError(res: Response): Promise<ApiError> {
  let payload: { title?: string; detail?: string; code?: string; status?: number } | null = null;
  try {
    payload = await res.json();
  } catch {
    // Not JSON; fall back to statusText below.
  }
  const message =
    payload?.detail || payload?.title || res.statusText || `Request failed (${res.status})`;
  return new ApiError(message, res.status, payload?.code);
}

/** Rotates the refresh token via the httpOnly cookie. Resolves true on success. */
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const res = await getNativeFetch()('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return false;
    const data = await res.json();
    snapshot.accessToken = data.accessToken as string | undefined;
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Fetches a fresh CSRF double-submit token (also set as the XSRF-TOKEN cookie). */
export async function ensureCsrfToken(): Promise<string> {
  const data = await apiFetch<{ token: string }>('/api/v1/auth/csrf');
  snapshot.csrfToken = data.token;
  return data.token;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const attempt = async (): Promise<Response> => {
    const body = options.body;
    const headers = mergeHeaders(buildHeaders(options), options.headers);
    let initBody: BodyInit | undefined;
    if (body !== undefined && body !== null) {
      if (typeof body === 'string' || body instanceof FormData || body instanceof URLSearchParams) {
        initBody = body;
      } else {
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
        initBody = JSON.stringify(body);
      }
    }
    return getNativeFetch()(path, {
      ...options,
      method: options.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body: initBody,
    });
  };

  let res = await attempt();

  if (res.status === 401 && !isAuthPath(path)) {
    const ok = await refreshAccessToken();
    if (ok) {
      res = await attempt();
    } else {
      snapshot.accessToken = undefined;
      unauthorizedHandler?.();
    }
  }

  if (!res.ok) {
    throw await toApiError(res);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

let fetchInstalled = false;

/**
 * Patches window.fetch so every same-origin /api request automatically carries
 * the Bearer access token and (for mutating methods) the CSRF double-submit
 * header. This keeps the many legacy components that call fetch() directly
 * authenticated without editing each call site, and no longer relies on
 * trust-me identity headers.
 */
export function installAuthFetch(): void {
  if (fetchInstalled) return;
  nativeFetch = window.fetch.bind(window);
  fetchInstalled = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isApiRequest = url.startsWith('/api/') || url.includes(`${window.location.origin}/api/`);
    if (!isApiRequest) {
      return nativeFetch!(input, init);
    }

    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();

    const build = (): Headers => {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      if (snapshot.accessToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${snapshot.accessToken}`);
      }
      if (snapshot.csrfToken && !SAFE_METHODS.has(method) && !headers.has('X-CSRF-Token')) {
        headers.set('X-CSRF-Token', snapshot.csrfToken);
      }
      return headers;
    };

    let res = await nativeFetch!(input, {
      ...init,
      headers: build(),
      credentials: init?.credentials ?? 'same-origin',
    });

    if (res.status === 401 && !isAuthPath(url)) {
      const ok = await refreshAccessToken();
      if (ok) {
        res = await nativeFetch!(input, {
          ...init,
          headers: build(),
          credentials: init?.credentials ?? 'same-origin',
        });
      } else {
        snapshot.accessToken = undefined;
        unauthorizedHandler?.();
      }
    }

    return res;
  };
}

export function decodeJwtPayload(token: string): {
  sub?: string;
  email?: string;
  tid?: string;
  bids?: string[];
  roles?: string[];
  permissions?: string[];
} | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export interface BranchRef {
  id: string;
  code: string;
  name: string;
  timezone: string;
  base_currency: string;
  business_date: string;
}

export interface LoginSuccess {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; name: string };
  tenant: {
    id: string;
    slug: string;
    name: string;
    plan: string;
    active: boolean;
    createdAt: string;
  };
  permittedBranches: BranchRef[];
  roles: string[];
  permissions: string[];
}

export async function loginRequest(email: string, password: string): Promise<LoginSuccess> {
  return apiFetch<LoginSuccess>('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function logoutRequest(): Promise<void> {
  await apiFetch<{ success: boolean }>('/api/v1/auth/logout', { method: 'POST' });
}

export interface MeSuccess {
  user: { id: string; email: string; name: string };
  tenant: { id: string; slug: string; name: string; plan: string; active: boolean };
  branches: BranchRef[];
  roles: string[];
  permissions: string[];
}

export async function fetchMe(): Promise<MeSuccess> {
  return apiFetch<MeSuccess>('/api/v1/auth/me');
}
