import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';

interface NavItem {
  key: string;
  label: string;
  path: string;
  icon: string;
  permission?: string;
  children?: NavItem[];
}

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const { activeTenantId, activeBranchId } = useAppStore();

  const { data: navData, isLoading } = useQuery<{ items: NavItem[] }>({
    queryKey: ['ui-navigation', activeTenantId],
    queryFn: async () => {
      const res = await fetch('/api/v1/ui/navigation', {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load navigation');
      return res.json();
    },
  });

  return (
    <aside
      className="d-flex flex-column bg-white border-end py-3 px-2"
      style={{ width: '250px', minHeight: 'calc(100vh - 60px)', flexShrink: 0 }}
    >
      <div
        className="px-3 pb-2 text-uppercase text-muted fw-bold"
        style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}
      >
        Navigation
      </div>

      <nav className="d-flex flex-column gap-1">
        {/* Main menu landing */}
        <button
          type="button"
          className={`btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${
            currentTab === 'home' ? 'bg-primary text-white shadow-sm' : 'text-dark hover-bg-light'
          }`}
          onClick={() => onSelectTab('home')}
        >
          <i
            className={`bi bi-house-door-fill fs-6 ${currentTab === 'home' ? 'text-white' : 'text-primary'}`}
          />
          <span>Main Menu</span>
        </button>

        {/* Executive Dashboard & KPIs (Phase 8 primary operational view) */}
        <button
          type="button"
          className={`btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${
            currentTab === 'dashboard'
              ? 'bg-primary text-white shadow-sm'
              : 'text-dark hover-bg-light'
          }`}
          onClick={() => onSelectTab('dashboard')}
        >
          <i
            className={`bi bi-speedometer2 fs-6 ${currentTab === 'dashboard' ? 'text-white' : 'text-primary'}`}
          />
          <span>Executive Dashboard</span>
        </button>

        {/* Rooms Board (Phase 2 primary operational view) */}
        <button
          type="button"
          className={`btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${
            currentTab === 'board' ? 'bg-primary text-white shadow-sm' : 'text-dark hover-bg-light'
          }`}
          onClick={() => onSelectTab('board')}
        >
          <i
            className={`bi bi-grid-fill fs-6 ${currentTab === 'board' ? 'text-white' : 'text-primary'}`}
          />
          <span>Rooms Board</span>
        </button>

        {/* Reservations & Availability (Phase 3 primary operational view) */}
        <button
          type="button"
          className={`btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${
            currentTab === 'reservations'
              ? 'bg-primary text-white shadow-sm'
              : 'text-dark hover-bg-light'
          }`}
          onClick={() => onSelectTab('reservations')}
        >
          <i
            className={`bi bi-calendar2-range-fill fs-6 ${currentTab === 'reservations' ? 'text-white' : 'text-primary'}`}
          />
          <span>Reservations & Rates</span>
        </button>

        {/* Front Desk & In-House Stays (Phase 4) */}
        <button
          type="button"
          className={`btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${
            currentTab === 'frontdesk'
              ? 'bg-primary text-white shadow-sm'
              : 'text-dark hover-bg-light'
          }`}
          onClick={() => onSelectTab('frontdesk')}
        >
          <i
            className={`bi bi-person-check-fill fs-6 ${currentTab === 'frontdesk' ? 'text-white' : 'text-primary'}`}
          />
          <span>Front Desk & Stays</span>
        </button>

        {/* Housekeeping & Maintenance Operations (Phase 4) */}
        <button
          type="button"
          className={`btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${
            currentTab === 'housekeeping'
              ? 'bg-primary text-white shadow-sm'
              : 'text-dark hover-bg-light'
          }`}
          onClick={() => onSelectTab('housekeeping')}
        >
          <i
            className={`bi bi-brush-fill fs-6 ${currentTab === 'housekeeping' ? 'text-white' : 'text-primary'}`}
          />
          <span>Housekeeping & Ops</span>
        </button>

        {/* Resumable Night Audit State Machine (Phase 4) */}
        <button
          type="button"
          className={`btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${
            currentTab === 'nightaudit'
              ? 'bg-primary text-white shadow-sm'
              : 'text-dark hover-bg-light'
          }`}
          onClick={() => onSelectTab('nightaudit')}
        >
          <i
            className={`bi bi-moon-stars-fill fs-6 ${currentTab === 'nightaudit' ? 'text-white' : 'text-primary'}`}
          />
          <span>Night Audit Engine</span>
        </button>

        {/* Accounting & Vouchering (Phase 5) */}
        <button
          type="button"
          className={`btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${
            currentTab === 'accounting'
              ? 'bg-primary text-white shadow-sm'
              : 'text-dark hover-bg-light'
          }`}
          onClick={() => onSelectTab('accounting')}
        >
          <i
            className={`bi bi-bank fs-6 ${currentTab === 'accounting' ? 'text-white' : 'text-primary'}`}
          />
          <span>Accounting & Ledger</span>
        </button>

        {/* Inventory & Purchasing (Phase 6) */}
        <button
          type="button"
          className={`btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${
            currentTab === 'inventory'
              ? 'bg-primary text-white shadow-sm'
              : 'text-dark hover-bg-light'
          }`}
          onClick={() => onSelectTab('inventory')}
        >
          <i
            className={`bi bi-boxes fs-6 ${currentTab === 'inventory' ? 'text-white' : 'text-primary'}`}
          />
          <span>Inventory & Stock</span>
        </button>

        {/* Restaurant & F&B POS (Phase 7) */}
        <button
          type="button"
          className={`btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${
            currentTab === 'restaurant'
              ? 'bg-primary text-white shadow-sm'
              : 'text-dark hover-bg-light'
          }`}
          onClick={() => onSelectTab('restaurant')}
        >
          <i
            className={`bi bi-cup-hot-fill fs-6 ${currentTab === 'restaurant' ? 'text-white' : 'text-primary'}`}
          />
          <span>Restaurant & POS</span>
        </button>

        {/* Core Settings / IAM tab */}
        <button
          type="button"
          className={`btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${
            currentTab === 'settings'
              ? 'bg-primary text-white shadow-sm'
              : 'text-dark hover-bg-light'
          }`}
          onClick={() => onSelectTab('settings')}
        >
          <i
            className={`bi bi-gear-wide-connected fs-6 ${currentTab === 'settings' ? 'text-white' : 'text-primary'}`}
          />
          <span>Settings & Config Engine</span>
        </button>

        {/* Vertical Slice Test Records */}
        <button
          type="button"
          className={`btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${
            currentTab === 'records'
              ? 'bg-primary text-white shadow-sm'
              : 'text-dark hover-bg-light'
          }`}
          onClick={() => onSelectTab('records')}
        >
          <i
            className={`bi bi-database-check fs-6 ${currentTab === 'records' ? 'text-white' : 'text-muted'}`}
          />
          <span>Tenant Data Isolation</span>
        </button>

        <div className="my-2 border-top" />

        {/* Server-driven sections from /api/v1/ui/navigation */}
        {isLoading ? (
          <div className="px-3 py-2 text-muted small">Loading menu tree...</div>
        ) : (
          navData?.items.map((section) => (
            <div key={section.key} className="mb-2">
              <div
                className="px-3 py-1 text-muted fw-bold text-uppercase d-flex align-items-center gap-2"
                style={{ fontSize: '0.68rem' }}
              >
                <i className={`bi ${section.icon} text-muted`} />
                <span>{section.label}</span>
              </div>
              {section.children?.map((child) => (
                <button
                  key={child.key}
                  type="button"
                  className={`btn btn-sm text-start d-flex align-items-center justify-content-between px-3 py-1 border-0 w-100 ${
                    currentTab === child.key
                      ? 'fw-bold text-primary bg-primary-subtle'
                      : 'text-secondary'
                  }`}
                  style={{ fontSize: '0.85rem' }}
                  onClick={() => {
                    if (child.key === 'board') {
                      onSelectTab('board');
                    } else if (
                      child.key === 'status_defs' ||
                      child.key === 'general_settings' ||
                      child.key === 'numbering' ||
                      child.key === 'roles_permissions'
                    ) {
                      onSelectTab('settings');
                    }
                  }}
                >
                  <span className="d-flex align-items-center gap-2">
                    <i className={`bi ${child.icon}`} style={{ fontSize: '0.8rem' }} />
                    <span>{child.label}</span>
                  </span>
                  {child.key === 'board' && (
                    <span
                      className="badge bg-success-subtle text-success border border-success-subtle"
                      style={{ fontSize: '0.65rem' }}
                    >
                      Live
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))
        )}
      </nav>
    </aside>
  );
};
