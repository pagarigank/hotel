import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';

interface NightAuditStep {
  id?: string;
  stepKey: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  startedAt?: string | null;
  finishedAt?: string | null;
  errorMessage?: string | null;
}

interface NightAuditStatus {
  id: string;
  businessDate: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  steps: NightAuditStep[];
}

interface KpiSnapshot {
  id: string;
  businessDate: string;
  totalRooms: number;
  roomsOccupied: number;
  occupancyRate: number;
  adr: number;
  revpar: number;
  totalRevenue: number;
  roomRevenue: number;
  fnbRevenue: number;
  otherRevenue: number;
}

const STEP_LABELS: Record<string, { label: string; desc: string; icon: string }> = {
  pre_checks: {
    label: 'Arrival & Departure Pre-Checks',
    desc: 'Verifies remaining due-in arrivals and un-checked-out departures.',
    icon: 'bi-clipboard-check',
  },
  room_tax_posting: {
    label: 'Automated Room & Tax Posting',
    desc: 'Posts nightly room rate and lodging taxes with idempotent constraints.',
    icon: 'bi-cash-coin',
  },
  fee_posting: {
    label: 'Recurring Fee & Service Posting',
    desc: 'Applies daily recurring fees, resort charges, and service levies.',
    icon: 'bi-tag',
  },
  date_roll: {
    label: 'Business Date Rollover',
    desc: 'Closes previous business date and advances branch system clock by +1 day.',
    icon: 'bi-clock-history',
  },
  gl_vouchering: {
    label: 'General Ledger Batch Vouchering',
    desc: 'Aggregates revenue, tax, and tender debits/credits for accounting journals.',
    icon: 'bi-journal-check',
  },
  kpi_snapshot: {
    label: 'Daily KPI Statistical Snapshot',
    desc: 'Computes occupancy rate, ADR, RevPAR, and department revenue breakdowns.',
    icon: 'bi-graph-up-arrow',
  },
};

