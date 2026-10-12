import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';

interface ExecutiveKpis {
  occupancyRate: number;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  outOfOrderUnits: number;
  adr: number;
  revpar: number;
  trevpar: number;
  roomsRevenue: number;
  fnbRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
  fnbCovers: number;
  outstandingGuestBalance: number;
  inHouseGuestsCount: number;
  expectedArrivals: number;
  expectedDepartures: number;
  nightAuditStatus: {
    lastRunAt: string | null;
    lastRunStatus: string;
    currentBusinessDate: string;
  };
}

interface DailyFlashReport {
  businessDate: string;
  branchName: string;
  currency: string;
  rooms: {
    available: number;
    occupied: number;
    complimentary: number;
    ooo: number;
    occupancyPct: number;
    adr: number;
    revpar: number;
    revenue: number;
  };
  fnb: {
    covers: number;
    averageCheck: number;
    foodRevenue: number;
    beverageRevenue: number;
    totalRevenue: number;
  };
  ledgerSummary: {
    guestLedgerBeginning: number;
    charges: number;
    payments: number;
    guestLedgerEnding: number;
  };
  mtd: {
    roomsRevenue: number;
    fnbRevenue: number;
    totalRevenue: number;
    occupancyPct: number;
    adr: number;
  };
}

interface InHouseGuestsReport {
  records: Array<{
    stayId: string;
    guestName: string;
    unitNumber: string;
    checkInDate: string;
    expectedCheckOut: string;
    folioNumber: string;
    currentBalance: number;
    adults: number;
    ratePlanCode?: string;
  }>;
  totalGuests: number;
  totalBalance: number;
}

interface ArrivalsDeparturesReport {
  date: string;
  arrivals: Array<{
    reservationId: string;
    guestName: string;
    unitType: string;
    assignedUnit?: string;
    status: string;
    balanceDue: number;
  }>;
  departures: Array<{
    stayId: string;
    guestName: string;
    unitNumber: string;
    status: string;
    currentBalance: number;
  }>;
}

interface RoomStatusSummary {
  cleanVacant: number;
  cleanOccupied: number;
  dirtyVacant: number;
  dirtyOccupied: number;
  inspected: number;
  outOfOrder: number;
  totalUnits: number;
  items: Array<{
    unitId: string;
    unitNumber: string;
    unitType: string;
    housekeepingStatus: string;
    frontOfficeStatus: string;
  }>;
}

interface ReportJob {
  id: string;
  reportType: string;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileUrl?: string | null;
  fileSizeBytes?: number | null;
  createdAt: string;
  completedAt?: string | null;
  errorMessage?: string | null;
}

