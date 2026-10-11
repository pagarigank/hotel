import { create } from 'zustand';
export const useAppStore = create((set) => ({
    activeTenantId: 'a0000000-0000-0000-0000-000000000001',
    activeTenantName: 'Acme Grand Hotel',
    activeBranchId: 'b0000000-0000-0000-0000-000000000001',
    activeBranchName: 'Manila Main Hotel',
    businessDate: new Date().toISOString().split('T')[0],
    setTenant: (id, name) => set({ activeTenantId: id, activeTenantName: name }),
    setBranch: (id, name) => set({ activeBranchId: id, activeBranchName: name }),
}));
