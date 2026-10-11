import { describe, it, expect } from 'vitest';
import { useAppStore } from './useAppStore.js';

describe('useAppStore UI state invariants', () => {
  it('initializes with default active tenant and branch', () => {
    const state = useAppStore.getState();
    expect(state.activeTenantName).toBe('Acme Grand Hotel');
    expect(state.activeBranchName).toBe('Manila Main Hotel');
  });

  it('updates tenant and branch correctly', () => {
    useAppStore.getState().setTenant('a0000000-0000-0000-0000-000000000002', 'Boracay Paradise Resort');
    useAppStore.getState().setBranch('b0000000-0000-0000-0000-000000000002', 'Boracay Beachfront Resort');

    const updated = useAppStore.getState();
    expect(updated.activeTenantName).toBe('Boracay Paradise Resort');
    expect(updated.activeBranchName).toBe('Boracay Beachfront Resort');
  });
});
