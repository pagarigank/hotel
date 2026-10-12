import { create } from 'zustand';
import { useAppStore } from './useAppStore';
import {
  clearAuthSnapshot,
  decodeJwtPayload,
  ensureCsrfToken,
  fetchMe,
  getAuthSnapshot,
  loginRequest,
  logoutRequest,
  refreshAccessToken,
  setAuthSnapshot,
  setUnauthorizedHandler,
  type LoginSuccess,
  type MeSuccess,
} from '../lib/http';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  tenantId: string;
  tenantName: string;
  branchId: string;
  branchName: string;
  businessDate: string;
  roles: string[];
  permissions: string[];
  error: string | null;
  boot: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  forceLogout: () => void;
  hasPermission: (required?: string) => boolean;
}

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001';
const DEFAULT_TENANT_NAME = 'Acme Grand Hotel';
const DEFAULT_BRANCH_ID = 'b0000000-0000-0000-0000-000000000001';
const DEFAULT_BRANCH_NAME = 'Manila Main Hotel';

let bootPromise: Promise<void> | null = null;

const defaultBranchId = (me: MeSuccess, preferred?: string | string[]): string | undefined => {
  const preferredSet = new Set(Array.isArray(preferred) ? preferred : preferred ? [preferred] : []);
  if (preferredSet.size > 0) {
    const match = me.branches.find((b) => preferredSet.has(b.id));
    if (match) return match.id;
  }
  return me.branches[0]?.id;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  user: null,
  tenantId: DEFAULT_TENANT_ID,
  tenantName: DEFAULT_TENANT_NAME,
  branchId: DEFAULT_BRANCH_ID,
  branchName: DEFAULT_BRANCH_NAME,
  businessDate: new Date().toISOString().split('T')[0],
  roles: [],
  permissions: [],
  error: null,

  boot: async () => {
    if (bootPromise) return bootPromise;
    if (get().status === 'authenticated') return;
    bootPromise = (async () => {
      setUnauthorizedHandler(() => useAuthStore.getState().forceLogout());
      set({ status: 'loading', error: null });
      try {
        await ensureCsrfToken();
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          set({ status: 'anonymous' });
          return;
        }
        const token = getAuthSnapshot().accessToken;
        const payload = token ? decodeJwtPayload(token) : null;
        const tenantId = payload?.tid ?? DEFAULT_TENANT_ID;
        setAuthSnapshot({ tenantId, userId: payload?.sub ?? undefined });
        const me = await fetchMe();
        const branchId = defaultBranchId(me, payload?.bids);
        if (branchId) setAuthSnapshot({ branchId });
        const branch = me.branches.find((b) => b.id === branchId);
        useAppStore.getState().setTenant(me.tenant.id, me.tenant.name);
        if (branch) useAppStore.getState().setBranch(branch.id, branch.name);
        set({
          status: 'authenticated',
          user: me.user,
          tenantId: me.tenant.id,
          tenantName: me.tenant.name,
          branchId: branch?.id ?? DEFAULT_BRANCH_ID,
          branchName: branch?.name ?? DEFAULT_BRANCH_NAME,
          businessDate: branch?.business_date ?? new Date().toISOString().split('T')[0],
          roles: me.roles,
          permissions: me.permissions,
          error: null,
        });
      } catch (err) {
        clearAuthSnapshot();
        set({
          status: 'anonymous',
          error: err instanceof Error ? err.message : 'Session could not be restored',
        });
      }
    })().finally(() => {
      bootPromise = null;
    });
    return bootPromise;
  },

  login: async (email, password) => {
    set({ status: 'loading', error: null });
    try {
      await ensureCsrfToken();
      const data = await loginRequest(email, password);
      applyLogin(set, data);
    } catch (err) {
      set({
        status: 'anonymous',
        error: err instanceof Error ? err.message : 'Login failed',
      });
      throw err;
    }
  },

  logout: async () => {
    try {
      await logoutRequest();
    } catch {
      // Session may already be terminated server-side; clear locally regardless.
    } finally {
      clearAuthSnapshot();
      set({
        status: 'anonymous',
        user: null,
        roles: [],
        permissions: [],
        error: null,
        businessDate: new Date().toISOString().split('T')[0],
      });
    }
  },

  forceLogout: () => {
    clearAuthSnapshot();
    set({
      status: 'anonymous',
      user: null,
      roles: [],
      permissions: [],
      error: null,
    });
  },

  hasPermission: (required?: string) => {
    const permissions = get().permissions;
    if (!required) return true;
    return permissions.includes('*') || permissions.includes(required);
  },
}));

function applyLogin(set: (partial: Partial<AuthState>) => void, data: LoginSuccess): void {
  const firstBranch = data.permittedBranches[0];
  setAuthSnapshot({
    accessToken: data.accessToken,
    tenantId: data.tenant.id,
    userId: data.user.id,
    branchId: firstBranch?.id,
  });
  useAppStore.getState().setTenant(data.tenant.id, data.tenant.name);
  if (firstBranch) useAppStore.getState().setBranch(firstBranch.id, firstBranch.name);
  set({
    status: 'authenticated',
    user: data.user,
    tenantId: data.tenant.id,
    tenantName: data.tenant.name,
    branchId: firstBranch?.id ?? DEFAULT_BRANCH_ID,
    branchName: firstBranch?.name ?? DEFAULT_BRANCH_NAME,
    businessDate: firstBranch?.business_date ?? new Date().toISOString().split('T')[0],
    roles: data.roles,
    permissions: data.permissions,
    error: null,
  });
}
