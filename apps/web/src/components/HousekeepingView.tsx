import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type { HkTaskDto, MaintenanceOrderDto, LostFoundDto, HkChecklistItem } from '@innkeeper/contracts';

export const HousekeepingView: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, businessDate } = useAppStore();

  const [activeTab, setActiveTab] = useState<'tasks' | 'maintenance' | 'lost_found'>('tasks');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Selected task for interactive checklist modal
  const [selectedTask, setSelectedTask] = useState<HkTaskDto | null>(null);
  const [checklistState, setChecklistState] = useState<HkChecklistItem[]>([]);

  // Minibar posting modal
  const [minibarTask, setMinibarTask] = useState<HkTaskDto | null>(null);
  const [minibarItem, setMinibarItem] = useState('Premium Sparkling Water 500ml');
  const [minibarQty, setMinibarQty] = useState(1);
  const [minibarPrice, setMinibarPrice] = useState(8.5);
  const [minibarError, setMinibarError] = useState<string | null>(null);

  // New Maintenance Order modal
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [maintTitle, setMaintTitle] = useState('');
  const [maintPriority, setMaintPriority] = useState<'low' | 'medium' | 'high' | 'emergency'>('medium');
  const [maintUnitNumber, setMaintUnitNumber] = useState('');
  const [maintDesc, setMaintDesc] = useState('');

  // New Lost & Found modal
  const [isLostFoundModalOpen, setIsLostFoundModalOpen] = useState(false);
  const [lfDescription, setLfDescription] = useState('');
  const [lfLocation, setLfLocation] = useState('');
  const [lfCategory, setLfCategory] = useState<'electronics' | 'clothing' | 'jewelry' | 'document' | 'cash' | 'other'>('electronics');

  // 1. Fetch Housekeeping Tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<HkTaskDto[]>({
    queryKey: ['hk-tasks', activeTenantId, activeBranchId, statusFilter, priorityFilter],
    queryFn: async () => {
      let url = `/api/v1/housekeeping/tasks?branchId=${activeBranchId}`;
      if (statusFilter !== 'all') url += `&status=${statusFilter}`;
      const res = await fetch(url, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load HK tasks');
      return res.json();
    },
  });

  // 2. Fetch Maintenance Orders
  const { data: maintenanceOrders = [], isLoading: maintLoading } = useQuery<MaintenanceOrderDto[]>({
    queryKey: ['maintenance-orders', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/housekeeping/maintenance?branchId=${activeBranchId}`, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load maintenance orders');
      return res.json();
    },
  });

  // 3. Fetch Lost and Found items
  const { data: lostFoundItems = [], isLoading: lfLoading } = useQuery<LostFoundDto[]>({
    queryKey: ['lost-found', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/housekeeping/lost-found?branchId=${activeBranchId}`, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load lost & found items');
      return res.json();
    },
  });

  // 4. Update HK Task Status Mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      status,
      notes,
    }: {
      taskId: string;
      status: 'pending' | 'in_progress' | 'completed' | 'inspected' | 'rejected';
      notes?: string;
    }) => {
      const res = await fetch(`/api/v1/housekeeping/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to update task');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hk-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['board-units'] });
      setSelectedTask(null);
    },
  });

  // 5. Post Minibar Charge Mutation
  const minibarMutation = useMutation({
    mutationFn: async () => {
      if (!minibarTask) throw new Error('No task selected');
      const res = await fetch(`/api/v1/housekeeping/minibar-charges`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          unitId: minibarTask.unitId,
          itemName: minibarItem,
          qty: minibarQty,
          unitAmount: minibarPrice,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to post minibar charge');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hk-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['folio'] });
      queryClient.invalidateQueries({ queryKey: ['front-desk-stays'] });
      setMinibarTask(null);
      setMinibarError(null);
    },
    onError: (err: any) => {
      setMinibarError(err.message);
    },
  });

  // 6. Create Maintenance Order Mutation
  const createMaintMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/housekeeping/maintenance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          title: maintTitle,
          priority: maintPriority,
          description: maintDesc || 'Reported maintenance work order',
          unitId: 'u0000000-0000-0000-0000-000000000101', // Fallback or selected room
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create work order');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-orders'] });
      setIsMaintenanceModalOpen(false);
      setMaintTitle('');
      setMaintDesc('');
    },
  });

  // 7. Create Lost & Found Item Mutation
  const createLostFoundMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/housekeeping/lost-found`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          itemName: lfDescription,
          category: lfCategory,
          foundLocation: lfLocation,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to record lost item');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lost-found'] });
      setIsLostFoundModalOpen(false);
      setLfDescription('');
      setLfLocation('');
    },
  });

  const openChecklist = (task: HkTaskDto) => {
    setSelectedTask(task);
    if (task.checklistItems && task.checklistItems.length > 0) {
      setChecklistState(task.checklistItems);
    } else {
      setChecklistState([
        { id: '1', label: 'Strip bed linen & replace with fresh sanitized sheets', checked: false, mandatory: true },
        { id: '2', label: 'Scrub & disinfect bathroom fixtures, refill premium amenities', checked: false, mandatory: true },
        { id: '3', label: 'Dust all surfaces, TV console, and wardrobe interiors', checked: false, mandatory: true },
        { id: '4', label: 'Vacuum carpet & mop balcony/hardwood zones', checked: false, mandatory: true },
        { id: '5', label: 'Audit minibar stock & record beverage consumption', checked: false, mandatory: false },
      ]);
    }
  };

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const inspectedCount = tasks.filter((t) => t.status === 'inspected').length;

  return (
    <div className="p-4 max-w-7xl mx-auto d-flex flex-column gap-4">
      {/* Header Banner */}
      <div className="p-4 bg-white rounded-3 shadow-sm border d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle bg-info-subtle text-info-emphasis d-flex align-items-center justify-content-center"
            style={{ width: '48px', height: '48px' }}
          >
            <i className="bi bi-brush-fill fs-4" />
          </div>
          <div>
            <div className="d-flex align-items-center gap-2">
              <h4 className="fw-bold mb-0 text-dark">Housekeeping & Facility Operations</h4>
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                Business Date: {businessDate}
              </span>
            </div>
            <p className="text-muted small mb-0">
              Turnover task dispatch, mobile attendant checklist, minibar folio charges, and maintenance work orders.
            </p>
          </div>
        </div>

        <div className="d-flex gap-2">
          {activeTab === 'maintenance' && (
            <button
              type="button"
              className="btn btn-primary d-flex align-items-center gap-2 shadow-sm"
              onClick={() => setIsMaintenanceModalOpen(true)}
            >
              <i className="bi bi-tools" />
              <span>New Work Order</span>
            </button>
          )}

          {activeTab === 'lost_found' && (
            <button
              type="button"
              className="btn btn-primary d-flex align-items-center gap-2 shadow-sm"
              onClick={() => setIsLostFoundModalOpen(true)}
            >
              <i className="bi bi-box-seam" />
              <span>Log Found Item</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline-secondary d-flex align-items-center gap-2"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['hk-tasks'] });
              queryClient.invalidateQueries({ queryKey: ['maintenance-orders'] });
              queryClient.invalidateQueries({ queryKey: ['lost-found'] });
            }}
          >
            <i className="bi bi-arrow-clockwise" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <ul className="nav nav-pills bg-white p-2 rounded-3 shadow-sm border">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link d-flex align-items-center gap-2 fw-semibold ${
              activeTab === 'tasks' ? 'active shadow-sm' : 'text-secondary'
            }`}
            onClick={() => setActiveTab('tasks')}
          >
            <i className="bi bi-check2-square" />
            <span>Housekeeping Tasks</span>
            <span className="badge bg-light text-dark border ms-1">{tasks.length}</span>
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link d-flex align-items-center gap-2 fw-semibold ${
              activeTab === 'maintenance' ? 'active shadow-sm' : 'text-secondary'
            }`}
            onClick={() => setActiveTab('maintenance')}
          >
            <i className="bi bi-wrench-adjustable-circle" />
            <span>Maintenance Work Orders</span>
            <span className="badge bg-light text-dark border ms-1">{maintenanceOrders.length}</span>
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link d-flex align-items-center gap-2 fw-semibold ${
              activeTab === 'lost_found' ? 'active shadow-sm' : 'text-secondary'
            }`}
            onClick={() => setActiveTab('lost_found')}
          >
            <i className="bi bi-archive" />
            <span>Lost & Found Catalog</span>
            <span className="badge bg-light text-dark border ms-1">{lostFoundItems.length}</span>
          </button>
        </li>
      </ul>

      {/* TAB 1: Housekeeping Tasks */}
      {activeTab === 'tasks' && (
        <div className="d-flex flex-column gap-3">
          {/* Quick Metrics Bar */}
          <div className="row g-3">
            <div className="col-md-3">
              <div className="card shadow-sm border-0 border-start border-4 border-warning bg-white p-3">
                <span className="text-muted small text-uppercase fw-bold">Pending Clean</span>
                <h3 className="fw-bold text-warning-emphasis mb-0">{pendingCount}</h3>
              </div>
            </div>
            <div className="col-md-3">
              <div className="card shadow-sm border-0 border-start border-4 border-primary bg-white p-3">
                <span className="text-muted small text-uppercase fw-bold">In Progress</span>
                <h3 className="fw-bold text-primary mb-0">{inProgressCount}</h3>
              </div>
            </div>
            <div className="col-md-3">
              <div className="card shadow-sm border-0 border-start border-4 border-info bg-white p-3">
                <span className="text-muted small text-uppercase fw-bold">Ready for Inspection</span>
                <h3 className="fw-bold text-info-emphasis mb-0">{completedCount}</h3>
              </div>
            </div>
            <div className="col-md-3">
              <div className="card shadow-sm border-0 border-start border-4 border-success bg-white p-3">
                <span className="text-muted small text-uppercase fw-bold">Inspected & Ready</span>
                <h3 className="fw-bold text-success mb-0">{inspectedCount}</h3>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white p-3 rounded-3 shadow-sm border d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div className="d-flex align-items-center gap-2">
              <span className="small text-muted fw-bold">Status:</span>
              <div className="btn-group btn-group-sm">
                {['all', 'pending', 'in_progress', 'completed', 'inspected'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`btn ${statusFilter === st ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setStatusFilter(st)}
                  >
                    {st.replace('_', ' ').toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="d-flex align-items-center gap-2">
              <span className="small text-muted fw-bold">Priority:</span>
              <div className="btn-group btn-group-sm">
                {['all', 'rush', 'high', 'standard', 'low'].map((pr) => (
                  <button
                    key={pr}
                    type="button"
                    className={`btn ${priorityFilter === pr ? 'btn-dark' : 'btn-outline-secondary'}`}
                    onClick={() => setPriorityFilter(pr)}
                  >
                    {pr.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Task Grid / Cards */}
          {tasksLoading ? (
            <div className="p-5 text-center text-muted bg-white rounded-3 border">Loading housekeeping tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="p-5 text-center text-muted bg-white rounded-3 border">
              <i className="bi bi-check2-circle fs-2 text-success d-block mb-2" />
              <p className="mb-0 fw-semibold">No cleaning tasks match the selected filters.</p>
            </div>
          ) : (
            <div className="row g-3">
              {tasks.map((task) => {
                const priorityBadge =
                  task.priority === 'rush'
                    ? 'bg-danger text-white'
                    : task.priority === 'high'
                    ? 'bg-warning text-dark'
                    : 'bg-secondary-subtle text-secondary';

                const statusBadge =
                  task.status === 'inspected'
                    ? 'bg-success text-white'
                    : task.status === 'completed'
                    ? 'bg-info text-white'
                    : task.status === 'in_progress'
                    ? 'bg-primary text-white'
                    : task.status === 'rejected'
                    ? 'bg-danger text-white'
                    : 'bg-warning-subtle text-warning-emphasis';

                return (
                  <div key={task.id} className="col-md-6 col-lg-4">
                    <div className="card shadow-sm border h-100 rounded-3 hover-shadow transition-all bg-white">
                      <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center gap-2">
                          <span className="font-monospace fw-bold fs-5 text-dark">
                            Room {task.unitNumber || 'TBD'}
                          </span>
                          <span className={`badge ${priorityBadge} text-uppercase`} style={{ fontSize: '0.65rem' }}>
                            {task.priority}
                          </span>
                        </div>
                        <span className={`badge ${statusBadge} text-uppercase`} style={{ fontSize: '0.65rem' }}>
                          {task.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="card-body p-3 d-flex flex-column gap-2">
                        <div>
                          <span className="text-muted small d-block">Task Type</span>
                          <span className="fw-semibold text-dark">
                            {task.taskType.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>

                        {task.notes && (
                          <div className="p-2 bg-light rounded-2 border text-muted small">
                            <i className="bi bi-info-circle me-1" />
                            {task.notes}
                          </div>
                        )}

                        <div className="d-flex justify-content-between align-items-center pt-2 border-top small text-muted">
                          <span>
                            <i className="bi bi-person me-1" />
                            {task.assignedUserName || 'Unassigned Attendant'}
                          </span>
                          <span>
                            {task.checklistItems && task.checklistItems.length > 0 ? (
                              <span className="text-primary fw-semibold">
                                {task.checklistItems.filter((i) => i.checked).length}/{task.checklistItems.length} items
                              </span>
                            ) : (
                              'Standard Checklist'
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="card-footer bg-light border-top p-2 d-flex flex-wrap gap-2 justify-content-between align-items-center">
                        {/* Status progression triggers */}
                        <div className="d-flex gap-1">
                          {task.status === 'pending' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary d-flex align-items-center gap-1"
                              onClick={() => updateTaskMutation.mutate({ taskId: task.id, status: 'in_progress' })}
                              disabled={updateTaskMutation.isPending}
                            >
                              <i className="bi bi-play-fill" /> Start
                            </button>
                          )}

                          {task.status === 'in_progress' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-success d-flex align-items-center gap-1"
                              onClick={() => openChecklist(task)}
                            >
                              <i className="bi bi-check2-circle" /> Checklist & Done
                            </button>
                          )}

                          {task.status === 'completed' && (
                            <>
                              <button
                                type="button"
                                className="btn btn-sm btn-success d-flex align-items-center gap-1"
                                onClick={() => updateTaskMutation.mutate({ taskId: task.id, status: 'inspected' })}
                                disabled={updateTaskMutation.isPending}
                                title="Pass Inspection"
                              >
                                <i className="bi bi-patch-check-fill" /> Pass
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1"
                                onClick={() => updateTaskMutation.mutate({ taskId: task.id, status: 'rejected' })}
                                disabled={updateTaskMutation.isPending}
                                title="Reject / Re-Clean"
                              >
                                <i className="bi bi-arrow-counterclockwise" /> Reject
                              </button>
                            </>
                          )}

                          {task.status === 'rejected' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary d-flex align-items-center gap-1"
                              onClick={() => updateTaskMutation.mutate({ taskId: task.id, status: 'in_progress' })}
                              disabled={updateTaskMutation.isPending}
                            >
                              <i className="bi bi-play-fill" /> Resume Clean
                            </button>
                          )}
                        </div>

                        {/* Direct Minibar Charge Posting Button */}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-warning text-dark d-flex align-items-center gap-1"
                          onClick={() => {
                            setMinibarTask(task);
                            setMinibarError(null);
                          }}
                          title="Audit & Bill Minibar Items"
                        >
                          <i className="bi bi-cup-straw" /> Minibar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Maintenance Work Orders */}
      {activeTab === 'maintenance' && (
        <div className="card shadow-sm border-0">
          <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
            <span className="fw-bold text-dark d-flex align-items-center gap-2">
              <i className="bi bi-tools text-primary" /> Active Maintenance & Facility Orders
            </span>
            <span className="badge bg-light text-dark border">{maintenanceOrders.length} Orders</span>
          </div>

          <div className="card-body p-0">
            {maintLoading ? (
              <div className="p-4 text-center text-muted">Loading maintenance orders...</div>
            ) : maintenanceOrders.length === 0 ? (
              <div className="p-5 text-center text-muted">
                <i className="bi bi-tools fs-2 text-muted d-block mb-2" />
                <p className="mb-0">No active maintenance work orders.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small text-muted ps-4">Order ID</th>
                      <th className="small text-muted">Unit / Location</th>
                      <th className="small text-muted">Title & Details</th>
                      <th className="small text-muted">Priority</th>
                      <th className="small text-muted">Status</th>
                      <th className="small text-muted pe-4">Reported At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceOrders.map((mo) => (
                      <tr key={mo.id}>
                        <td className="font-monospace small text-muted ps-4">{mo.id.slice(0, 8)}</td>
                        <td className="fw-bold">Room {mo.unitNumber || 'General'}</td>
                        <td>
                          <div className="fw-semibold text-dark">{mo.title}</div>
                          <span className="text-muted small">{mo.description}</span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              mo.priority === 'emergency'
                                ? 'bg-danger text-white'
                                : mo.priority === 'high'
                                ? 'bg-warning text-dark'
                                : 'bg-secondary text-white'
                            } text-uppercase`}
                            style={{ fontSize: '0.65rem' }}
                          >
                            {mo.priority}
                          </span>
                        </td>
                        <td>
                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle text-uppercase" style={{ fontSize: '0.65rem' }}>
                            {mo.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="small text-muted pe-4">{new Date(mo.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Lost & Found Catalog */}
      {activeTab === 'lost_found' && (
        <div className="card shadow-sm border-0">
          <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
            <span className="fw-bold text-dark d-flex align-items-center gap-2">
              <i className="bi bi-box-seam text-primary" /> Lost & Found Catalog
            </span>
            <span className="badge bg-light text-dark border">{lostFoundItems.length} Logged Items</span>
          </div>

          <div className="card-body p-0">
            {lfLoading ? (
              <div className="p-4 text-center text-muted">Loading lost and found catalog...</div>
            ) : lostFoundItems.length === 0 ? (
              <div className="p-5 text-center text-muted">
                <i className="bi bi-box-seam fs-2 text-muted d-block mb-2" />
                <p className="mb-0">No lost items recorded.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small text-muted ps-4">Item Name</th>
                      <th className="small text-muted">Category</th>
                      <th className="small text-muted">Location Found</th>
                      <th className="small text-muted">Storage Location</th>
                      <th className="small text-muted">Status</th>
                      <th className="small text-muted pe-4">Date Found</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lostFoundItems.map((lf) => (
                      <tr key={lf.id}>
                        <td className="fw-semibold text-dark ps-4">{lf.itemName}</td>
                        <td>
                          <span className="badge bg-light text-dark border text-uppercase" style={{ fontSize: '0.65rem' }}>
                            {lf.category}
                          </span>
                        </td>
                        <td className="fw-bold">{lf.foundLocation}</td>
                        <td className="text-muted small">{lf.storageLocation}</td>
                        <td>
                          <span
                            className={`badge ${
                              lf.status === 'claimed'
                                ? 'bg-success text-white'
                                : lf.status === 'held'
                                ? 'bg-warning text-dark'
                                : 'bg-secondary text-white'
                            } text-uppercase`}
                            style={{ fontSize: '0.65rem' }}
                          >
                            {lf.status}
                          </span>
                        </td>
                        <td className="small text-muted pe-4">{new Date(lf.foundDate).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: Interactive Checklist Modal */}
      {selectedTask && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)' }}
          tabIndex={-1}
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            style={{ maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content shadow-lg border-0 rounded-3">
              <div className="modal-header border-bottom bg-light px-4 py-3">
                <div className="d-flex align-items-center gap-2">
                  <div className="bg-primary text-white p-2 rounded-2">
                    <i className="bi bi-check2-all fs-5" />
                  </div>
                  <div>
                    <h6 className="modal-title fw-bold mb-0">
                      Clean Checklist — Room {selectedTask.unitNumber}
                    </h6>
                    <span className="text-muted small">
                      {selectedTask.taskType.replace('_', ' ').toUpperCase()} Task Completion
                    </span>
                  </div>
                </div>
                <button type="button" className="btn-close" onClick={() => setSelectedTask(null)} />
              </div>

              <div className="modal-body p-4 d-flex flex-column gap-3">
                <p className="text-muted small mb-0">
                  Please verify all standard operating procedure sanitization steps prior to marking as ready for supervisor inspection:
                </p>

                <div className="d-flex flex-column gap-2">
                  {checklistState.map((item, idx) => (
                    <label
                      key={item.id}
                      className="d-flex align-items-start gap-3 p-3 rounded-2 border cursor-pointer hover-bg-light transition-all"
                      style={{ backgroundColor: item.checked ? '#f0fdf4' : '#ffffff' }}
                    >
                      <input
                        type="checkbox"
                        className="form-check-input mt-1"
                        checked={!!item.checked}
                        onChange={(e) => {
                          const updated = [...checklistState];
                          updated[idx] = { ...updated[idx], checked: e.target.checked };
                          setChecklistState(updated);
                        }}
                      />
                      <span className={`small ${item.checked ? 'text-success fw-semibold' : 'text-dark'}`}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="modal-footer bg-light px-4 py-3 d-flex justify-content-between">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setSelectedTask(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-success fw-semibold d-flex align-items-center gap-2 shadow-sm"
                  onClick={() =>
                    updateTaskMutation.mutate({
                      taskId: selectedTask.id,
                      status: 'completed',
                    })
                  }
                  disabled={updateTaskMutation.isPending}
                >
                  <i className="bi bi-check-circle-fill" />
                  <span>Submit as Completed</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Post Minibar Item to Guest Folio */}
      {minibarTask && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)' }}
          tabIndex={-1}
          onClick={() => setMinibarTask(null)}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            style={{ maxWidth: '480px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content shadow-lg border-0 rounded-3">
              <div className="modal-header border-bottom bg-light px-4 py-3">
                <div className="d-flex align-items-center gap-2">
                  <div className="bg-warning text-dark p-2 rounded-2">
                    <i className="bi bi-cup-straw fs-5" />
                  </div>
                  <div>
                    <h6 className="modal-title fw-bold mb-0">
                      Minibar Folio Charge — Room {minibarTask.unitNumber}
                    </h6>
                    <span className="text-muted small">
                      Direct post to active guest folio Window 1
                    </span>
                  </div>
                </div>
                <button type="button" className="btn-close" onClick={() => setMinibarTask(null)} />
              </div>

              <div className="modal-body p-4 d-flex flex-column gap-3">
                {minibarError && <div className="alert alert-danger py-2 small">{minibarError}</div>}

                <div>
                  <label className="form-label small fw-bold text-muted">Item Consumed</label>
                  <select
                    className="form-select form-select-sm"
                    value={minibarItem}
                    onChange={(e) => {
                      setMinibarItem(e.target.value);
                      if (e.target.value.includes('Sparkling Water')) setMinibarPrice(8.5);
                      else if (e.target.value.includes('Chocolate')) setMinibarPrice(12.0);
                      else if (e.target.value.includes('Gin')) setMinibarPrice(18.0);
                      else if (e.target.value.includes('Beer')) setMinibarPrice(10.0);
                    }}
                  >
                    <option value="Premium Sparkling Water 500ml">Premium Sparkling Water 500ml ($8.50)</option>
                    <option value="Artisan Swiss Chocolate Bar">Artisan Swiss Chocolate Bar ($12.00)</option>
                    <option value="Craft Botanical Gin 200ml">Craft Botanical Gin 200ml ($18.00)</option>
                    <option value="Local Craft Beer 330ml">Local Craft Beer 330ml ($10.00)</option>
                  </select>
                </div>

                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label small fw-bold text-muted">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      className="form-control form-control-sm"
                      value={minibarQty}
                      onChange={(e) => setMinibarQty(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-bold text-muted">Unit Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control form-control-sm"
                      value={minibarPrice}
                      onChange={(e) => setMinibarPrice(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="p-3 bg-light rounded-2 border d-flex justify-content-between align-items-center">
                  <span className="small text-muted fw-bold">Total Folio Charge:</span>
                  <span className="fs-5 fw-bold text-dark font-monospace">
                    ${(minibarQty * minibarPrice).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="modal-footer bg-light px-4 py-3 d-flex justify-content-between">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setMinibarTask(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-warning text-dark fw-bold d-flex align-items-center gap-2 shadow-sm"
                  onClick={() => minibarMutation.mutate()}
                  disabled={minibarMutation.isPending}
                >
                  <i className="bi bi-receipt" />
                  <span>{minibarMutation.isPending ? 'Posting...' : 'Post to Guest Folio'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: New Maintenance Order Modal */}
      {isMaintenanceModalOpen && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)' }}
          tabIndex={-1}
          onClick={() => setIsMaintenanceModalOpen(false)}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            style={{ maxWidth: '480px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content shadow-lg border-0 rounded-3">
              <div className="modal-header border-bottom bg-light px-4 py-3">
                <div className="d-flex align-items-center gap-2">
                  <div className="bg-primary text-white p-2 rounded-2">
                    <i className="bi bi-tools fs-5" />
                  </div>
                  <h6 className="modal-title fw-bold mb-0">Create Maintenance Work Order</h6>
                </div>
                <button type="button" className="btn-close" onClick={() => setIsMaintenanceModalOpen(false)} />
              </div>

              <div className="modal-body p-4 d-flex flex-column gap-3">
                <div>
                  <label className="form-label small fw-bold text-muted">Order Title</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Bathroom Sink Faucet Leaking"
                    value={maintTitle}
                    onChange={(e) => setMaintTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label small fw-bold text-muted">Location / Unit Number</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="e.g. 101 or Lobby"
                      value={maintUnitNumber}
                      onChange={(e) => setMaintUnitNumber(e.target.value)}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-bold text-muted">Priority</label>
                    <select
                      className="form-select form-select-sm"
                      value={maintPriority}
                      onChange={(e) => setMaintPriority(e.target.value as any)}
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                      <option value="emergency">Emergency (OOO)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label small fw-bold text-muted">Issue Description</label>
                  <textarea
                    rows={3}
                    className="form-control form-control-sm"
                    placeholder="Describe specific fault, noise, or malfunction..."
                    value={maintDesc}
                    onChange={(e) => setMaintDesc(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer bg-light px-4 py-3 d-flex justify-content-between">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setIsMaintenanceModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary fw-semibold d-flex align-items-center gap-2 shadow-sm"
                  onClick={() => createMaintMutation.mutate()}
                  disabled={createMaintMutation.isPending || !maintTitle.trim()}
                >
                  <i className="bi bi-save" />
                  <span>{createMaintMutation.isPending ? 'Saving...' : 'Dispatch Work Order'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Log Found Item Modal */}
      {isLostFoundModalOpen && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)' }}
          tabIndex={-1}
          onClick={() => setIsLostFoundModalOpen(false)}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            style={{ maxWidth: '480px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content shadow-lg border-0 rounded-3">
              <div className="modal-header border-bottom bg-light px-4 py-3">
                <div className="d-flex align-items-center gap-2">
                  <div className="bg-primary text-white p-2 rounded-2">
                    <i className="bi bi-box-seam fs-5" />
                  </div>
                  <h6 className="modal-title fw-bold mb-0">Record Found Item</h6>
                </div>
                <button type="button" className="btn-close" onClick={() => setIsLostFoundModalOpen(false)} />
              </div>

              <div className="modal-body p-4 d-flex flex-column gap-3">
                <div>
                  <label className="form-label small fw-bold text-muted">Item Name / Description</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Gold wrist watch, black leather wallet"
                    value={lfDescription}
                    onChange={(e) => setLfDescription(e.target.value)}
                    required
                  />
                </div>

                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label small fw-bold text-muted">Category</label>
                    <select
                      className="form-select form-select-sm"
                      value={lfCategory}
                      onChange={(e) => setLfCategory(e.target.value as any)}
                    >
                      <option value="electronics">Electronics</option>
                      <option value="clothing">Clothing</option>
                      <option value="jewelry">Jewelry</option>
                      <option value="document">Document</option>
                      <option value="cash">Cash</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-bold text-muted">Location Found</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="e.g. Room 101 Nightstand"
                      value={lfLocation}
                      onChange={(e) => setLfLocation(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer bg-light px-4 py-3 d-flex justify-content-between">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setIsLostFoundModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary fw-semibold d-flex align-items-center gap-2 shadow-sm"
                  onClick={() => createLostFoundMutation.mutate()}
                  disabled={createLostFoundMutation.isPending || !lfDescription.trim()}
                >
                  <i className="bi bi-save" />
                  <span>{createLostFoundMutation.isPending ? 'Logging...' : 'Log Item'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
