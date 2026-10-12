import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import { apiFetch } from '../lib/http.js';
import { DefinitionsManager } from './DefinitionsManager.js';

interface SettingItem {
  id: string;
  scopeType: string;
  scopeId?: string | null;
  key: string;
  value: any;
  version: number;
}

interface StatusDef {
  id: string;
  code: string;
  label: string;
  colorToken: string;
  icon?: string;
  sort: number;
  isSellable: boolean;
  isOccupied: boolean;
  isDirty: boolean;
  blocksBooking: boolean;
  systemKey?: string;
}

interface ActionDef {
  id: string;
  code: string;
  label: string;
  icon?: string;
  groupCode?: string;
  permission: string;
  visibleWhen: any;
  target: any;
  sort: number;
}

interface RegistryUiMeta {
  control: 'select' | 'number' | 'text' | 'boolean';
  options?: string[];
  min?: number;
  max?: number;
  placeholder?: string;
}

interface RegistryEntry {
  key: string;
  description: string;
  scopes: string[];
  defaultValue: unknown;
  ui?: RegistryUiMeta;
}

export const SettingsView: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeTenantName, activeBranchId, activeBranchName } = useAppStore();

  const [activeScope, setActiveScope] = useState<'tenant' | 'branch'>('tenant');
  const [selectedStatusForActions, setSelectedStatusForActions] = useState('due_in');
  const [numberingDocType, setNumberingDocType] = useState('reservation');
  const [lastGeneratedNumber, setLastGeneratedNumber] = useState<any>(null);
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // 1. Fetch the settings registry (authoritative catalogue of known keys)
  const { data: registry } = useQuery<RegistryEntry[]>({
    queryKey: ['settings-registry'],
    queryFn: () => apiFetch<RegistryEntry[]>('/api/v1/settings/registry'),
  });

  // 2. Fetch current settings rows for the selected scope
  const { data: settingsList } = useQuery<SettingItem[]>({
    queryKey: ['settings', activeTenantId, activeScope, activeBranchId],
    queryFn: () => {
      const scopeParams =
        activeScope === 'branch'
          ? `?scopeType=branch&scopeId=${activeBranchId}`
          : `?scopeType=tenant`;
      return apiFetch<SettingItem[]>(`/api/v1/settings${scopeParams}`);
    },
  });

  // 3. Fetch status definitions
  const { data: statusDefs, isLoading: statusesLoading } = useQuery<StatusDef[]>({
    queryKey: ['ui-status-defs', activeTenantId, activeBranchId],
    queryFn: () =>
      apiFetch<StatusDef[]>(`/api/v1/ui/status-defs?entity=unit&branchId=${activeBranchId}`),
  });

  // 4. Fetch server-evaluated actions for selected status
  const { data: evaluatedActions, isLoading: actionsLoading } = useQuery<ActionDef[]>({
    queryKey: ['ui-actions', activeTenantId, selectedStatusForActions, activeBranchId],
    queryFn: () =>
      apiFetch<ActionDef[]>(
        `/api/v1/ui/actions?entity=unit&status=${selectedStatusForActions}&branchId=${activeBranchId}`,
      ),
  });

  // 5. Mutation to update a setting
  const updateSettingMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) => {
      const payload = {
        value,
        scopeType: activeScope,
        scopeId: activeScope === 'branch' ? activeBranchId : undefined,
      };
      return apiFetch(`/api/v1/settings/${key}`, { method: 'PUT', body: payload });
    },
    onSuccess: (_, variables) => {
      setSaveSuccessMsg(`Saved '${variables.key}' at ${activeScope.toUpperCase()} scope!`);
      setTimeout(() => setSaveSuccessMsg(''), 4000);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  // 6. Mutation to generate gapless number
  const numberingMutation = useMutation({
    mutationFn: (docType: string) =>
      apiFetch('/api/v1/numbering/next', {
        method: 'POST',
        body: { branchId: activeBranchId, docType },
      }),
    onSuccess: (data) => {
      setLastGeneratedNumber(data);
    },
  });

  const changeScope = (scope: 'tenant' | 'branch') => {
    setActiveScope(scope);
    setDrafts({});
  };

  const rowsByKey = new Map((settingsList ?? []).map((s) => [s.key, s.value]));

  const effectiveValue = (entry: RegistryEntry): unknown => {
    if (drafts[entry.key] !== undefined) return drafts[entry.key];
    if (rowsByKey.has(entry.key)) return rowsByKey.get(entry.key);
    return entry.defaultValue;
  };

  const renderControl = (entry: RegistryEntry) => {
    const control = entry.ui?.control ?? 'text';
    const value = effectiveValue(entry);

    if (control === 'select') {
      return (
        <select
          className="form-select form-select-sm"
          style={{ width: '150px' }}
          value={String(value ?? '')}
          onChange={(e) => setDrafts({ ...drafts, [entry.key]: e.target.value })}
        >
          {(entry.ui?.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (control === 'boolean') {
      return (
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => setDrafts({ ...drafts, [entry.key]: e.target.checked })}
          />
        </div>
      );
    }

    if (control === 'number') {
      return (
        <input
          type="number"
          className="form-control form-control-sm"
          style={{ width: '110px' }}
          min={entry.ui?.min}
          max={entry.ui?.max}
          value={Number(value ?? 0)}
          onChange={(e) => setDrafts({ ...drafts, [entry.key]: Number(e.target.value) })}
        />
      );
    }

    return (
      <input
        type="text"
        className="form-control form-control-sm"
        style={{ width: '160px' }}
        placeholder={entry.ui?.placeholder}
        value={String(value ?? '')}
        onChange={(e) => setDrafts({ ...drafts, [entry.key]: e.target.value })}
      />
    );
  };

  return (
    <div className="d-flex flex-column gap-4 p-4 max-w-7xl mx-auto">
      {/* View Header */}
      <div className="d-flex justify-content-between align-items-center">
        <div>
          <h4 className="fw-bold text-dark mb-1 d-flex align-items-center gap-2">
            <i className="bi bi-gear-wide-connected text-primary" />
            Configuration &amp; Settings Engine
          </h4>
          <p className="text-muted small mb-0">
            Registry-driven hierarchical settings (Tenant ▸ Branch), live room status tokens, and server-driven
            action evaluations.
          </p>
        </div>

        {/* Scope Switcher */}
        <div className="btn-group p-1 bg-white border rounded-pill shadow-sm" role="group">
          <button
            type="button"
            className={`btn btn-sm rounded-pill px-3 fw-semibold ${
              activeScope === 'tenant' ? 'btn-primary' : 'btn-light text-muted'
            }`}
            onClick={() => changeScope('tenant')}
          >
            <i className="bi bi-building me-1" />
            Tenant Scope: {activeTenantName}
          </button>
          <button
            type="button"
            className={`btn btn-sm rounded-pill px-3 fw-semibold ${
              activeScope === 'branch' ? 'btn-primary' : 'btn-light text-muted'
            }`}
            onClick={() => changeScope('branch')}
          >
            <i className="bi bi-geo-alt me-1" />
            Branch Override: {activeBranchName}
          </button>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="alert alert-success py-2 px-3 small d-flex align-items-center gap-2 mb-0 shadow-sm">
          <i className="bi bi-check-circle-fill text-success" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}
      {updateSettingMutation.isError && (
        <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-0 shadow-sm">
          <i className="bi bi-exclamation-triangle-fill" />
          <span>Failed to save setting. Check the value against its registered schema.</span>
        </div>
      )}

      {/* Row 1: Hierarchical Settings Editor & Numbering Sequences */}
      <div className="row g-4">
        {/* Settings Registry Editor */}
        <div className="col-lg-7">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
              <span className="fw-bold text-dark d-flex align-items-center gap-2">
                <i className="bi bi-sliders text-primary" />
                Hierarchical Parameters ({activeScope.toUpperCase()} Scope)
              </span>
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                Inheritance: {activeScope === 'branch' ? 'Branch Override' : 'Tenant Default'}
              </span>
            </div>

            <div className="card-body d-flex flex-column gap-3">
              {(registry ?? []).map((entry) => {
                const allowed = entry.scopes.includes(activeScope);
                return (
                  <div
                    key={entry.key}
                    className="p-3 rounded border bg-light-subtle d-flex justify-content-between align-items-center gap-3"
                  >
                    <div className="flex-grow-1">
                      <div className="fw-semibold text-dark small mb-0 font-monospace">{entry.key}</div>
                      <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                        {entry.description}
                      </span>
                      <div className="mt-1">
                        {entry.scopes.map((s) => (
                          <span
                            key={s}
                            className={`badge me-1 ${
                              s === activeScope
                                ? 'bg-primary-subtle text-primary'
                                : 'bg-light text-muted border'
                            }`}
                            style={{ fontSize: '0.65rem' }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      {renderControl(entry)}
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={!allowed || updateSettingMutation.isPending}
                        title={allowed ? 'Save' : `Not writable at ${activeScope} scope`}
                        onClick={() =>
                          updateSettingMutation.mutate({
                            key: entry.key,
                            value: effectiveValue(entry),
                          })
                        }
                      >
                        Save
                      </button>
                    </div>
                  </div>
                );
              })}
              {registry?.length === 0 && (
                <div className="text-muted small">No settings registered.</div>
              )}
            </div>
          </div>
        </div>

        {/* Gapless Numbering Sequences Service */}
        <div className="col-lg-5">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white border-bottom py-3">
              <span className="fw-bold text-dark d-flex align-items-center gap-2">
                <i className="bi bi-123 text-primary" />
                Gapless Numbering Sequences Engine
              </span>
            </div>

            <div className="card-body d-flex flex-column justify-content-between">
              <div>
                <p className="text-muted small mb-3">
                  Thread-safe document numbering with row locks (<code>FOR UPDATE</code>) ensuring zero missing
                  numbers for fiscal compliance.
                </p>

                <div className="mb-3">
                  <label className="form-label small fw-semibold text-muted">Document Type</label>
                  <select
                    className="form-select form-select-sm"
                    value={numberingDocType}
                    onChange={(e) => setNumberingDocType(e.target.value)}
                  >
                    <option value="reservation">Reservation (RES)</option>
                    <option value="folio">Guest Folio (FOL)</option>
                    <option value="invoice">Official Tax Invoice (INV - Gapless)</option>
                    <option value="voucher">Journal Voucher (JV - Gapless)</option>
                  </select>
                </div>

                <button
                  type="button"
                  className="btn btn-sm btn-primary w-100 fw-semibold d-flex align-items-center justify-content-center gap-2"
                  onClick={() => numberingMutation.mutate(numberingDocType)}
                  disabled={numberingMutation.isPending}
                >
                  <i className="bi bi-plus-circle" />
                  Generate Next Sequential Document Number
                </button>
              </div>

              {lastGeneratedNumber && (
                <div className="mt-3 p-3 bg-light rounded border border-primary-subtle">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="text-muted small fw-semibold">Generated Number:</span>
                    <span className="badge bg-success-subtle text-success">
                      {lastGeneratedNumber.isGapless ? 'Fiscal Gapless' : 'Buffered'}
                    </span>
                  </div>
                  <div className="fs-5 fw-bold font-monospace text-primary">
                    {lastGeneratedNumber.docNumber}
                  </div>
                  <div className="small text-muted">
                    Sequence No: <span className="fw-semibold">{lastGeneratedNumber.sequenceNo}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Status Definitions Live Palette with Color Tokens */}
      <div className="card shadow-sm border-0">
        <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
          <div>
            <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-palette text-primary" />
              Room Status Definitions &amp; Contrast-Checked Color Tokens
            </h6>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
              WCAG 2.2 AA compliant tokens (all badges have icons and labels; never color alone)
            </span>
          </div>
        </div>

        <div className="card-body">
          <div className="row g-3">
            {statusesLoading ? (
              <div className="col-12 text-muted small">Loading status definitions...</div>
            ) : (
              statusDefs?.map((st) => (
                <div key={st.id} className="col-md-3 col-sm-6">
                  <div
                    className="p-3 rounded-3 border d-flex flex-column gap-2"
                    style={{
                      backgroundColor: `var(--${st.colorToken}-bg, #f8f9fa)`,
                      borderLeft: `5px solid var(--${st.colorToken}-accent, #0d6efd)`,
                    }}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="fw-bold small d-flex align-items-center gap-2 text-dark">
                        <i className={`bi ${st.icon || 'bi-circle'} text-primary`} />
                        {st.label}
                      </span>
                      <span className="font-monospace text-muted" style={{ fontSize: '0.7rem' }}>
                        {st.code}
                      </span>
                    </div>

                    <div className="d-flex flex-wrap gap-1" style={{ fontSize: '0.68rem' }}>
                      {st.isSellable && <span className="badge bg-success-subtle text-success">Sellable</span>}
                      {st.isOccupied && <span className="badge bg-primary-subtle text-primary">Occupied</span>}
                      {st.isDirty && <span className="badge bg-warning-subtle text-warning">Dirty</span>}
                      {st.blocksBooking && <span className="badge bg-danger-subtle text-danger">Blocks Booking</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Server-driven Action Evaluator Inspector */}
      <div className="card shadow-sm border-0">
        <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
          <div>
            <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-lightning-charge text-primary" />
              Server-Driven Action Menu Evaluator (<code>GET /api/v1/ui/actions</code>)
            </h6>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
              Dynamic context menu resolution based on entity state-machine and RBAC permissions
            </span>
          </div>

          <div className="d-flex align-items-center gap-2">
            <span className="small text-muted fw-semibold">Unit Status:</span>
            <select
              className="form-select form-select-sm"
              style={{ width: '160px' }}
              value={selectedStatusForActions}
              onChange={(e) => setSelectedStatusForActions(e.target.value)}
            >
              <option value="due_in">Due In</option>
              <option value="vacant_clean">Vacant Clean</option>
              <option value="vacant_dirty">Vacant Dirty</option>
              <option value="occupied">Occupied</option>
              <option value="due_out">Due Out</option>
              <option value="out_of_order">Out of Order</option>
            </select>
          </div>
        </div>

        <div className="card-body">
          <p className="text-muted small mb-3">
            Active server actions evaluated for unit status <strong>{selectedStatusForActions}</strong>:
          </p>

          <div className="d-flex flex-wrap gap-3">
            {actionsLoading ? (
              <div className="text-muted small">Evaluating permitted actions...</div>
            ) : evaluatedActions?.length === 0 ? (
              <div className="text-muted small">No actions enabled for status '{selectedStatusForActions}'</div>
            ) : (
              evaluatedActions?.map((act) => (
                <div
                  key={act.id}
                  className="card p-3 border shadow-none d-flex flex-column gap-2"
                  style={{ width: '220px', background: '#fafbfc' }}
                >
                  <div className="d-flex align-items-center gap-2 fw-semibold text-dark">
                    <i className={`bi ${act.icon || 'bi-gear'} text-primary fs-5`} />
                    <span>{act.label}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center pt-2 border-top">
                    <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '0.65rem' }}>
                      Target: {act.target?.type || 'modal'}
                    </span>
                    <span className="badge bg-light text-muted border" style={{ fontSize: '0.65rem' }}>
                      {act.permission}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row 4: Editable Definitions Manager */}
      <DefinitionsManager />
    </div>
  );
};
