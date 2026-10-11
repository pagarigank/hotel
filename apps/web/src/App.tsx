import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from './stores/useAppStore';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { SettingsView } from './components/SettingsView';
import { ManagerOverrideModal } from './components/ManagerOverrideModal';

interface HealthData {
  status: string;
  database: {
    connected: boolean;
    user: string;
  };
}

interface TestRecord {
  id: string;
  tenantId: string;
  branchId?: string;
  title: string;
  content: string;
  version: number;
  createdAt: string;
}

export function App() {
  const queryClient = useQueryClient();
  const {
    activeTenantId,
    activeTenantName,
    activeBranchId,
    activeBranchName,
    businessDate,
  } = useAppStore();

  const [currentTab, setCurrentTab] = useState<'settings' | 'records'>('settings');
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  // 1. Fetch Health Status
  const { data: health } = useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/health/ready');
      if (!res.ok) throw new Error('Health check failed');
      return res.json();
    },
    refetchInterval: 10000,
  });

  // 2. Fetch Tenant-Scoped Records
  const {
    data: records,
    isLoading: recordsLoading,
    error: recordsError,
  } = useQuery<TestRecord[]>({
    queryKey: ['test-records', activeTenantId],
    queryFn: async () => {
      const res = await fetch('/api/v1/test-records', {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error(`Failed to load records: ${res.statusText}`);
      return res.json();
    },
  });

  // 3. Mutation to create record
  const createMutation = useMutation({
    mutationFn: async ({ title, content }: { title: string; content: string }) => {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch('/api/v1/test-records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ title, content, branchId: activeBranchId }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Creation failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setNewTitle('');
      setNewContent('');
      queryClient.invalidateQueries({ queryKey: ['test-records', activeTenantId] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate({ title: newTitle, content: newContent });
  };

  return (
    <div className="app-shell d-flex flex-column bg-light" style={{ minHeight: '100vh' }}>
      {/* Top Bar with Scope & Branch Switcher */}
      <TopBar onOpenOverride={() => setIsOverrideModalOpen(true)} />

      {/* Main Container */}
      <div className="d-flex flex-grow-1">
        {/* Navigation Sidebar */}
        <Sidebar currentTab={currentTab} onSelectTab={(t) => setCurrentTab(t as any)} />

        {/* Content Area */}
        <main className="flex-grow-1 overflow-auto" style={{ minHeight: 'calc(100vh - 60px)' }}>
          {currentTab === 'settings' ? (
            <SettingsView />
          ) : (
            <div className="p-4 max-w-7xl mx-auto d-flex flex-column gap-4">
              {/* Tenant Boundary Indicator Banner */}
              <div className="p-3 bg-white rounded-3 shadow-sm border d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-3">
                  <div
                    className="rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center"
                    style={{ width: '40px', height: '40px' }}
                  >
                    <i className="bi bi-shield-shaded fs-5" />
                  </div>
                  <div>
                    <h6 className="fw-bold mb-0 text-dark">Tenant Isolation & RLS Boundary Active</h6>
                    <span className="text-muted small">
                      Querying database as role <code>{health?.database.user || 'innkeeper_app'}</code> (NOBYPASSRLS enforced)
                    </span>
                  </div>
                </div>

                <div className="badge bg-success-subtle text-success border border-success-subtle px-3 py-2 d-flex align-items-center gap-1">
                  <i className="bi bi-check2-circle" />
                  <span>RLS Isolation Active</span>
                </div>
              </div>

              {/* Data isolation test records */}
              <div className="card shadow-sm border-0">
                <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                  <span className="fw-bold text-dark d-flex align-items-center gap-2">
                    <i className="bi bi-folder text-primary" />
                    Isolated Tenant Records for {activeTenantName}
                  </span>
                  <span className="badge bg-light text-dark border">
                    {records?.length || 0} Records
                  </span>
                </div>

                <div className="card-body">
                  {/* Create form */}
                  <form onSubmit={handleCreate} className="row g-2 mb-4">
                    <div className="col-md-5">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="Record Title (e.g. VIP Booking Note)"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-md-5">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="Content details..."
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                      />
                    </div>
                    <div className="col-md-2">
                      <button
                        type="submit"
                        className="btn btn-sm btn-primary w-100 fw-semibold"
                        disabled={createMutation.isPending}
                      >
                        {createMutation.isPending ? 'Saving...' : 'Add Record'}
                      </button>
                    </div>
                  </form>

                  {/* Table */}
                  {recordsLoading ? (
                    <div className="text-muted small">Loading records...</div>
                  ) : recordsError ? (
                    <div className="alert alert-danger py-2 small">{(recordsError as Error).message}</div>
                  ) : records?.length === 0 ? (
                    <div className="text-muted small py-3 text-center">
                      No records found for {activeTenantName}. Records created here cannot leak to other tenants.
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm table-hover align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th className="small text-muted">ID</th>
                            <th className="small text-muted">Title</th>
                            <th className="small text-muted">Content</th>
                            <th className="small text-muted">Tenant ID</th>
                            <th className="small text-muted">Created At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {records?.map((r) => (
                            <tr key={r.id}>
                              <td className="font-monospace small text-muted">{r.id.slice(0, 8)}...</td>
                              <td className="fw-semibold small">{r.title}</td>
                              <td className="small text-muted">{r.content || '—'}</td>
                              <td className="font-monospace small text-muted">{r.tenantId.slice(0, 8)}...</td>
                              <td className="small text-muted">{new Date(r.createdAt).toLocaleString()}</td>
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
        </main>
      </div>

      {/* Manager Override Modal */}
      <ManagerOverrideModal
        isOpen={isOverrideModalOpen}
        onClose={() => setIsOverrideModalOpen(false)}
      />
    </div>
  );
}
export default App;
