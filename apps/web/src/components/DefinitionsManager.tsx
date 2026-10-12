import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import { apiFetch, ApiError } from '../lib/http.js';
import { PropertyStructureManager } from './PropertyStructureManager';

interface StatusDef {
  id: string;
  entity: string;
  code: string;
  label: string;
  colorToken: string;
  icon?: string | null;
  sort: number;
  isSellable: boolean;
  isOccupied: boolean;
  isDirty: boolean;
  blocksBooking: boolean;
  systemKey?: string | null;
}

interface ActionDef {
  id: string;
  entity: string;
  code: string;
  label: string;
  icon?: string | null;
  groupCode?: string | null;
  permission: string;
  target: { type: string; key?: string; to?: string };
  sort: number;
  enabled: boolean;
}

interface CustomFieldDef {
  id: string;
  entity: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
  sort: number;
}

interface NavigationConfig {
  id: string;
  tenantId: string;
  roleCode: string | null;
  items: unknown[];
  updatedAt: string | null;
}

type Tab = 'statuses' | 'actions' | 'custom-fields' | 'navigation' | 'property-structure';

const CUSTOM_FIELD_TYPES = [
  'text',
  'number',
  'decimal',
  'date',
  'select',
  'multiselect',
  'boolean',
  'file',
];

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