export const NightAuditView: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, businessDate } = useAppStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Fetch Audit Status
  const { data: audit, isLoading: loadingStatus, refetch: refetchAudit } = useQuery<NightAuditStatus>({
    queryKey: ['night-audit-status', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/night-audit/status?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) throw new Error('Failed to fetch night audit status');
      return res.json();
    },
  });

  // 2. Fetch KPI Snapshots
  const { data: kpis, isLoading: loadingKpis, refetch: refetchKpis } = useQuery<KpiSnapshot[]>({
    queryKey: ['night-audit-kpis', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/night-audit/kpis?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) throw new Error('Failed to fetch KPI snapshots');
      return res.json();
    },
  });

  // 3. Run Night Audit Mutation
  const runAuditMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      const res = await fetch(`/api/v1/night-audit/run?branchId=${activeBranchId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
        },
        body: JSON.stringify({ force: true }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || 'Night audit execution failed');
      }
      return res.json();
    },
    onSuccess: () => {
      refetchAudit();
      refetchKpis();
      queryClient.invalidateQueries({ queryKey: ['board-compact'] });
      queryClient.invalidateQueries({ queryKey: ['branch-info'] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message);
    },
  });

  const latestKpi = kpis && kpis.length > 0 ? kpis[0] : null;

  return (
    <div className="container-fluid py-4 px-4 bg-light-subtle min-vh-100">
      {/* Top Banner */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 bg-white p-4 rounded-3 shadow-sm border">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <h4 className="fw-bold text-dark mb-0">Night Audit Automation State Machine</h4>
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 font-monospace">
              Business Date: {audit?.businessDate || businessDate}
            </span>
            <span
              className={`badge px-2 py-1 ${
                audit?.status === 'completed'
                  ? 'bg-success text-white'
                  : audit?.status === 'running'
                  ? 'bg-warning text-dark'
                  : 'bg-secondary text-white'
              }`}
            >
              {audit?.status ? audit.status.toUpperCase() : 'PENDING'}
            </span>
          </div>
          <p className="text-muted small mb-0">
            Resumable end-of-day sequence guaranteeing idempotent financial posting, automated rate & tax charges, and business date roll.
          </p>
        </div>

        <div className="d-flex gap-2 mt-3 mt-md-0">
          <button
            type="button"
            className="btn btn-outline-secondary d-flex align-items-center gap-1"
            onClick={() => {
              refetchAudit();
              refetchKpis();
            }}
          >
            <i className="bi bi-arrow-clockwise" /> Refresh
          </button>

          <button
            type="button"
            className="btn btn-primary fw-semibold px-4 d-flex align-items-center gap-2 shadow-sm"
            disabled={runAuditMutation.isPending}
            onClick={() => runAuditMutation.mutate()}
          >
            {runAuditMutation.isPending ? (
              <>
                <span className="spinner-border spinner-border-sm" />
                <span>Running State Machine...</span>
              </>
            ) : (
              <>
                <i className="bi bi-play-circle-fill" />
                <span>{audit?.status === 'completed' ? 'Re-run Night Audit' : 'Execute Night Audit'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="alert alert-danger d-flex align-items-center gap-2 shadow-sm mb-4">
          <i className="bi bi-exclamation-triangle-fill fs-5" />
          <div>
            <strong>State Machine Exception:</strong> {errorMessage}
          </div>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-3 p-3 bg-white">
            <span className="text-muted small text-uppercase fw-bold">Occupancy Rate</span>
            <div className="d-flex align-items-baseline gap-2 mt-1">
              <h3 className="fw-bold text-primary mb-0">{latestKpi ? `${latestKpi.occupancyRate.toFixed(1)}%` : '--'}</h3>
              <small className="text-muted">{latestKpi ? `${latestKpi.roomsOccupied} / ${latestKpi.totalRooms} rooms` : ''}</small>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-3 p-3 bg-white">
            <span className="text-muted small text-uppercase fw-bold">Total Daily Revenue</span>
            <div className="d-flex align-items-baseline gap-2 mt-1">
              <h3 className="fw-bold text-success mb-0">{latestKpi ? `$${latestKpi.totalRevenue.toFixed(2)}` : '--'}</h3>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-3 p-3 bg-white">
            <span className="text-muted small text-uppercase fw-bold">Average Daily Rate (ADR)</span>
            <div className="d-flex align-items-baseline gap-2 mt-1">
              <h3 className="fw-bold text-dark mb-0">{latestKpi ? `$${latestKpi.adr.toFixed(2)}` : '--'}</h3>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-3 p-3 bg-white">
            <span className="text-muted small text-uppercase fw-bold">RevPAR</span>
            <div className="d-flex align-items-baseline gap-2 mt-1">
              <h3 className="fw-bold text-dark mb-0">{latestKpi ? `$${latestKpi.revpar.toFixed(2)}` : '--'}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* State Machine Step Pipeline */}
      <div className="card border-0 shadow-sm rounded-3 bg-white p-4 mb-4">
        <h5 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
          <i className="bi bi-cpu text-primary" /> State Machine Execution Pipeline
        </h5>

        <div className="row g-3">
          {(audit?.steps || []).map((step, idx) => {
            const info = STEP_LABELS[step.stepKey] || {
              label: step.stepKey,
              desc: 'Custom audit pipeline step',
              icon: 'bi-check2-circle',
            };
            const isDone = step.status === 'completed';
            const isRunning = step.status === 'in_progress';
            const isFailed = step.status === 'failed';

            return (
              <div key={step.stepKey} className="col-md-4">
                <div
                  className={`p-3 border rounded-3 h-100 transition-all ${
                    isDone
                      ? 'border-success-subtle bg-success-subtle'
                      : isRunning
                      ? 'border-primary bg-primary-subtle shadow-sm'
                      : isFailed
                      ? 'border-danger bg-danger-subtle'
                      : 'bg-light'
                  }`}
                >
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <span className="badge rounded-circle bg-white text-dark shadow-sm px-2 py-1 small fw-bold">
                      {idx + 1}
                    </span>
                    <span
                      className={`badge ${
                        isDone
                          ? 'bg-success'
                          : isRunning
                          ? 'bg-primary'
                          : isFailed
                          ? 'bg-danger'
                          : 'bg-secondary'
                      }`}
                    >
                      {step.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="d-flex align-items-center gap-2 mb-1">
                    <i className={`bi ${info.icon} fs-5 ${isDone ? 'text-success' : 'text-primary'}`} />
                    <strong className="text-dark small">{info.label}</strong>
                  </div>
                  <p className="text-muted small mb-2" style={{ fontSize: '0.78rem' }}>
                    {info.desc}
                  </p>

                  {step.errorMessage && (
                    <div className="alert alert-danger py-1 px-2 small mb-0" style={{ fontSize: '0.72rem' }}>
                      {step.errorMessage}
                    </div>
                  )}

                  {step.finishedAt && (
                    <small className="text-success d-block" style={{ fontSize: '0.72rem' }}>
                      <i className="bi bi-clock me-1" />
                      Completed: {new Date(step.finishedAt).toLocaleTimeString()}
                    </small>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Historical Audit & KPI Records */}
      <div className="card border-0 shadow-sm rounded-3 bg-white p-4">
        <h5 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
          <i className="bi bi-table text-primary" /> Daily KPI & Audit Trail History
        </h5>

        {loadingKpis ? (
          <div className="text-center py-4 text-muted">Loading audit history...</div>
        ) : (kpis || []).length === 0 ? (
          <div className="text-center py-4 text-muted">No KPI snapshots generated yet. Execute Night Audit to generate day 1 statistics.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light text-uppercase small text-muted">
                <tr>
                  <th>Business Date</th>
                  <th className="text-center">Total Rooms</th>
                  <th className="text-center">Occupied</th>
                  <th className="text-center">Occupancy %</th>
                  <th className="text-end">Room Revenue</th>
                  <th className="text-end">ADR</th>
                  <th className="text-end">RevPAR</th>
                  <th className="text-end pe-3">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {kpis?.map((k) => (
                  <tr key={k.id}>
                    <td className="fw-bold text-dark">{k.businessDate}</td>
                    <td className="text-center">{k.totalRooms}</td>
                    <td className="text-center">{k.roomsOccupied}</td>
                    <td className="text-center">
                      <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                        {k.occupancyRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="text-end">${k.roomRevenue.toFixed(2)}</td>
                    <td className="text-end">${k.adr.toFixed(2)}</td>
                    <td className="text-end">${k.revpar.toFixed(2)}</td>
                    <td className="text-end fw-bold text-success pe-3">${k.totalRevenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
