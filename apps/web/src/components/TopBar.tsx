import React from 'react';
import { useAppStore } from '../stores/useAppStore';

interface TopBarProps {
  onOpenOverride: () => void;
}

const TENANTS = [
  { id: 'a0000000-0000-0000-0000-000000000001', name: 'Acme Grand Hotel', branchId: 'b0000000-0000-0000-0000-000000000001', branchName: 'Manila Main Hotel' },
  { id: 'a0000000-0000-0000-0000-000000000002', name: 'Boracay Paradise Resort', branchId: 'b0000000-0000-0000-0000-000000000002', branchName: 'Boracay Beachfront Resort' },
];

export const TopBar: React.FC<TopBarProps> = ({ onOpenOverride }) => {
  const {
    activeTenantId,
    activeTenantName,
    activeBranchId,
    activeBranchName,
    businessDate,
    setTenant,
    setBranch,
  } = useAppStore();

  const handleTenantChange = (tenantId: string) => {
    const t = TENANTS.find((x) => x.id === tenantId);
    if (t) {
      setTenant(t.id, t.name);
      setBranch(t.branchId, t.branchName);
    }
  };

  return (
    <header className="top-bar d-flex justify-content-between align-items-center px-4 py-2 border-bottom bg-white shadow-sm">
      <div className="d-flex align-items-center gap-3">
        <div className="d-flex align-items-center gap-2">
          <div
            className="rounded-3 d-flex align-items-center justify-content-center text-white font-monospace fw-bold"
            style={{ width: '36px', height: '36px', background: 'var(--brand)', fontSize: '1.1rem' }}
          >
            I
          </div>
          <span className="brand-badge fs-5 fw-bold text-dark">Innkeeper</span>
        </div>

        <div className="vr my-2" style={{ height: '24px' }} />

        {/* Tenant Switcher */}
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-building text-muted" />
          <select
            id="tenant-switcher-select"
            className="form-select form-select-sm fw-semibold border-light-subtle bg-light"
            style={{ width: '210px' }}
            value={activeTenantId}
            onChange={(e) => handleTenantChange(e.target.value)}
          >
            {TENANTS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Branch Switcher */}
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-geo-alt text-muted" />
          <div className="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 fs-6 fw-semibold">
            {activeBranchName}
          </div>
        </div>
      </div>

      <div className="d-flex align-items-center gap-3">
        {/* Business Date */}
        <div className="badge bg-light text-dark border px-3 py-2 d-flex align-items-center gap-2">
          <i className="bi bi-calendar3 text-primary" />
          <span className="text-muted small">Business Date:</span>
          <span className="fw-bold tabular-nums">{businessDate}</span>
        </div>

        {/* Manager Override Trigger */}
        <button
          id="btn-manager-override"
          type="button"
          className="btn btn-sm btn-outline-warning text-dark border-warning-subtle d-flex align-items-center gap-2 fw-semibold px-3 py-1"
          onClick={onOpenOverride}
        >
          <i className="bi bi-shield-lock-fill text-warning" />
          Manager Override
        </button>

        {/* Active User */}
        <div className="d-flex align-items-center gap-2 ps-2 border-start">
          <div
            className="rounded-circle bg-secondary-subtle text-secondary fw-bold d-flex align-items-center justify-content-center"
            style={{ width: '32px', height: '32px', fontSize: '0.85rem' }}
          >
            AA
          </div>
          <div className="d-flex flex-column text-start" style={{ lineHeight: '1.2' }}>
            <span className="fw-semibold small">Acme Admin</span>
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>Administrator</span>
          </div>
        </div>
      </div>
    </header>
  );
};