export const DefinitionsManager: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();
  const [tab, setTab] = useState<Tab>('statuses');
  const [entity, setEntity] = useState('unit');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const notify = (msg: string) => {
    setMessage(msg);
    setError('');
    setTimeout(() => setMessage(''), 4000);
  };
  const fail = (err: unknown) => {
    setError(errorMessage(err));
    setMessage('');
  };

  const statusQuery = useQuery<StatusDef[]>({
    queryKey: ['ui-status-defs', activeTenantId, entity, activeBranchId],
    queryFn: () =>
      apiFetch<StatusDef[]>(`/api/v1/ui/status-defs?entity=${entity}&branchId=${activeBranchId}`),
    enabled: tab === 'statuses',
  });
  const actionQuery = useQuery<ActionDef[]>({
    queryKey: ['ui-actions-all', activeTenantId, entity, activeBranchId],
    queryFn: () =>
      apiFetch<ActionDef[]>(`/api/v1/ui/actions?entity=${entity}&branchId=${activeBranchId}`),
    enabled: tab === 'actions',
  });
  const customFieldQuery = useQuery<CustomFieldDef[]>({
    queryKey: ['ui-custom-fields', activeTenantId, entity],
    queryFn: () => apiFetch<CustomFieldDef[]>(`/api/v1/ui/custom-fields?entity=${entity}`),
    enabled: tab === 'custom-fields',
  });
  const navigationQuery = useQuery<NavigationConfig[]>({
    queryKey: ['ui-navigation-configs', activeTenantId],
    queryFn: () => apiFetch<NavigationConfig[]>('/api/v1/ui/navigation/configs'),
    enabled: tab === 'navigation',
  });

  const createStatus = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch('/api/v1/ui/status-defs', { method: 'POST', body: payload }),
    onSuccess: () => {
      notify('Status definition created');
      queryClient.invalidateQueries({ queryKey: ['ui-status-defs'] });
    },
    onError: fail,
  });
  const deleteStatus = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/ui/status-defs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify('Status definition deleted');
      queryClient.invalidateQueries({ queryKey: ['ui-status-defs'] });
    },
    onError: fail,
  });

  const createAction = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch('/api/v1/ui/actions', { method: 'POST', body: payload }),
    onSuccess: () => {
      notify('Action definition created');
      queryClient.invalidateQueries({ queryKey: ['ui-actions-all'] });
    },
    onError: fail,
  });
  const deleteAction = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/ui/actions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify('Action definition deleted');
      queryClient.invalidateQueries({ queryKey: ['ui-actions-all'] });
    },
    onError: fail,
  });

  const createCustomField = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch('/api/v1/ui/custom-fields', { method: 'POST', body: payload }),
    onSuccess: () => {
      notify('Custom field created');
      queryClient.invalidateQueries({ queryKey: ['ui-custom-fields'] });
    },
    onError: fail,
  });
  const deleteCustomField = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/ui/custom-fields/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify('Custom field deleted');
      queryClient.invalidateQueries({ queryKey: ['ui-custom-fields'] });
    },
    onError: fail,
  });

  const saveNavigation = useMutation({
    mutationFn: (payload: { roleCode: string | null; items: unknown[] }) =>
      apiFetch('/api/v1/ui/navigation/configs', { method: 'PUT', body: payload }),
    onSuccess: () => {
      notify('Navigation configuration saved');
      queryClient.invalidateQueries({ queryKey: ['ui-navigation-configs'] });
      queryClient.invalidateQueries({ queryKey: ['ui-navigation'] });
    },
    onError: fail,
  });
  const deleteNavigation = useMutation({
    mutationFn: (roleCode: string) =>
      apiFetch(`/api/v1/ui/navigation/configs?roleCode=${encodeURIComponent(roleCode)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      notify('Navigation configuration removed (falls back to the default tree)');
      queryClient.invalidateQueries({ queryKey: ['ui-navigation-configs'] });
      queryClient.invalidateQueries({ queryKey: ['ui-navigation'] });
    },
    onError: fail,
  });

  const [statusForm, setStatusForm] = useState({
    code: '',
    label: '',
    colorToken: 'status-new',
    icon: 'bi-circle',
    isSellable: false,
    isOccupied: false,
    isDirty: false,
    blocksBooking: false,
  });
  const [actionForm, setActionForm] = useState({
    code: '',
    label: '',
    permission: '',
    icon: 'bi-gear',
    groupCode: '',
    targetType: 'modal',
    targetKey: '',
  });
  const [fieldForm, setFieldForm] = useState({
    key: '',
    label: '',
    type: 'text',
    required: false,
    options: '',
  });
  const [navRoleCode, setNavRoleCode] = useState('');
  const [navJson, setNavJson] = useState('[]');

  const loadNavigationConfig = (config: NavigationConfig) => {
    setNavRoleCode(config.roleCode ?? '');
    setNavJson(JSON.stringify(config.items, null, 2));
  };

  const submitNavigation = () => {
    let items: unknown[];
    try {
      const parsed = JSON.parse(navJson);
      if (!Array.isArray(parsed)) {
        throw new Error('Navigation items must be a JSON array');
      }
      items = parsed;
    } catch (err) {
      fail(err);
      return;
    }
    saveNavigation.mutate({ roleCode: navRoleCode.trim() || null, items });
  };

  const tabButton = (value: Tab, label: string, icon: string) => (
    <button
      type="button"
      className={`btn btn-sm rounded-pill px-3 fw-semibold ${tab === value ? 'btn-primary' : 'btn-light text-muted'}`}
      onClick={() => setTab(value)}
    >
      <i className={`bi ${icon} me-1`} />
      {label}
    </button>
  );

  return (
    <div className="card shadow-sm border-0">
      <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
            <i className="bi bi-diagram-3 text-primary" />
            Status, Action &amp; Custom-Field Definitions
          </h6>
          <span className="text-muted" style={{ fontSize: '0.78rem' }}>
            Tenant-configurable metadata that drives board colors, context menus, and entity attributes.
          </span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="small text-muted fw-semibold">Entity:</span>
          <select
            className="form-select form-select-sm"
            style={{ width: '150px' }}
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            <option value="unit">unit</option>
            <option value="reservation">reservation</option>
            <option value="table">table</option>
            <option value="hk_task">hk_task</option>
            <option value="order">order</option>
            <option value="voucher">voucher</option>
            <option value="guest">guest</option>
          </select>
        </div>
      </div>

      <div className="card-body d-flex flex-column gap-3">
        <div className="d-flex flex-wrap gap-2">
          {tabButton('statuses', 'Statuses', 'bi-palette')}
          {tabButton('actions', 'Actions', 'bi-lightning-charge')}
          {tabButton('custom-fields', 'Custom Fields', 'bi-input-cursor-text')}
          {tabButton('navigation', 'Navigation', 'bi-signpost-split')}
          {tabButton('property-structure', 'Property Structure & Layout', 'bi-building')}
        </div>

        {message && (
          <div className="alert alert-success py-2 px-3 small mb-0 d-flex align-items-center gap-2">
            <i className="bi bi-check-circle-fill text-success" />
            {message}
          </div>
        )}
        {error && (
          <div className="alert alert-danger py-2 px-3 small mb-0 d-flex align-items-center gap-2">
            <i className="bi bi-exclamation-triangle-fill" />
            {error}
          </div>
        )}

        {tab === 'property-structure' && <PropertyStructureManager />}

        {tab === 'statuses' && (
          <>
            <div className="row g-2 align-items-end">
              <div className="col-md-2">
                <label className="form-label small fw-semibold text-muted mb-1">Code</label>
                <input
                  className="form-control form-control-sm"
                  value={statusForm.code}
                  onChange={(e) => setStatusForm({ ...statusForm, code: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-semibold text-muted mb-1">Label</label>
                <input
                  className="form-control form-control-sm"
                  value={statusForm.label}
                  onChange={(e) => setStatusForm({ ...statusForm, label: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-semibold text-muted mb-1">Color token</label>
                <input
                  className="form-control form-control-sm font-monospace"
                  value={statusForm.colorToken}
                  onChange={(e) => setStatusForm({ ...statusForm, colorToken: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-semibold text-muted mb-1">Icon</label>
                <input
                  className="form-control form-control-sm"
                  value={statusForm.icon}
                  onChange={(e) => setStatusForm({ ...statusForm, icon: e.target.value })}
                />
              </div>
              <div className="col-md-4 d-flex flex-wrap gap-3">
                {(
                  [
                    ['isSellable', 'Sellable'],
                    ['isOccupied', 'Occupied'],
                    ['isDirty', 'Dirty'],
                    ['blocksBooking', 'Blocks'],
                  ] as const
                ).map(([field, label]) => (
                  <div className="form-check" key={field}>
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`st-${field}`}
                      checked={statusForm[field]}
                      onChange={(e) => setStatusForm({ ...statusForm, [field]: e.target.checked })}
                    />
                    <label className="form-check-label small" htmlFor={`st-${field}`}>
                      {label}
                    </label>
                  </div>
                ))}
              </div>
              <div className="col-md-2">
                <button
                  type="button"
                  className="btn btn-sm btn-primary w-100"
                  disabled={createStatus.isPending || !statusForm.code || !statusForm.label}
                  onClick={() =>
                    createStatus.mutate({
                      entity,
                      ...statusForm,
                      sort: 100,
                    })
                  }
                >
                  <i className="bi bi-plus-circle me-1" />
                  Add Status
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Code</th>
                    <th>Label</th>
                    <th>Color</th>
                    <th>Flags</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {statusQuery.data?.map((st) => (
                    <tr key={st.id}>
                      <td className="font-monospace small">{st.code}</td>
                      <td className="small">{st.label}</td>
                      <td className="font-monospace small text-muted">{st.colorToken}</td>
                      <td className="small text-muted">
                        {[st.isSellable && 'sellable', st.isOccupied && 'occupied', st.isDirty && 'dirty', st.blocksBooking && 'blocks']
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={!!st.systemKey || deleteStatus.isPending}
                          title={st.systemKey ? 'System statuses cannot be deleted' : 'Delete'}
                          onClick={() => deleteStatus.mutate(st.id)}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {statusQuery.data?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-muted small">
                        No status definitions for '{entity}'.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'actions' && (
          <>
            <div className="row g-2 align-items-end">
              <div className="col-md-2">
                <label className="form-label small fw-semibold text-muted mb-1">Code</label>
                <input
                  className="form-control form-control-sm"
                  value={actionForm.code}
                  onChange={(e) => setActionForm({ ...actionForm, code: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-semibold text-muted mb-1">Label</label>
                <input
                  className="form-control form-control-sm"
                  value={actionForm.label}
                  onChange={(e) => setActionForm({ ...actionForm, label: e.target.value })}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-semibold text-muted mb-1">Permission</label>
                <input
                  className="form-control form-control-sm"
                  placeholder="module.resource.action"
                  value={actionForm.permission}
                  onChange={(e) => setActionForm({ ...actionForm, permission: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-semibold text-muted mb-1">Target</label>
                <select
                  className="form-select form-select-sm"
                  value={actionForm.targetType}
                  onChange={(e) => setActionForm({ ...actionForm, targetType: e.target.value })}
                >
                  <option value="modal">modal</option>
                  <option value="wizard">wizard</option>
                  <option value="offcanvas">offcanvas</option>
                  <option value="route">route</option>
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-semibold text-muted mb-1">Target key</label>
                <input
                  className="form-control form-control-sm"
                  value={actionForm.targetKey}
                  onChange={(e) => setActionForm({ ...actionForm, targetKey: e.target.value })}
                />
              </div>
              <div className="col-md-1">
                <button
                  type="button"
                  className="btn btn-sm btn-primary w-100"
                  disabled={createAction.isPending || !actionForm.code || !actionForm.label || !actionForm.permission}
                  onClick={() =>
                    createAction.mutate({
                      entity,
                      code: actionForm.code,
                      label: actionForm.label,
                      icon: actionForm.icon,
                      groupCode: actionForm.groupCode || null,
                      permission: actionForm.permission,
                      target: { type: actionForm.targetType, key: actionForm.targetKey || undefined },
                      sort: 100,
                      enabled: true,
                    })
                  }
                >
                  Add
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Code</th>
                    <th>Label</th>
                    <th>Permission</th>
                    <th>Target</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {actionQuery.data?.map((act) => (
                    <tr key={act.id}>
                      <td className="font-monospace small">{act.code}</td>
                      <td className="small">{act.label}</td>
                      <td className="small text-muted">{act.permission}</td>
                      <td className="small text-muted">{act.target?.type}</td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={deleteAction.isPending}
                          onClick={() => deleteAction.mutate(act.id)}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {actionQuery.data?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-muted small">
                        No action definitions for '{entity}'.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'custom-fields' && (
          <>
            <div className="row g-2 align-items-end">
              <div className="col-md-2">
                <label className="form-label small fw-semibold text-muted mb-1">Key</label>
                <input
                  className="form-control form-control-sm font-monospace"
                  placeholder="snake_case"
                  value={fieldForm.key}
                  onChange={(e) => setFieldForm({ ...fieldForm, key: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-semibold text-muted mb-1">Label</label>
                <input
                  className="form-control form-control-sm"
                  value={fieldForm.label}
                  onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-semibold text-muted mb-1">Type</label>
                <select
                  className="form-select form-select-sm"
                  value={fieldForm.type}
                  onChange={(e) => setFieldForm({ ...fieldForm, type: e.target.value })}
                >
                  {CUSTOM_FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-semibold text-muted mb-1">
                  Options (comma-separated)
                </label>
                <input
                  className="form-control form-control-sm"
                  disabled={fieldForm.type !== 'select' && fieldForm.type !== 'multiselect'}
                  value={fieldForm.options}
                  onChange={(e) => setFieldForm({ ...fieldForm, options: e.target.value })}
                />
              </div>
              <div className="col-md-1">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="cf-required"
                    checked={fieldForm.required}
                    onChange={(e) => setFieldForm({ ...fieldForm, required: e.target.checked })}
                  />
                  <label className="form-check-label small" htmlFor="cf-required">
                    Req.
                  </label>
                </div>
              </div>
              <div className="col-md-2">
                <button
                  type="button"
                  className="btn btn-sm btn-primary w-100"
                  disabled={createCustomField.isPending || !fieldForm.key || !fieldForm.label}
                  onClick={() =>
                    createCustomField.mutate({
                      entity,
                      key: fieldForm.key,
                      label: fieldForm.label,
                      type: fieldForm.type,
                      required: fieldForm.required,
                      options: fieldForm.options
                        .split(',')
                        .map((o) => o.trim())
                        .filter(Boolean),
                      sort: 100,
                    })
                  }
                >
                  <i className="bi bi-plus-circle me-1" />
                  Add Field
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Key</th>
                    <th>Label</th>
                    <th>Type</th>
                    <th>Required</th>
                    <th>Options</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customFieldQuery.data?.map((f) => (
                    <tr key={f.id}>
                      <td className="font-monospace small">{f.key}</td>
                      <td className="small">{f.label}</td>
                      <td className="small text-muted">{f.type}</td>
                      <td className="small text-muted">{f.required ? 'yes' : 'no'}</td>
                      <td className="small text-muted">{(f.options || []).join(', ') || '—'}</td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={deleteCustomField.isPending}
                          onClick={() => deleteCustomField.mutate(f.id)}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {customFieldQuery.data?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-muted small">
                        No custom fields for '{entity}'.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'navigation' && (
          <>
            <div className="row g-2 align-items-end">
              <div className="col-md-3">
                <label className="form-label small fw-semibold text-muted mb-1">Role code</label>
                <input
                  className="form-control form-control-sm font-monospace"
                  placeholder="blank = tenant default (e.g. admin, manager)"
                  value={navRoleCode}
                  onChange={(e) => setNavRoleCode(e.target.value)}
                />
              </div>
              <div className="col-md-7">
                <label className="form-label small fw-semibold text-muted mb-1">
                  Items (JSON array of {'{ key, label, path, icon, permission?, badge?, children? }'})
                </label>
                <textarea
                  className="form-control form-control-sm font-monospace"
                  rows={6}
                  value={navJson}
                  onChange={(e) => setNavJson(e.target.value)}
                />
              </div>
              <div className="col-md-2 d-flex flex-column gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={saveNavigation.isPending}
                  onClick={submitNavigation}
                >
                  <i className="bi bi-save me-1" />
                  Save
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  disabled={deleteNavigation.isPending || !navRoleCode.trim()}
                  title={navRoleCode.trim() ? 'Remove this override' : 'Tenant default cannot be deleted'}
                  onClick={() => deleteNavigation.mutate(navRoleCode.trim())}
                >
                  <i className="bi bi-trash me-1" />
                  Reset
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Role</th>
                    <th>Top-level items</th>
                    <th>Updated</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {navigationQuery.data?.map((cfg) => (
                    <tr key={cfg.id}>
                      <td className="font-monospace small">{cfg.roleCode ?? 'tenant default'}</td>
                      <td className="small text-muted">{cfg.items.length}</td>
                      <td className="small text-muted">
                        {cfg.updatedAt ? new Date(cfg.updatedAt).toLocaleString() : '—'}
                      </td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary me-1"
                          onClick={() => loadNavigationConfig(cfg)}
                        >
                          <i className="bi bi-pencil-square" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={deleteNavigation.isPending}
                          onClick={() => deleteNavigation.mutate(cfg.roleCode ?? '')}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {navigationQuery.data?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-muted small">
                        No overrides yet — the permission-filtered default tree is used.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