export const DashboardView: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, businessDate } = useAppStore();

  const [activeTab, setActiveTab] = useState<'kpis' | 'flash' | 'fo_pack' | 'async_jobs' | 'compliance'>('kpis');
  const [foSubTab, setFoSubTab] = useState<'in_house' | 'arrivals_departures' | 'room_status'>('in_house');

  // Async report state
  const [reportType, setReportType] = useState<string>('daily_flash');
  const [reportFormat, setReportFormat] = useState<string>('csv');
  const [jobCreatedNotice, setJobCreatedNotice] = useState<string | null>(null);

  // Compliance state
  const [complianceGuestId, setComplianceGuestId] = useState('');
  const [eraseReason, setEraseReason] = useState('Data subject exercised right to erasure');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [exportData, setExportData] = useState<any | null>(null);
  const [complianceFeedback, setComplianceFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 1. Fetch Executive Dashboard KPIs
  const { data: kpis, isLoading: kpisLoading, refetch: refetchKpis } = useQuery<ExecutiveKpis>({
    queryKey: ['reporting-kpis', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reporting/dashboard/kpis?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) throw new Error('Failed to fetch executive KPIs');
      return res.json();
    },
    refetchInterval: 15000,
  });

  // 2. Fetch Flash Report
  const { data: flash, isLoading: flashLoading } = useQuery<DailyFlashReport>({
    queryKey: ['reporting-flash', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reporting/flash-report?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) throw new Error('Failed to fetch flash report');
      return res.json();
    },
    enabled: activeTab === 'flash',
  });

  // 3. Fetch In-House Guests
  const { data: inHouse, isLoading: inHouseLoading } = useQuery<InHouseGuestsReport>({
    queryKey: ['reporting-in-house', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reporting/in-house-guests?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) throw new Error('Failed to fetch in-house guests');
      return res.json();
    },
    enabled: activeTab === 'fo_pack' && foSubTab === 'in_house',
  });

  // 4. Fetch Arrivals & Departures
  const { data: arrDep, isLoading: arrDepLoading } = useQuery<ArrivalsDeparturesReport>({
    queryKey: ['reporting-arr-dep', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reporting/arrivals-departures?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) throw new Error('Failed to fetch arrivals & departures');
      return res.json();
    },
    enabled: activeTab === 'fo_pack' && foSubTab === 'arrivals_departures',
  });

  // 5. Fetch Room Status Summary
  const { data: roomStatus, isLoading: roomStatusLoading } = useQuery<RoomStatusSummary>({
    queryKey: ['reporting-room-status', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reporting/room-status-summary?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) throw new Error('Failed to fetch room status summary');
      return res.json();
    },
    enabled: activeTab === 'fo_pack' && foSubTab === 'room_status',
  });

  // 6. Fetch Report Jobs
  const { data: reportJobs, isLoading: jobsLoading, refetch: refetchJobs } = useQuery<ReportJob[]>({
    queryKey: ['report-jobs', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reporting/jobs?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) throw new Error('Failed to fetch report jobs');
      return res.json();
    },
    enabled: activeTab === 'async_jobs',
    refetchInterval: 5000,
  });

  // 7. Fetch Privacy Audit Logs
  const { data: auditLogs, isLoading: logsLoading, refetch: refetchLogs } = useQuery<any[]>({
    queryKey: ['compliance-audit-logs', activeTenantId],
    queryFn: async () => {
      const res = await fetch('/api/v1/compliance/gdpr/audit-logs', {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) throw new Error('Failed to fetch privacy audit logs');
      return res.json();
    },
    enabled: activeTab === 'compliance',
  });

  // Mutation: Trigger Report Job
  const createJobMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/reporting/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
        },
        body: JSON.stringify({
          reportType,
          branchId: activeBranchId,
          format: reportFormat,
        }),
      });
      if (!res.ok) throw new Error('Failed to create report job');
      return res.json();
    },
    onSuccess: (data) => {
      setJobCreatedNotice(`Report job ${data.id.slice(0, 8)}... accepted! Status: ${data.status}`);
      queryClient.invalidateQueries({ queryKey: ['report-jobs'] });
      setTimeout(() => setJobCreatedNotice(null), 5000);
    },
  });

  // Mutation: GDPR Export
  const exportMutation = useMutation({
    mutationFn: async (guestId: string) => {
      const res = await fetch(`/api/v1/compliance/gdpr/export/${guestId}`, {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.message || 'Export failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setExportData(data);
      setComplianceFeedback({ type: 'success', message: `Data Subject Access Request (SAR) exported successfully!` });
      refetchLogs();
    },
    onError: (err: any) => {
      setComplianceFeedback({ type: 'error', message: err.message });
    },
  });

  // Mutation: GDPR Erase
  const eraseMutation = useMutation({
    mutationFn: async ({ guestId, reason }: { guestId: string; reason: string }) => {
      const res = await fetch(`/api/v1/compliance/gdpr/erase/${guestId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
        },
        body: JSON.stringify({
          reason,
          confirmConsent: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.message || 'Erasure failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setComplianceFeedback({
        type: 'success',
        message: `Success: Guest PII pseudonymized to ${data.pseudonymizedId}. Accounting ledgers preserved.`,
      });
      setExportData(null);
      refetchLogs();
    },
    onError: (err: any) => {
      setComplianceFeedback({ type: 'error', message: err.message });
    },
  });

  return (
    <div className="p-4 max-w-7xl mx-auto d-flex flex-column gap-4 bg-light" style={{ minHeight: '100%' }}>
      {/* Top Header */}
      <div className="bg-white p-3 rounded-3 shadow-sm border d-flex justify-content-between align-items-center flex-wrap gap-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <h4 className="fw-bold mb-0 text-dark">Executive & Operational Dashboard</h4>
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
              Phase 8 Observability & Hardening
            </span>
          </div>
          <span className="text-muted small">
            Real-time hotel performance metrics, front-office packs, asynchronous reporting, and GDPR/DPA governance
          </span>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
            onClick={() => {
              refetchKpis();
              if (activeTab === 'async_jobs') refetchJobs();
            }}
          >
            <i className="bi bi-arrow-clockwise" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Night Audit Status Banner */}
      {kpis?.nightAuditStatus && (
        <div className="p-3 bg-white rounded-3 shadow-sm border d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div className="d-flex align-items-center gap-3">
            <div
              className={`rounded-circle d-flex align-items-center justify-content-center ${
                kpis.nightAuditStatus.lastRunStatus === 'completed'
                  ? 'bg-success-subtle text-success'
                  : kpis.nightAuditStatus.lastRunStatus === 'running'
                  ? 'bg-warning-subtle text-warning'
                  : 'bg-secondary-subtle text-secondary'
              }`}
              style={{ width: '38px', height: '38px' }}
            >
              <i className="bi bi-moon-stars-fill fs-5" />
            </div>
            <div>
              <div className="d-flex align-items-center gap-2">
                <span className="fw-bold text-dark small">Night Audit State:</span>
                <span
                  className={`badge text-uppercase ${
                    kpis.nightAuditStatus.lastRunStatus === 'completed'
                      ? 'bg-success'
                      : kpis.nightAuditStatus.lastRunStatus === 'running'
                      ? 'bg-warning text-dark'
                      : 'bg-secondary'
                  }`}
                  style={{ fontSize: '0.72rem' }}
                >
                  {kpis.nightAuditStatus.lastRunStatus}
                </span>
                <span className="badge bg-light text-secondary border small">
                  Business Date: {kpis.nightAuditStatus.currentBusinessDate}
                </span>
              </div>
              <span className="text-muted small" style={{ fontSize: '0.78rem' }}>
                {kpis.nightAuditStatus.lastRunAt
                  ? `Last completed on ${new Date(kpis.nightAuditStatus.lastRunAt).toLocaleString()}`
                  : 'No night audit recorded yet for current branch'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Real-time KPI Cards Grid */}
      <div className="row g-3">
        {/* Occupancy Rate */}
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card h-100 border shadow-sm p-3 bg-white">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <span className="text-muted small fw-semibold">Occupancy Rate</span>
              <div className="rounded p-1 bg-primary-subtle text-primary">
                <i className="bi bi-pie-chart-fill" />
              </div>
            </div>
            <h3 className="fw-bold text-dark mb-1">
              {kpisLoading ? '—' : `${kpis?.occupancyRate || 0}%`}
            </h3>
            <div className="d-flex align-items-center gap-2 small text-muted">
              <span>{kpis?.occupiedUnits || 0} occupied</span>
              <span>•</span>
              <span>{kpis?.totalUnits || 0} total units</span>
            </div>
            <div className="progress mt-2" style={{ height: '5px' }}>
              <div
                className="progress-bar bg-primary"
                role="progressbar"
                style={{ width: `${Math.min(100, kpis?.occupancyRate || 0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* ADR */}
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card h-100 border shadow-sm p-3 bg-white">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <span className="text-muted small fw-semibold">Average Daily Rate (ADR)</span>
              <div className="rounded p-1 bg-success-subtle text-success">
                <i className="bi bi-currency-dollar" />
              </div>
            </div>
            <h3 className="fw-bold text-dark mb-1">
              {kpisLoading ? '—' : `$${kpis?.adr.toFixed(2) || '0.00'}`}
            </h3>
            <span className="text-muted small">Per occupied unit / night</span>
          </div>
        </div>

        {/* RevPAR */}
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card h-100 border shadow-sm p-3 bg-white">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <span className="text-muted small fw-semibold">RevPAR</span>
              <div className="rounded p-1 bg-info-subtle text-info">
                <i className="bi bi-graph-up-arrow" />
              </div>
            </div>
            <h3 className="fw-bold text-dark mb-1">
              {kpisLoading ? '—' : `$${kpis?.revpar.toFixed(2) || '0.00'}`}
            </h3>
            <span className="text-muted small">Revenue per available unit</span>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card h-100 border shadow-sm p-3 bg-white">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <span className="text-muted small fw-semibold">Total Revenue (Today)</span>
              <div className="rounded p-1 bg-warning-subtle text-warning">
                <i className="bi bi-cash-stack" />
              </div>
            </div>
            <h3 className="fw-bold text-dark mb-1">
              {kpisLoading ? '—' : `$${kpis?.totalRevenue.toFixed(2) || '0.00'}`}
            </h3>
            <div className="d-flex align-items-center gap-1 small text-muted" style={{ fontSize: '0.75rem' }}>
              <span>Rooms: ${kpis?.roomsRevenue || 0}</span>
              <span>•</span>
              <span>F&B: ${kpis?.fnbRevenue || 0}</span>
            </div>
          </div>
        </div>

        {/* TrevPAR */}
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card h-100 border shadow-sm p-3 bg-white">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <span className="text-muted small fw-semibold">TrevPAR</span>
              <div className="rounded p-1 bg-secondary-subtle text-secondary">
                <i className="bi bi-layers-fill" />
              </div>
            </div>
            <h4 className="fw-bold text-dark mb-1">
              {kpisLoading ? '—' : `$${kpis?.trevpar.toFixed(2) || '0.00'}`}
            </h4>
            <span className="text-muted small">Total revenue / available unit</span>
          </div>
        </div>

        {/* F&B Covers */}
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card h-100 border shadow-sm p-3 bg-white">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <span className="text-muted small fw-semibold">F&B Covers</span>
              <div className="rounded p-1 bg-danger-subtle text-danger">
                <i className="bi bi-cup-straw" />
              </div>
            </div>
            <h4 className="fw-bold text-dark mb-1">
              {kpisLoading ? '—' : `${kpis?.fnbCovers || 0}`}
            </h4>
            <span className="text-muted small">Total seated restaurant patrons</span>
          </div>
        </div>

        {/* Outstanding Guest Balance */}
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card h-100 border shadow-sm p-3 bg-white">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <span className="text-muted small fw-semibold">Guest Ledger Balance</span>
              <div className="rounded p-1 bg-dark-subtle text-dark">
                <i className="bi bi-wallet2" />
              </div>
            </div>
            <h4 className="fw-bold text-dark mb-1">
              {kpisLoading ? '—' : `$${kpis?.outstandingGuestBalance.toFixed(2) || '0.00'}`}
            </h4>
            <span className="text-muted small">Unsettled open guest folios</span>
          </div>
        </div>

        {/* Arrivals & Departures Today */}
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card h-100 border shadow-sm p-3 bg-white">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <span className="text-muted small fw-semibold">Expected Movement</span>
              <div className="rounded p-1 bg-info-subtle text-info">
                <i className="bi bi-arrow-left-right" />
              </div>
            </div>
            <div className="d-flex justify-content-between align-items-center mt-1">
              <div>
                <span className="small text-muted d-block">Arrivals</span>
                <span className="fw-bold fs-5 text-success">+{kpis?.expectedArrivals || 0}</span>
              </div>
              <div className="border-start ps-3">
                <span className="small text-muted d-block">Departures</span>
                <span className="fw-bold fs-5 text-danger">-{kpis?.expectedDepartures || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border rounded-3 shadow-sm p-2">
        <ul className="nav nav-pills gap-1">
          <li className="nav-item">
            <button
              className={`nav-link btn-sm fw-semibold ${activeTab === 'kpis' ? 'active bg-primary' : 'text-dark'}`}
              onClick={() => setActiveTab('kpis')}
            >
              <i className="bi bi-speedometer2 me-1" />
              Executive Overview
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link btn-sm fw-semibold ${activeTab === 'flash' ? 'active bg-primary' : 'text-dark'}`}
              onClick={() => setActiveTab('flash')}
            >
              <i className="bi bi-file-earmark-text me-1" />
              Daily Flash Report
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link btn-sm fw-semibold ${activeTab === 'fo_pack' ? 'active bg-primary' : 'text-dark'}`}
              onClick={() => setActiveTab('fo_pack')}
            >
              <i className="bi bi-journal-check me-1" />
              Front-Office Reporting Pack
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link btn-sm fw-semibold ${activeTab === 'async_jobs' ? 'active bg-primary' : 'text-dark'}`}
              onClick={() => setActiveTab('async_jobs')}
            >
              <i className="bi bi-cloud-arrow-down me-1" />
              Async Report Engine
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link btn-sm fw-semibold ${activeTab === 'compliance' ? 'active bg-primary' : 'text-dark'}`}
              onClick={() => setActiveTab('compliance')}
            >
              <i className="bi bi-shield-lock me-1" />
              Privacy & GDPR Governance
            </button>
          </li>
        </ul>
      </div>

      {/* TAB 1: EXECUTIVE OVERVIEW */}
      {activeTab === 'kpis' && (
        <div className="bg-white p-4 rounded-3 shadow-sm border d-flex flex-column gap-3">
          <h5 className="fw-bold mb-0 text-dark">Executive Operational Summary</h5>
          <p className="text-muted small">
            High-level performance analysis across front desk, rooms division, F&B outlets, and accounting controls.
          </p>

          <div className="row g-3">
            <div className="col-md-6">
              <div className="border rounded-3 p-3 bg-light">
                <h6 className="fw-bold mb-2">Rooms Division Breakdown</h6>
                <div className="d-flex justify-content-between py-1 border-bottom small">
                  <span>Total Available Inventory:</span>
                  <span className="fw-semibold">{kpis?.totalUnits || 0} rooms</span>
                </div>
                <div className="d-flex justify-content-between py-1 border-bottom small">
                  <span>Occupied In-House:</span>
                  <span className="fw-semibold text-primary">{kpis?.occupiedUnits || 0} rooms</span>
                </div>
                <div className="d-flex justify-content-between py-1 border-bottom small">
                  <span>Vacant Clean / Dirty:</span>
                  <span className="fw-semibold text-success">{kpis?.vacantUnits || 0} rooms</span>
                </div>
                <div className="d-flex justify-content-between py-1 small">
                  <span>Out of Order (OOO):</span>
                  <span className="fw-semibold text-danger">{kpis?.outOfOrderUnits || 0} rooms</span>
                </div>
              </div>
            </div>

            <div className="col-md-6">
              <div className="border rounded-3 p-3 bg-light">
                <h6 className="fw-bold mb-2">Revenue Streams Breakdown</h6>
                <div className="d-flex justify-content-between py-1 border-bottom small">
                  <span>Rooms Division Revenue:</span>
                  <span className="fw-semibold">${kpis?.roomsRevenue.toFixed(2) || '0.00'}</span>
                </div>
                <div className="d-flex justify-content-between py-1 border-bottom small">
                  <span>Food & Beverage Outlets:</span>
                  <span className="fw-semibold">${kpis?.fnbRevenue.toFixed(2) || '0.00'}</span>
                </div>
                <div className="d-flex justify-content-between py-1 border-bottom small">
                  <span>Other Incidental Services:</span>
                  <span className="fw-semibold">${kpis?.otherRevenue.toFixed(2) || '0.00'}</span>
                </div>
                <div className="d-flex justify-content-between py-1 small fw-bold">
                  <span>Net Hotel Revenue:</span>
                  <span className="text-success">${kpis?.totalRevenue.toFixed(2) || '0.00'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DAILY FLASH REPORT */}
      {activeTab === 'flash' && (
        <div className="bg-white p-4 rounded-3 shadow-sm border d-flex flex-column gap-3">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <h5 className="fw-bold mb-0 text-dark">Daily Flash Report (USALI Standard)</h5>
              <span className="text-muted small">
                Operating results for business date: <strong>{flash?.businessDate || businessDate}</strong> ({flash?.branchName})
              </span>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => {
                setReportType('daily_flash');
                createJobMutation.mutate();
              }}
              disabled={createJobMutation.isPending}
            >
              <i className="bi bi-file-earmark-arrow-down me-1" />
              Download as CSV
            </button>
          </div>

          {flashLoading ? (
            <div className="text-muted py-4 text-center">Loading daily flash report...</div>
          ) : flash ? (
            <div className="row g-3">
              {/* Rooms Performance */}
              <div className="col-md-4">
                <div className="card h-100 border p-3">
                  <h6 className="fw-bold text-primary mb-2 border-bottom pb-2">Rooms Performance</h6>
                  <div className="d-flex justify-content-between py-1 small">
                    <span className="text-muted">Available:</span>
                    <span>{flash.rooms.available}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 small">
                    <span className="text-muted">Occupied:</span>
                    <span>{flash.rooms.occupied}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 small">
                    <span className="text-muted">Occupancy %:</span>
                    <span className="fw-bold">{flash.rooms.occupancyPct}%</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 small">
                    <span className="text-muted">ADR:</span>
                    <span>${flash.rooms.adr.toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 small">
                    <span className="text-muted">RevPAR:</span>
                    <span>${flash.rooms.revpar.toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 small border-top fw-bold mt-1">
                    <span>Revenue:</span>
                    <span>${flash.rooms.revenue.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* F&B Performance */}
              <div className="col-md-4">
                <div className="card h-100 border p-3">
                  <h6 className="fw-bold text-warning mb-2 border-bottom pb-2">F&B Performance</h6>
                  <div className="d-flex justify-content-between py-1 small">
                    <span className="text-muted">Total Covers:</span>
                    <span>{flash.fnb.covers}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 small">
                    <span className="text-muted">Average Check:</span>
                    <span>${flash.fnb.averageCheck.toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 small">
                    <span className="text-muted">Food Revenue:</span>
                    <span>${flash.fnb.foodRevenue.toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 small">
                    <span className="text-muted">Beverage Revenue:</span>
                    <span>${flash.fnb.beverageRevenue.toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 small border-top fw-bold mt-1">
                    <span>Total F&B Revenue:</span>
                    <span>${flash.fnb.totalRevenue.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Ledger Summary */}
              <div className="col-md-4">
                <div className="card h-100 border p-3">
                  <h6 className="fw-bold text-success mb-2 border-bottom pb-2">Guest Ledger Movements</h6>
                  <div className="d-flex justify-content-between py-1 small">
                    <span className="text-muted">Beginning Balance:</span>
                    <span>${flash.ledgerSummary.guestLedgerBeginning.toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 small">
                    <span className="text-muted">+ Daily Charges:</span>
                    <span className="text-danger">+${flash.ledgerSummary.charges.toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 small">
                    <span className="text-muted">- Daily Payments:</span>
                    <span className="text-success">-${flash.ledgerSummary.payments.toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 small border-top fw-bold mt-1">
                    <span>Ending Ledger Balance:</span>
                    <span>${flash.ledgerSummary.guestLedgerEnding.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 3: FRONT-OFFICE REPORTING PACK */}
      {activeTab === 'fo_pack' && (
        <div className="bg-white p-4 rounded-3 shadow-sm border d-flex flex-column gap-3">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div className="btn-group btn-group-sm">
              <button
                className={`btn ${foSubTab === 'in_house' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setFoSubTab('in_house')}
              >
                In-House Guests
              </button>
              <button
                className={`btn ${foSubTab === 'arrivals_departures' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setFoSubTab('arrivals_departures')}
              >
                Arrivals & Departures
              </button>
              <button
                className={`btn ${foSubTab === 'room_status' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setFoSubTab('room_status')}
              >
                Room Status Summary
              </button>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => {
                setReportType(
                  foSubTab === 'in_house'
                    ? 'in_house_guests'
                    : foSubTab === 'arrivals_departures'
                    ? 'arrivals_departures'
                    : 'room_status_summary',
                );
                createJobMutation.mutate();
              }}
              disabled={createJobMutation.isPending}
            >
              <i className="bi bi-download me-1" />
              Export Active View (CSV)
            </button>
          </div>

          {/* Sub-view: In-House Guests */}
          {foSubTab === 'in_house' && (
            <div className="table-responsive">
              {inHouseLoading ? (
                <div className="text-muted py-3">Loading in-house guests...</div>
              ) : inHouse?.records.length === 0 ? (
                <div className="text-muted py-3 text-center">No guests currently in-house.</div>
              ) : (
                <table className="table table-sm table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Unit #</th>
                      <th>Guest Name</th>
                      <th>Check-In</th>
                      <th>Expected Departure</th>
                      <th>Folio #</th>
                      <th className="text-end">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inHouse?.records.map((g) => (
                      <tr key={g.stayId}>
                        <td className="fw-bold">{g.unitNumber}</td>
                        <td>{g.guestName}</td>
                        <td className="small text-muted">{g.checkInDate}</td>
                        <td className="small text-muted">{g.expectedCheckOut}</td>
                        <td className="font-monospace small">{g.folioNumber}</td>
                        <td className={`text-end fw-semibold ${g.currentBalance > 0 ? 'text-danger' : 'text-success'}`}>
                          ${g.currentBalance.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Sub-view: Arrivals & Departures */}
          {foSubTab === 'arrivals_departures' && (
            <div className="row g-3">
              <div className="col-md-6">
                <div className="border rounded-3 p-3">
                  <h6 className="fw-bold text-success mb-2">Expected Arrivals Today ({arrDep?.arrivals.length || 0})</h6>
                  {arrDepLoading ? (
                    <div className="text-muted small">Loading arrivals...</div>
                  ) : arrDep?.arrivals.length === 0 ? (
                    <div className="text-muted small py-2">No arrivals scheduled today.</div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm table-hover mb-0">
                        <thead>
                          <tr>
                            <th>Guest</th>
                            <th>Unit Type</th>
                            <th>Assigned</th>
                            <th>Balance Due</th>
                          </tr>
                        </thead>
                        <tbody>
                          {arrDep?.arrivals.map((a) => (
                            <tr key={a.reservationId}>
                              <td className="small fw-semibold">{a.guestName}</td>
                              <td className="small text-muted">{a.unitType}</td>
                              <td className="small">{a.assignedUnit || <span className="badge bg-secondary">Unassigned</span>}</td>
                              <td className="small">${a.balanceDue.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="col-md-6">
                <div className="border rounded-3 p-3">
                  <h6 className="fw-bold text-danger mb-2">Expected Departures Today ({arrDep?.departures.length || 0})</h6>
                  {arrDepLoading ? (
                    <div className="text-muted small">Loading departures...</div>
                  ) : arrDep?.departures.length === 0 ? (
                    <div className="text-muted small py-2">No departures scheduled today.</div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm table-hover mb-0">
                        <thead>
                          <tr>
                            <th>Unit #</th>
                            <th>Guest</th>
                            <th>Status</th>
                            <th>Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {arrDep?.departures.map((d) => (
                            <tr key={d.stayId}>
                              <td className="fw-bold small">{d.unitNumber}</td>
                              <td className="small">{d.guestName}</td>
                              <td className="small"><span className="badge bg-primary-subtle text-primary">{d.status}</span></td>
                              <td className="small fw-semibold text-end">${d.currentBalance.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sub-view: Room Status Summary */}
          {foSubTab === 'room_status' && (
            <div>
              <div className="row g-2 mb-3">
                <div className="col-md-2">
                  <div className="p-2 border rounded text-center bg-light">
                    <span className="small text-muted d-block">Clean Vacant</span>
                    <span className="fw-bold fs-5 text-success">{roomStatus?.cleanVacant || 0}</span>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="p-2 border rounded text-center bg-light">
                    <span className="small text-muted d-block">Clean Occupied</span>
                    <span className="fw-bold fs-5 text-primary">{roomStatus?.cleanOccupied || 0}</span>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="p-2 border rounded text-center bg-light">
                    <span className="small text-muted d-block">Dirty Vacant</span>
                    <span className="fw-bold fs-5 text-warning">{roomStatus?.dirtyVacant || 0}</span>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="p-2 border rounded text-center bg-light">
                    <span className="small text-muted d-block">Dirty Occupied</span>
                    <span className="fw-bold fs-5 text-danger">{roomStatus?.dirtyOccupied || 0}</span>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="p-2 border rounded text-center bg-light">
                    <span className="small text-muted d-block">Inspected</span>
                    <span className="fw-bold fs-5 text-info">{roomStatus?.inspected || 0}</span>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="p-2 border rounded text-center bg-light">
                    <span className="small text-muted d-block">Out of Order</span>
                    <span className="fw-bold fs-5 text-secondary">{roomStatus?.outOfOrder || 0}</span>
                  </div>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-sm table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Unit #</th>
                      <th>Type</th>
                      <th>Housekeeping Status</th>
                      <th>Front Office Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomStatus?.items.map((it) => (
                      <tr key={it.unitId}>
                        <td className="fw-bold">{it.unitNumber}</td>
                        <td className="text-muted">{it.unitType}</td>
                        <td>
                          <span className="badge bg-secondary text-uppercase" style={{ fontSize: '0.7rem' }}>
                            {it.housekeepingStatus}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge text-uppercase ${
                              it.frontOfficeStatus === 'occupied' ? 'bg-primary' : 'bg-light text-dark border'
                            }`}
                            style={{ fontSize: '0.7rem' }}
                          >
                            {it.frontOfficeStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ASYNCHRONOUS REPORT ENGINE */}
      {activeTab === 'async_jobs' && (
        <div className="bg-white p-4 rounded-3 shadow-sm border d-flex flex-column gap-3">
          <h5 className="fw-bold mb-0 text-dark">Asynchronous Report Engine & Job Queue</h5>
          <p className="text-muted small">
            Generate heavy audit and statistical reports in background tasks (HTTP 202 Accepted). Stream results as CSV or JSON when ready.
          </p>

          {jobCreatedNotice && (
            <div className="alert alert-success py-2 d-flex align-items-center gap-2 small">
              <i className="bi bi-check-circle-fill" />
              <span>{jobCreatedNotice}</span>
            </div>
          )}

          {/* Generator Form */}
          <div className="card p-3 bg-light border">
            <h6 className="fw-bold mb-3">Request New Report Generation</h6>
            <div className="row g-3 align-items-end">
              <div className="col-md-5">
                <label className="form-label small fw-semibold">Report Type</label>
                <select
                  className="form-select form-select-sm"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  <option value="daily_flash">Daily Flash Report</option>
                  <option value="in_house_guests">In-House Guest List</option>
                  <option value="arrivals_departures">Arrivals & Departures</option>
                  <option value="room_status_summary">Room Status Summary</option>
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-semibold">Format</label>
                <select
                  className="form-select form-select-sm"
                  value={reportFormat}
                  onChange={(e) => setReportFormat(e.target.value)}
                >
                  <option value="csv">CSV (Spreadsheet)</option>
                  <option value="json">JSON (Data Feed)</option>
                </select>
              </div>
              <div className="col-md-4">
                <button
                  type="button"
                  className="btn btn-sm btn-primary w-100 fw-semibold"
                  onClick={() => createJobMutation.mutate()}
                  disabled={createJobMutation.isPending}
                >
                  {createJobMutation.isPending ? 'Submitting Job...' : 'Enqueue Report Job (202 Accepted)'}
                </button>
              </div>
            </div>
          </div>

          {/* Jobs Table */}
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Job ID</th>
                  <th>Report Type</th>
                  <th>Format</th>
                  <th>Status</th>
                  <th>Created At</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobsLoading ? (
                  <tr>
                    <td colSpan={6} className="text-muted text-center py-3">Loading background jobs...</td>
                  </tr>
                ) : reportJobs?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-muted text-center py-3">No report jobs enqueued yet.</td>
                  </tr>
                ) : (
                  reportJobs?.map((j) => (
                    <tr key={j.id}>
                      <td className="font-monospace small">{j.id.slice(0, 8)}...</td>
                      <td className="fw-semibold small">{j.reportType}</td>
                      <td><span className="badge bg-light text-dark border text-uppercase">{j.format}</span></td>
                      <td>
                        <span
                          className={`badge ${
                            j.status === 'completed'
                              ? 'bg-success'
                              : j.status === 'processing'
                              ? 'bg-warning text-dark'
                              : j.status === 'failed'
                              ? 'bg-danger'
                              : 'bg-secondary'
                          }`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="small text-muted">{new Date(j.createdAt).toLocaleTimeString()}</td>
                      <td className="text-end">
                        {j.status === 'completed' && j.fileUrl ? (
                          <a
                            href={j.fileUrl}
                            download
                            className="btn btn-xs btn-outline-success d-inline-flex align-items-center gap-1"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                          >
                            <i className="bi bi-file-earmark-arrow-down" />
                            Download
                          </a>
                        ) : (
                          <span className="text-muted small">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: PRIVACY & GDPR GOVERNANCE */}
      {activeTab === 'compliance' && (
        <div className="bg-white p-4 rounded-3 shadow-sm border d-flex flex-column gap-3">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <h5 className="fw-bold mb-0 text-dark">Data Privacy & Governance (GDPR & Philippine DPA)</h5>
              <span className="text-muted small">
                Automated personal data export (Subject Access Request) and pseudonymized right-to-erasure workflows (REQ-GST-004)
              </span>
            </div>
            <span className="badge bg-success-subtle text-success border border-success-subtle">
              Tax & Ledger Retention Harmonization Active
            </span>
          </div>

          {complianceFeedback && (
            <div
              className={`alert py-2 small d-flex align-items-center gap-2 ${
                complianceFeedback.type === 'success' ? 'alert-success' : 'alert-danger'
              }`}
            >
              <i className={`bi ${complianceFeedback.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} />
              <span>{complianceFeedback.message}</span>
            </div>
          )}

          {/* Form Controls */}
          <div className="card p-3 bg-light border">
            <h6 className="fw-bold mb-3">Execute Data Subject Request</h6>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Target Guest ID (UUID)</label>
                <input
                  type="text"
                  className="form-control form-control-sm font-monospace"
                  placeholder="e.g. 10000000-0000-0000-0000-000000000001"
                  value={complianceGuestId}
                  onChange={(e) => setComplianceGuestId(e.target.value)}
                />
              </div>

              <div className="col-md-6 d-flex align-items-end gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary fw-semibold"
                  disabled={!complianceGuestId.trim() || exportMutation.isPending}
                  onClick={() => exportMutation.mutate(complianceGuestId.trim())}
                >
                  <i className="bi bi-box-arrow-up-right me-1" />
                  {exportMutation.isPending ? 'Exporting...' : 'Export SAR Data'}
                </button>
              </div>

              {/* Right-to-Erasure Controls */}
              <div className="col-12 border-top pt-3">
                <h6 className="fw-bold text-danger mb-2">Right-to-Erasure Workflow (REQ-GST-004)</h6>
                <div className="p-3 bg-white border rounded-3 mb-2 small">
                  <strong>Accounting & Tax Safeguard:</strong> In accordance with statutory tax retention laws, personal details are permanently salted and pseudonymized (e.g. <code>DELETED_GUEST_a1b2c3d4</code>) and PII (identifications, phone, email, preferences) is purged. Historical folios, invoices, and accounting vouchers are retained with the pseudonym for financial audit integrity. Guests with unsettled open folio balances cannot be erased.
                </div>

                <div className="row g-2">
                  <div className="col-md-6">
                    <label className="form-label small text-muted">Legal / Audit Reason for Erasure</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={eraseReason}
                      onChange={(e) => setEraseReason(e.target.value)}
                    />
                  </div>
                  <div className="col-md-6 d-flex align-items-center pt-3">
                    <div className="form-check">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id="consentCheck"
                        checked={consentConfirmed}
                        onChange={(e) => setConsentConfirmed(e.target.checked)}
                      />
                      <label className="form-check-label small" htmlFor="consentCheck">
                        I confirm data subject identity has been verified and erasure request confirmed.
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    className="btn btn-sm btn-danger fw-semibold"
                    disabled={!complianceGuestId.trim() || !consentConfirmed || eraseMutation.isPending}
                    onClick={() => eraseMutation.mutate({ guestId: complianceGuestId.trim(), reason: eraseReason })}
                  >
                    <i className="bi bi-trash3-fill me-1" />
                    {eraseMutation.isPending ? 'Processing Erasure...' : 'Execute Pseudonymized Erasure'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Export JSON Viewer */}
          {exportData && (
            <div className="card p-3 border">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="fw-bold text-dark mb-0">Exported Guest Subject Access Package</h6>
                <button
                  type="button"
                  className="btn btn-xs btn-outline-secondary"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `gdpr-export-${exportData.guestId}.json`;
                    a.click();
                  }}
                >
                  <i className="bi bi-download me-1" />
                  Save JSON
                </button>
              </div>
              <pre className="bg-light p-3 rounded font-monospace small mb-0" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                {JSON.stringify(exportData, null, 2)}
              </pre>
            </div>
          )}

          {/* Privacy Audit Logs */}
          <div className="mt-2">
            <h6 className="fw-bold mb-2">Immutable Privacy Audit Log</h6>
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Log ID</th>
                    <th>Action</th>
                    <th>Guest ID</th>
                    <th>Reason</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logsLoading ? (
                    <tr>
                      <td colSpan={5} className="text-muted text-center py-3">Loading privacy audit logs...</td>
                    </tr>
                  ) : auditLogs?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-muted text-center py-3">No privacy actions recorded yet.</td>
                    </tr>
                  ) : (
                    auditLogs?.map((log) => (
                      <tr key={log.id}>
                        <td className="font-monospace small">{log.id.slice(0, 8)}...</td>
                        <td>
                          <span
                            className={`badge ${
                              log.action === 'data_export' ? 'bg-primary' : 'bg-danger'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="font-monospace small">{log.guestId}</td>
                        <td className="small text-muted">{log.reason || '—'}</td>
                        <td className="small text-muted">{new Date(log.createdAt).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
