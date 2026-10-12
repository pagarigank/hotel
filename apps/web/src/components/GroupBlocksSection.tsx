import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type { GroupBlockDto, CreateGroupBlockDto } from '@innkeeper/contracts';

export const GroupBlocksSection: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, businessDate } = useAppStore();

  const [isNewBlockModalOpen, setIsNewBlockModalOpen] = useState(false);
  const [selectedBlockForRooming, setSelectedBlockForRooming] = useState<GroupBlockDto | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  // New Block Form State
  const today = businessDate || new Date().toISOString().split('T')[0];
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const nextMonthEnd = new Date(Date.now() + 34 * 86400000).toISOString().split('T')[0];
  const nextMonthCutoff = new Date(Date.now() + 25 * 86400000).toISOString().split('T')[0];

  const [name, setName] = useState('');
  const [code, setCode] = useState(`GRP-${Math.floor(Math.random() * 9000) + 1000}`);
  const [startDate, setStartDate] = useState(nextMonth);
  const [endDate, setEndDate] = useState(nextMonthEnd);
  const [cutoffDate, setCutoffDate] = useState(nextMonthCutoff);
  const [allocatedRooms, setAllocatedRooms] = useState(10);
  const [agreedRate, setAgreedRate] = useState(115.0);

  // Rooming List Form State
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  // 1. Fetch Group Blocks
  const { data: blocks = [], isLoading } = useQuery<GroupBlockDto[]>({
    queryKey: ['group-blocks', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/group-blocks?branchId=${activeBranchId}`, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 15000,
  });

  // 2. Create Block Mutation
  const createBlockMutation = useMutation({
    mutationFn: async (dto: CreateGroupBlockDto) => {
      const res = await fetch('/api/v1/group-blocks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify(dto),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.title || 'Failed to create group block');
      }
      return res.json();
    },
    onSuccess: (data: GroupBlockDto) => {
      setFeedback({ message: `Group Block "${data.name}" (${data.code}) created with Master Folio!`, type: 'success' });
      setIsNewBlockModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['group-blocks'] });
      setTimeout(() => setFeedback(null), 5000);
    },
    onError: (err: Error) => {
      setFeedback({ message: err.message, type: 'danger' });
    },
  });

  // 3. Rooming List Import Mutation
  const importRoomingMutation = useMutation({
    mutationFn: async ({ blockId, item }: { blockId: string; item: any }) => {
      const res = await fetch(`/api/v1/group-blocks/${blockId}/rooming-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({ items: [item] }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.title || 'Failed to import guest to rooming list');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({ message: 'Guest reservation added to group rooming list!', type: 'success' });
      setSelectedBlockForRooming(null);
      setGuestFirstName('');
      setGuestLastName('');
      setGuestEmail('');
      setGuestPhone('');
      queryClient.invalidateQueries({ queryKey: ['group-blocks'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      setTimeout(() => setFeedback(null), 5000);
    },
    onError: (err: Error) => {
      setFeedback({ message: err.message, type: 'danger' });
    },
  });

  // 4. Release Block Mutation
  const releaseBlockMutation = useMutation({
    mutationFn: async (blockId: string) => {
      const res = await fetch(`/api/v1/group-blocks/${blockId}/release`, {
        method: 'POST',
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Release failed');
      return res.json();
    },
    onSuccess: (data) => {
      setFeedback({ message: `Released ${data.releasedRooms} unallocated room(s) back to general inventory.`, type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['group-blocks'] });
      queryClient.invalidateQueries({ queryKey: ['availability-search'] });
      setTimeout(() => setFeedback(null), 5000);
    },
  });

  const handleCreateBlock = (e: React.FormEvent) => {
    e.preventDefault();
    createBlockMutation.mutate({
      branchId: activeBranchId,
      name,
      code,
      startDate,
      endDate,
      cutoffDate,
      allocations: [
        {
          unitTypeId: '55000000-0000-0000-0000-000000000001',
          allocatedRooms: Number(allocatedRooms),
          agreedRate: Number(agreedRate),
        },
      ],
      attrs: {},
      notes: 'Group block managed via front desk',
    });
  };

  const handleAddRoomingGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlockForRooming) return;
    importRoomingMutation.mutate({
      blockId: selectedBlockForRooming.id,
      item: {
        firstName: guestFirstName,
        lastName: guestLastName,
        email: guestEmail || undefined,
        phone: guestPhone || undefined,
        unitTypeId: '55000000-0000-0000-0000-000000000001',
        checkIn: selectedBlockForRooming.startDate,
        checkOut: selectedBlockForRooming.endDate,
        adults: 1,
        children: 0,
      },
    });
  };

  return (
    <div className="card shadow-sm border-0 rounded-3 overflow-hidden bg-white">
      {/* Header */}
      <div className="card-header bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center">
        <div>
          <div className="d-flex align-items-center gap-2">
            <h6 className="fw-bold mb-0 text-dark">Group Bookings & Room Block Management</h6>
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
              REQ-RSV-009
            </span>
          </div>
          <span className="text-muted small">
            Master folios, rooming list pickups, cutoff tracking, and automated block release
          </span>
        </div>

        <button
          type="button"
          className="btn btn-sm btn-primary fw-semibold d-flex align-items-center gap-2 shadow-sm"
          onClick={() => setIsNewBlockModalOpen(true)}
        >
          <i className="bi bi-people-fill" />
          <span>New Group Block</span>
        </button>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} py-2 px-4 mb-0 rounded-0 border-0 border-bottom small d-flex justify-content-between align-items-center`}>
          <span>{feedback.message}</span>
          <button type="button" className="btn-close" onClick={() => setFeedback(null)} />
        </div>
      )}

      {/* Table */}
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th className="px-4 py-3 small text-muted text-uppercase">Block Code</th>
                <th className="py-3 small text-muted text-uppercase">Group Name</th>
                <th className="py-3 small text-muted text-uppercase">Stay Window</th>
                <th className="py-3 small text-muted text-uppercase">Cutoff Date</th>
                <th className="py-3 small text-muted text-uppercase">Rooms & Pickup</th>
                <th className="py-3 small text-muted text-uppercase">Status</th>
                <th className="px-4 py-3 small text-muted text-uppercase text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted small">
                    Loading group blocks...
                  </td>
                </tr>
              ) : blocks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-5 text-muted small">
                    <i className="bi bi-people fs-2 text-muted d-block mb-2" />
                    No active group blocks. Click "New Group Block" to create one.
                  </td>
                </tr>
              ) : (
                blocks.map((b) => {
                  const pct = b.totalRooms > 0 ? Math.round((b.pickedUpRooms / b.totalRooms) * 100) : 0;
                  return (
                    <tr key={b.id}>
                      <td className="px-4 fw-bold font-monospace text-primary">{b.code}</td>
                      <td>
                        <span className="fw-semibold text-dark d-block">{b.name}</span>
                        {b.masterFolioId && (
                          <span className="badge bg-light text-muted border small" style={{ fontSize: '0.7rem' }}>
                            Master Folio Attached
                          </span>
                        )}
                      </td>
                      <td className="small text-muted">
                        {b.startDate} → {b.endDate}
                      </td>
                      <td>
                        <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">
                          {b.cutoffDate}
                        </span>
                      </td>
                      <td style={{ minWidth: 160 }}>
                        <div className="d-flex justify-content-between small mb-1">
                          <span className="fw-semibold text-dark">{b.pickedUpRooms} / {b.totalRooms} Rooms</span>
                          <span className="text-muted">{pct}%</span>
                        </div>
                        <div className="progress" style={{ height: 6 }}>
                          <div
                            className={`progress-bar ${pct >= 100 ? 'bg-success' : 'bg-primary'}`}
                            role="progressbar"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            b.status === 'definite'
                              ? 'bg-success-subtle text-success border border-success-subtle'
                              : b.status === 'released'
                              ? 'bg-secondary-subtle text-secondary'
                              : 'bg-warning-subtle text-warning'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 text-end">
                        <div className="btn-group btn-group-sm">
                          {b.status === 'definite' && b.pickedUpRooms < b.totalRooms && (
                            <button
                              type="button"
                              className="btn btn-outline-primary d-flex align-items-center gap-1"
                              onClick={() => setSelectedBlockForRooming(b)}
                              title="Import Rooming List Guest"
                            >
                              <i className="bi bi-person-plus-fill" />
                              <span>Rooming List</span>
                            </button>
                          )}
                          {b.status === 'definite' && (
                            <button
                              type="button"
                              className="btn btn-outline-danger d-flex align-items-center gap-1"
                              onClick={() => releaseBlockMutation.mutate(b.id)}
                              title="Release unallocated rooms back to general inventory"
                            >
                              <i className="bi bi-box-arrow-up-right" />
                              <span>Release</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Group Block Modal */}
      {isNewBlockModalOpen && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
          tabIndex={-1}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg border-0 rounded-3">
              <form onSubmit={handleCreateBlock}>
                <div className="modal-header bg-light border-bottom py-3 px-4">
                  <h6 className="fw-bold mb-0 text-dark">Create New Group Block</h6>
                  <button type="button" className="btn-close" onClick={() => setIsNewBlockModalOpen(false)} />
                </div>
                <div className="modal-body p-4 d-flex flex-column gap-3">
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Group Block Name</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="e.g. Annual Tech Conference 2026"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Block Code</label>
                      <input
                        type="text"
                        className="form-control form-control-sm font-monospace"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Allocated Rooms</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min={1}
                        max={100}
                        value={allocatedRooms}
                        onChange={(e) => setAllocatedRooms(Number(e.target.value))}
                        required
                      />
                    </div>
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Start Date</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">End Date</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        min={startDate}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Cutoff Release Date</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        max={startDate}
                        value={cutoffDate}
                        onChange={(e) => setCutoffDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Agreed Nightly Rate ($)</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min={0}
                        step="0.01"
                        value={agreedRate}
                        onChange={(e) => setAgreedRate(Number(e.target.value))}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer bg-light border-top py-2 px-4">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setIsNewBlockModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-sm btn-primary fw-semibold" disabled={createBlockMutation.isPending}>
                    {createBlockMutation.isPending ? 'Creating...' : 'Create Block with Master Folio'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Rooming List Guest Entry Modal */}
      {selectedBlockForRooming && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
          tabIndex={-1}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg border-0 rounded-3">
              <form onSubmit={handleAddRoomingGuest}>
                <div className="modal-header bg-light border-bottom py-3 px-4">
                  <div>
                    <h6 className="fw-bold mb-0 text-dark">Add Guest to Rooming List</h6>
                    <span className="text-muted small">{selectedBlockForRooming.name} ({selectedBlockForRooming.code})</span>
                  </div>
                  <button type="button" className="btn-close" onClick={() => setSelectedBlockForRooming(null)} />
                </div>
                <div className="modal-body p-4 d-flex flex-column gap-3">
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">First Name</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={guestFirstName}
                        onChange={(e) => setGuestFirstName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Last Name</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={guestLastName}
                        onChange={(e) => setGuestLastName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Email</label>
                    <input
                      type="email"
                      className="form-control form-control-sm"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Phone Number</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer bg-light border-top py-2 px-4">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setSelectedBlockForRooming(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-sm btn-primary fw-semibold" disabled={importRoomingMutation.isPending}>
                    {importRoomingMutation.isPending ? 'Adding...' : 'Confirm Guest Reservation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
