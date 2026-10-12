import React from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { useAppStore } from '../stores/useAppStore';

export type MenuTab =
  | 'dashboard'
  | 'board'
  | 'reservations'
  | 'frontdesk'
  | 'housekeeping'
  | 'nightaudit'
  | 'accounting'
  | 'inventory'
  | 'restaurant'
  | 'settings'
  | 'records';

interface ModuleDef {
  tab: MenuTab;
  label: string;
  subtitle: string;
  icon: string;
  permission?: string;
}

const MODULES: ModuleDef[] = [
  {
    tab: 'dashboard',
    label: 'Executive Dashboard',
    subtitle: 'KPIs, occupancy and revenue snapshots',
    icon: 'bi-speedometer2',
  },
  {
    tab: 'board',
    label: 'Rooms Board',
    subtitle: 'Grid of rooms, live statuses and actions',
    icon: 'bi-grid-fill',
  },
  {
    tab: 'reservations',
    label: 'Reservations & Rates',
    subtitle: 'Bookings, availability and rate plans',
    icon: 'bi-calendar2-range-fill',
    permission: 'reservation.booking.create',
  },
  {
    tab: 'frontdesk',
    label: 'Front Desk & Stays',
    subtitle: 'Check-in, check-out and in-house guests',
    icon: 'bi-person-check-fill',
    permission: 'frontdesk.stay.checkin',
  },
  {
    tab: 'housekeeping',
    label: 'Housekeeping & Ops',
    subtitle: 'Room statuses, tasks and maintenance',
    icon: 'bi-brush-fill',
    permission: 'housekeeping.room.mark',
  },
  {
    tab: 'nightaudit',
    label: 'Night Audit Engine',
    subtitle: 'Close the business day, post and reconcile',
    icon: 'bi-moon-stars-fill',
    permission: 'nightaudit.run',
  },
  {
    tab: 'accounting',
    label: 'Accounting & Ledger',
    subtitle: 'Vouchers, GL postings and sub-ledgers',
    icon: 'bi-bank',
    permission: 'accounting.voucher.post',
  },
  {
    tab: 'inventory',
    label: 'Inventory & Stock',
    subtitle: 'Stock levels, purchasing and transfers',
    icon: 'bi-boxes',
    permission: 'inventory.item.manage',
  },
  {
    tab: 'restaurant',
    label: 'Restaurant & POS',
    subtitle: 'F&B orders and point-of-sale',
    icon: 'bi-cup-hot-fill',
    permission: 'restaurant.pos.operate',
  },
  {
    tab: 'settings',
    label: 'Settings & Config Engine',
    subtitle: 'IAM, roles, permissions and settings registry',
    icon: 'bi-gear-wide-connected',
    permission: 'config.settings.update',
  },
  {
    tab: 'records',
    label: 'Tenant Data Isolation',
    subtitle: 'RLS boundary test records',
    icon: 'bi-database-check',
  },
];

interface HomeMenuViewProps {
  onSelectTab: (tab: string) => void;
}

export const HomeMenuView: React.FC<HomeMenuViewProps> = ({ onSelectTab }) => {
  const { user, roles, tenantName, branchName, businessDate, hasPermission } = useAuthStore();
  const { activeTenantName, activeBranchName } = useAppStore();
  const role = roles[0] ?? '';
  const initials = (user?.name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const visible = MODULES.filter((m) => hasPermission(m.permission));

  return (
    <div className="p-4 d-flex flex-column gap-4">
      {/* Greeting / context header */}
      <div className="p-4 bg-white rounded-3 shadow-sm border d-flex justify-content-between align-items-center flex-wrap gap-3">
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center"
            style={{ width: '52px', height: '52px', fontSize: '1.1rem' }}
          >
            {initials || <i className="bi bi-person-fill" />}
          </div>
          <div>
            <h5 className="fw-bold mb-0 text-dark">
              Welcome back, {user?.name || 'Guest'}
              {role && (
                <span className="badge bg-primary-subtle text-primary border border-primary-subtle ms-2 fw-semibold">
                  {role}
                </span>
              )}
            </h5>
            <div className="text-muted small mt-1 d-flex align-items-center gap-3 flex-wrap">
              <span className="d-flex align-items-center gap-1">
                <i className="bi bi-building" />
                {tenantName || activeTenantName}
              </span>
              <span className="d-flex align-items-center gap-1">
                <i className="bi bi-geo-alt" />
                {branchName || activeBranchName}
              </span>
              <span className="d-flex align-items-center gap-1">
                <i className="bi bi-calendar3" />
                Business Date: {businessDate}
              </span>
            </div>
          </div>
        </div>
        <div className="badge bg-success-subtle text-success border border-success-subtle px-3 py-2 d-flex align-items-center gap-1">
          <i className="bi bi-shield-check" />
          Tenant boundary active
        </div>
      </div>

      {/* Module menu grid */}
      <div>
        <h6
          className="fw-bold text-muted text-uppercase mb-3"
          style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
        >
          <i className="bi bi-grid-3x3-gap me-2" />
          Workspace Modules
        </h6>
        <div className="row g-3">
          {visible.map((m) => (
            <div key={m.tab} className="col-12 col-sm-6 col-lg-4 col-xxl-3">
              <button
                type="button"
                className="card h-100 w-100 text-start border-0 shadow-sm bg-white transition-all"
                onClick={() => onSelectTab(m.tab)}
                style={{ padding: 0, cursor: 'pointer' }}
              >
                <div className="card-body d-flex flex-column gap-2 p-3">
                  <div className="d-flex align-items-start justify-content-between">
                    <div
                      className="rounded-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center"
                      style={{ width: '40px', height: '40px' }}
                    >
                      <i className={`bi ${m.icon} fs-5`} />
                    </div>
                    <i className="bi bi-arrow-right-circle text-muted" />
                  </div>
                  <div>
                    <span className="fw-bold text-dark d-block">{m.label}</span>
                    <span className="text-muted small">{m.subtitle}</span>
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default HomeMenuView;
