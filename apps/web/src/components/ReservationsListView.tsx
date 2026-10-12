import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import { AvailabilitySearchBar } from './AvailabilitySearchBar';
import { ReservationWizardModal } from './ReservationWizardModal';
import { GroupBlocksSection } from './GroupBlocksSection';
import { QuotationsWaitlistSection } from './QuotationsWaitlistSection';
import { ChannelManagerSection } from './ChannelManagerSection';
import { GuestsProfilesSection } from './GuestsProfilesSection';
import { RatesManagementSection } from './RatesManagementSection';
import { ModifyReservationModal } from './ModifyReservationModal';
import type { ReservationDto, AvailabilityUnitTypeResultDto } from '@innkeeper/contracts';

export const ReservationsListView: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, activeBranchName } = useAppStore();

  const [activeTab, setActiveTab] = useState<'directory' | 'groups' | 'quotations' | 'channels' | 'guests' | 'rates'>('directory');

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [wizardRoom, setWizardRoom] = useState<AvailabilityUnitTypeResultDto | null>(null);
  const [wizardDates, setWizardDates] = useState<{ checkIn: string; checkOut: string; adults: number; children: number } | null>(null);

  // Selected reservation for details view
  const [selectedRes, setSelectedRes] = useState<ReservationDto | null>(null);
  // Modify reservation modal
  const [modifyingRes, setModifyingRes] = useState<ReservationDto | null>(null);
  // Cancellation confirmation
  const [cancellingRes, setCancellingRes] = useState<ReservationDto | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  // No-show confirmation
  const [noShowRes, setNoShowRes] = useState<ReservationDto | null>(null);
  const [noShowNotes, setNoShowNotes] = useState<string>('');
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // 1. Fetch Reservations
  const { data: reservations, isLoading, error } = useQuery<ReservationDto[]>({
    queryKey: ['reservations', activeTenantId, activeBranchId, statusFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({ branchId: activeBranchId });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (searchTerm.trim()) params.append('search', searchTerm.trim());

      const res = await fetch(`/api/v1/reservations?${params.toString()}`, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load reservations');
      return res.json();
    },
    refetchInterval: 15000,
  });

  // 2. Cancellation Mutation
  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/v1/reservations/${id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Cancellation failed');
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      setActionSuccessMessage(`Reservation cancelled successfully. Inventory restored.`);
      setCancellingRes(null);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['board-units'] });
      queryClient.invalidateQueries({ queryKey: ['availability-search'] });
      setTimeout(() => setActionSuccessMessage(null), 5000);
    },
  });

  // 3. No-Show Mutation (REQ-RSV-006)
  const noShowMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const res = await fetch(`/api/v1/reservations/${id}/no-show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Marking no-show failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setActionSuccessMessage('Reservation marked as No-Show. Room inventory returned to inventory.');
      setNoShowRes(null);
      setNoShowNotes('');
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['board-units'] });
      queryClient.invalidateQueries({ queryKey: ['availability-search'] });
      setTimeout(() => setActionSuccessMessage(null), 5000);
    },
  });

  const handleOpenWizardWithResult = (room: AvailabilityUnitTypeResultDto, dates: { checkIn: string; checkOut: string; adults: number; children: number }) => {
    setWizardRoom(room);
    setWizardDates(dates);
    setIsWizardOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="badge bg-primary-subtle text-primary border border-primary-subtle">Confirmed</span>;
      case 'in_house':
        return <span className="badge bg-success-subtle text-success border border-success-subtle">In-House</span>;
      case 'checked_out':
        return <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle">Checked Out</span>;
      case 'cancelled':
        return <span className="badge bg-danger-subtle text-danger border border-danger-subtle">Cancelled</span>;
      case 'hold':
        return <span className="badge bg-warning-subtle text-warning border border-warning-subtle">On Hold</span>;
      default:
        return <span className="badge bg-light text-dark border">{status}</span>;
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto d-flex flex-column gap-4">
      {/* Top Module Navigation Bar */}
      <div className="bg-white p-2 rounded-3 border shadow-sm d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="d-flex flex-wrap align-items-center gap-1">
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'directory' ? 'btn-primary fw-semibold shadow-sm' : 'btn-light text-muted'}`}
            onClick={() => setActiveTab('directory')}
          >
            <i className="bi bi-calendar-check-fill me-1" />
            <span>Reservations Directory</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'groups' ? 'btn-primary fw-semibold shadow-sm' : 'btn-light text-muted'}`}
            onClick={() => setActiveTab('groups')}
          >
            <i className="bi bi-people-fill me-1" />
            <span>Group Blocks & Rooming Lists</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'quotations' ? 'btn-primary fw-semibold shadow-sm' : 'btn-light text-muted'}`}
            onClick={() => setActiveTab('quotations')}
          >
            <i className="bi bi-file-earmark-text-fill me-1" />
            <span>Quotations & Waitlist</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'channels' ? 'btn-primary fw-semibold shadow-sm' : 'btn-light text-muted'}`}
            onClick={() => setActiveTab('channels')}
          >
            <i className="bi bi-cloud-arrow-up-fill me-1" />
            <span>Channel Manager 2-Way ARI</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'guests' ? 'btn-primary fw-semibold shadow-sm' : 'btn-light text-muted'}`}
            onClick={() => setActiveTab('guests')}
          >
            <i className="bi bi-person-lines-fill me-1" />
            <span>Guest &amp; Company Profiles</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'rates' ? 'btn-primary fw-semibold shadow-sm' : 'btn-light text-muted'}`}
            onClick={() => setActiveTab('rates')}
          >
            <i className="bi bi-tag-fill me-1" />
            <span>Rates Engine &amp; Pricing</span>
          </button>
        </div>

        <span className="badge bg-light text-muted border px-2.5 py-1.5 small">
          <i className="bi bi-building me-1 text-primary" />
          {activeBranchName}
        </span>
      </div>

      {/* Render Active Tab */}
      {activeTab === 'groups' ? (
        <GroupBlocksSection />
      ) : activeTab === 'quotations' ? (
        <QuotationsWaitlistSection />
      ) : activeTab === 'channels' ? (
        <ChannelManagerSection />
      ) : activeTab === 'guests' ? (
        <GuestsProfilesSection />
      ) : activeTab === 'rates' ? (
        <RatesManagementSection />
      ) : (
        <>
          {/* Action Notification */}
          {actionSuccessMessage && (
            <div className="alert alert-success py-2 mb-0 shadow-sm d-flex align-items-center justify-content-between small">
              <span className="d-flex align-items-center gap-2">
                <i className="bi bi-check-circle-fill text-success" />
                <span>{actionSuccessMessage}</span>
              </span>
              <button type="button" className="btn-close" onClick={() => setActionSuccessMessage(null)} />
            </div>
          )}

          {/* Real-time Availability Search Component */}
          <AvailabilitySearchBar onSelectResult={handleOpenWizardWithResult} />

          {/* Reservations Directory Card */}
      <div className="card shadow-sm border-0 rounded-3 overflow-hidden">
        <div className="card-header bg-white border-bottom py-3 px-4 d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div>
            <div className="d-flex align-items-center gap-2">
              <h5 className="fw-bold mb-0 text-dark">Reservations Directory</h5>
              <span className="badge bg-light text-muted border">
                {reservations?.length || 0} Bookings
              </span>
            </div>
            <span className="text-muted small">Managing guest reservations for {activeBranchName}</span>
          </div>

          <button
            type="button"
            className="btn btn-sm btn-primary fw-semibold d-flex align-items-center gap-2 shadow-sm"
            onClick={() => {
              setWizardRoom(null);
              setWizardDates(null);
              setIsWizardOpen(true);
            }}
          >
            <i className="bi bi-plus-circle-fill" />
            <span>New Reservation Wizard</span>
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="px-4 py-3 bg-light border-bottom d-flex flex-wrap justify-content-between align-items-center gap-3">
          {/* Status Tabs */}
          <div className="btn-group btn-group-sm" role="group">
            {[
              { id: 'all', label: 'All' },
              { id: 'confirmed', label: 'Confirmed' },
              { id: 'in_house', label: 'In-House' },
              { id: 'checked_out', label: 'Checked Out' },
              { id: 'cancelled', label: 'Cancelled' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`btn btn-sm ${
                  statusFilter === tab.id ? 'btn-primary fw-semibold' : 'btn-outline-secondary'
                }`}
                onClick={() => setStatusFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="input-group input-group-sm" style={{ maxWidth: '320px' }}>
            <span className="input-group-text bg-white border-end-0">
              <i className="bi bi-search text-muted" />
            </span>
            <input
              type="text"
              className="form-control border-start-0"
              placeholder="Search by RSV#, Guest, Phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="btn btn-outline-secondary border-start-0"
                onClick={() => setSearchTerm('')}
              >
                <i className="bi bi-x" />
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className="card-body p-0">
          {isLoading ? (
            <div className="text-center py-5 text-muted small">
              <div className="spinner-border text-primary spinner-border-sm me-2" role="status" />
              Loading reservations...
            </div>
          ) : error ? (
            <div className="alert alert-danger m-4 py-2 small">{(error as Error).message}</div>
          ) : reservations?.length === 0 ? (
            <div className="text-center py-5 text-muted small">
              <i className="bi bi-calendar-x fs-1 text-muted d-block mb-2" />
              No reservations found matching the selected filters.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light border-bottom">
                  <tr>
                    <th className="small text-muted py-3 ps-4">Reservation #</th>
                    <th className="small text-muted py-3">Guest Details</th>
                    <th className="small text-muted py-3">Units & Room</th>
                    <th className="small text-muted py-3">Stay Dates</th>
                    <th className="small text-muted py-3">Total Rate</th>
                    <th className="small text-muted py-3">Status</th>
                    <th className="small text-muted py-3 pe-4 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations?.map((r) => {
                    const firstUnit = r.units[0];
                    return (
                      <tr key={r.id}>
                        {/* Reservation No */}
                        <td className="ps-4">
                          <strong className="font-monospace text-primary small d-block">
                            {r.reservationNo}
                          </strong>
                          <span className="badge bg-light text-muted border" style={{ fontSize: '0.65rem' }}>
                            {r.source.toUpperCase()}
                          </span>
                        </td>

                        {/* Guest */}
                        <td>
                          <div className="fw-semibold text-dark small">{r.guestName}</div>
                          <span className="text-muted small d-block" style={{ fontSize: '0.75rem' }}>
                            {r.guestEmail || r.guestPhone || 'No contact provided'}
                          </span>
                        </td>

                        {/* Units */}
                        <td>
                          {firstUnit ? (
                            <div>
                              <span className="badge bg-light text-dark border me-1">
                                {firstUnit.unitNumber ? `Room ${firstUnit.unitNumber}` : firstUnit.unitTypeCode}
                              </span>
                              <span className="text-muted small">{firstUnit.unitTypeName}</span>
                              {r.units.length > 1 && (
                                <span className="badge bg-secondary-subtle text-secondary ms-1">
                                  +{r.units.length - 1} more
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted small">—</span>
                          )}
                        </td>

                        {/* Dates */}
                        <td>
                          {firstUnit ? (
                            <div>
                              <span className="small text-dark fw-semibold d-block">
                                {firstUnit.checkIn} → {firstUnit.checkOut}
                              </span>
                              <span className="text-muted small" style={{ fontSize: '0.72rem' }}>
                                {r.totalNights} Night{r.totalNights > 1 ? 's' : ''} • {firstUnit.adults} Adults
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted small">—</span>
                          )}
                        </td>

                        {/* Total Amount */}
                        <td>
                          <strong className="text-dark small">${r.totalAmount.toFixed(2)}</strong>
                          <span className="text-muted small d-block" style={{ fontSize: '0.7rem' }}>
                            {firstUnit?.ratePlanCode || 'BAR'}
                          </span>
                        </td>

                        {/* Status */}
                        <td>{getStatusBadge(r.status)}</td>

                        {/* Actions */}
                        <td className="pe-4 text-end">
                          <div className="btn-group btn-group-sm">
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              title="View Policy Snapshot & Details"
                              onClick={() => setSelectedRes(r)}
                            >
                              <i className="bi bi-eye" />
                            </button>

                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              title="Modify Reservation"
                              onClick={() => setModifyingRes(r)}
                            >
                              <i className="bi bi-pencil" />
                            </button>

                            {r.status === 'confirmed' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-outline-warning text-dark"
                                  title="Mark No-Show (Restore Inventory)"
                                  onClick={() => setNoShowRes(r)}
                                >
                                  <i className="bi bi-person-x" />
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-danger"
                                  title="Cancel Reservation (Restore Inventory)"
                                  onClick={() => setCancellingRes(r)}
                                >
                                  <i className="bi bi-x-circle" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Details & Policy Snapshot Modal */}
      {selectedRes && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
          tabIndex={-1}
          onClick={() => setSelectedRes(null)}
        >
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content shadow-lg border-0 rounded-3">
              <div className="modal-header border-bottom bg-light px-4 py-3">
                <div>
                  <h6 className="modal-title fw-bold mb-0">
                    Reservation Details: {selectedRes.reservationNo}
                  </h6>
                  <span className="text-muted small">Status: {selectedRes.status}</span>
                </div>
                <button type="button" className="btn-close" onClick={() => setSelectedRes(null)} />
              </div>

              <div className="modal-body p-4 d-flex flex-column gap-3">
                <div className="row g-2 small">
                  <div className="col-6"><strong>Guest:</strong> {selectedRes.guestName}</div>
                  <div className="col-6"><strong>Source:</strong> {selectedRes.source}</div>
                  <div className="col-6"><strong>Total Price:</strong> ${selectedRes.totalAmount.toFixed(2)}</div>
                  <div className="col-6"><strong>Total Nights:</strong> {selectedRes.totalNights}</div>
                </div>

                {/* Policy Snapshot Block */}
                <div className="p-3 bg-light rounded-2 border">
                  <span className="fw-bold text-dark small d-block mb-1">
                    <i className="bi bi-shield-check text-primary me-1" />
                    Locked Policy Snapshot (Immutable at Booking)
                  </span>
                  <pre className="small text-muted mb-0 font-monospace bg-white p-2 border rounded" style={{ maxHeight: 160, overflow: 'auto' }}>
                    {JSON.stringify(selectedRes.policySnapshot, null, 2)}
                  </pre>
                </div>

                {/* Booked Units & Nights */}
                <div>
                  <span className="fw-bold text-dark small d-block mb-2">Booked Room Units</span>
                  {selectedRes.units.map((u) => (
                    <div key={u.id} className="p-2 border rounded-2 mb-2 bg-white small">
                      <div className="d-flex justify-content-between fw-semibold">
                        <span>{u.unitTypeName} ({u.unitTypeCode})</span>
                        <span className="text-primary">${u.totalRate.toFixed(2)}</span>
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                        Dates: {u.checkIn} → {u.checkOut} ({u.nights?.length || 0} nights)
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-footer border-top bg-light px-4 py-2">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setSelectedRes(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancellingRes && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
          tabIndex={-1}
          onClick={() => setCancellingRes(null)}
        >
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-content shadow-lg border-0 rounded-3">
              <div className="modal-header border-bottom bg-danger-subtle text-danger px-4 py-3">
                <div className="d-flex align-items-center gap-2">
                  <i className="bi bi-exclamation-octagon-fill fs-5" />
                  <h6 className="modal-title fw-bold mb-0">Cancel Reservation</h6>
                </div>
                <button type="button" className="btn-close" onClick={() => setCancellingRes(null)} />
              </div>

              <div className="modal-body p-4 d-flex flex-column gap-3">
                <p className="small text-dark mb-0">
                  Are you sure you want to cancel reservation <strong>{cancellingRes.reservationNo}</strong> for{' '}
                  <strong>{cancellingRes.guestName}</strong>?
                </p>
                <div className="alert alert-warning py-2 small mb-0">
                  <i className="bi bi-arrow-counterclockwise me-1" />
                  All reserved room nights will be atomically restored to branch inventory.
                </div>

                <div>
                  <label className="form-label small fw-bold text-muted mb-1">Cancellation Reason</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Guest requested cancellation via phone"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer border-top bg-light px-4 py-2 d-flex justify-content-between">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setCancellingRes(null)}
                  disabled={cancelMutation.isPending}
                >
                  Keep Reservation
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger fw-semibold"
                  disabled={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate({ id: cancellingRes.id, reason: cancelReason })}
                >
                  {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No-Show Confirmation Modal (REQ-RSV-006) */}
      {noShowRes && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
          tabIndex={-1}
          onClick={() => setNoShowRes(null)}
        >
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-content shadow-lg border-0 rounded-3">
              <div className="modal-header border-bottom bg-warning-subtle text-dark px-4 py-3">
                <div className="d-flex align-items-center gap-2">
                  <i className="bi bi-person-x-fill text-warning fs-5" />
                  <h6 className="modal-title fw-bold mb-0">Mark Reservation as No-Show</h6>
                </div>
                <button type="button" className="btn-close" onClick={() => setNoShowRes(null)} />
              </div>

              <div className="modal-body p-4 d-flex flex-column gap-3">
                <p className="small text-dark mb-0">
                  Mark reservation <strong>{noShowRes.reservationNo}</strong> for{' '}
                  <strong>{noShowRes.guestName}</strong> as No-Show?
                </p>
                <div className="alert alert-info py-2 small mb-0">
                  <i className="bi bi-arrow-counterclockwise me-1" />
                  Room nights will be immediately restored to general sellable inventory.
                </div>

                <div>
                  <label className="form-label small fw-bold text-muted mb-1">Front Desk Notes</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Guest did not arrive by midnight cut-off"
                    value={noShowNotes}
                    onChange={(e) => setNoShowNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer border-top bg-light px-4 py-2 d-flex justify-content-between">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setNoShowRes(null)}
                  disabled={noShowMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-warning text-dark fw-semibold"
                  disabled={noShowMutation.isPending}
                  onClick={() => noShowMutation.mutate({ id: noShowRes.id, notes: noShowNotes })}
                >
                  {noShowMutation.isPending ? 'Marking...' : 'Confirm No-Show'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modify Reservation Modal */}
      <ModifyReservationModal
        reservation={modifyingRes}
        isOpen={!!modifyingRes}
        onClose={() => setModifyingRes(null)}
        onSuccess={() => setActionSuccessMessage('Reservation modifications saved successfully.')}
      />
    </>
  )}

      {/* Reservation Wizard Modal */}
      <ReservationWizardModal
        isOpen={isWizardOpen}
        initialRoom={wizardRoom}
        initialDates={wizardDates}
        onClose={() => {
          setIsWizardOpen(false);
          setWizardRoom(null);
          setWizardDates(null);
        }}
      />
    </div>
  );
};
