import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type { StayDto, ReservationDto } from '@innkeeper/contracts';
import { CheckInModal } from './CheckInModal';
import { FolioWorkspaceModal } from './FolioWorkspaceModal';
import { RoomMoveModal } from './RoomMoveModal';
import { CheckOutModal } from './CheckOutModal';

export const FrontDeskView: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, businessDate } = useAppStore();

  const [statusFilter, setStatusFilter] = useState<'all' | 'in_house' | 'checked_out'>('in_house');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isSelectArrivalModalOpen, setIsSelectArrivalModalOpen] = useState(false);
  const [checkInTarget, setCheckInTarget] = useState<{
    reservationId: string;
    reservationUnitId: string;
    guestName: string;
    unitTypeName: string;
    checkInDate: string;
    checkOutDate: string;
    preassignedUnitId?: string;
  } | null>(null);

  const [selectedStayForFolio, setSelectedStayForFolio] = useState<StayDto | null>(null);
  const [selectedStayForMove, setSelectedStayForMove] = useState<StayDto | null>(null);
  const [selectedStayForCheckOut, setSelectedStayForCheckOut] = useState<StayDto | null>(null);

  // 1. Fetch Stays
  const { data: stays = [], isLoading: staysLoading } = useQuery<StayDto[]>({
    queryKey: ['front-desk-stays', activeTenantId, activeBranchId, statusFilter],
    queryFn: async () => {
      let url = `/api/v1/stays?branchId=${activeBranchId}`;
      if (statusFilter !== 'all') url += `&status=${statusFilter}`;
      const res = await fetch(url, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load stays');
      return res.json();
    },
    refetchInterval: 15000,
  });

  // 2. Fetch Confirmed Arrivals (Reservations due for Check-In)
  const { data: pendingArrivals = [], isLoading: arrivalsLoading } = useQuery<ReservationDto[]>({
    queryKey: ['front-desk-arrivals', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reservations?status=confirmed&branchId=${activeBranchId}`, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load confirmed reservations');
      return res.json();
    },
  });

  // Filter stays by search
  const filteredStays = stays.filter((s) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (s.guestName && s.guestName.toLowerCase().includes(term)) ||
      (s.unitNumber && s.unitNumber.toLowerCase().includes(term)) ||
      (s.reservationNo && s.reservationNo.toLowerCase().includes(term)) ||
      (s.keycardCode && s.keycardCode.toLowerCase().includes(term))
    );
  });

  const inHouseCount = stays.filter((s) => s.status === 'in_house').length;
  const departuresTodayCount = stays.filter(
    (s) => s.status === 'in_house' && s.expectedCheckOut === businessDate,
  ).length;
  const totalBalanceDue = stays
    .filter((s) => s.status === 'in_house' && s.folioBalance)
    .reduce((sum, s) => sum + (s.folioBalance || 0), 0);

  return (
    <div className="p-4 max-w-7xl mx-auto d-flex flex-column gap-4">
      {/* Top Header Banner */}
      <div className="p-4 bg-white rounded-3 shadow-sm border d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center"
            style={{ width: '48px', height: '48px' }}
          >
            <i className="bi bi-person-check-fill fs-4" />
          </div>
          <div>
            <div className="d-flex align-items-center gap-2">
              <h4 className="fw-bold mb-0 text-dark">Front Desk & In-House Stays</h4>
              <span className="badge bg-success-subtle text-success border border-success-subtle">
                Business Date: {businessDate}
              </span>
            </div>
            <p className="text-muted small mb-0">
              Expedited guest check-in wizard, keycard encoding, live folio balance, and zero-balance departure settlement.
            </p>
          </div>
        </div>

        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-primary d-flex align-items-center gap-2 shadow-sm"
            onClick={() => setIsSelectArrivalModalOpen(true)}
          >
            <i className="bi bi-box-arrow-in-right fs-5" />
            <span className="fw-semibold">New Check-In Wizard</span>
            {pendingArrivals.length > 0 && (
              <span className="badge bg-white text-primary ms-1">{pendingArrivals.length} Due</span>
            )}
          </button>

          <button
            type="button"
            className="btn btn-outline-secondary d-flex align-items-center gap-2"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['front-desk-stays'] });
              queryClient.invalidateQueries({ queryKey: ['front-desk-arrivals'] });
            }}
          >
            <i className="bi bi-arrow-clockwise" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Strip */}
      <div className="row g-3">
        <div className="col-md-3">
          <div className="card shadow-sm border-0 border-start border-4 border-primary bg-white p-3">
            <span className="text-muted small text-uppercase fw-bold">Active In-House Stays</span>
            <div className="d-flex align-items-baseline gap-2 mt-1">
              <h3 className="fw-bold text-dark mb-0">{inHouseCount}</h3>
              <span className="text-muted small">Guests</span>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card shadow-sm border-0 border-start border-4 border-warning bg-white p-3">
            <span className="text-muted small text-uppercase fw-bold">Due-Out Departures Today</span>
            <div className="d-flex align-items-baseline gap-2 mt-1">
              <h3 className="fw-bold text-warning-emphasis mb-0">{departuresTodayCount}</h3>
              <span className="text-muted small">Target 12:00 PM</span>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card shadow-sm border-0 border-start border-4 border-info bg-white p-3">
            <span className="text-muted small text-uppercase fw-bold">Pending Arrivals Due</span>
            <div className="d-flex align-items-baseline gap-2 mt-1">
              <h3 className="fw-bold text-info-emphasis mb-0">{pendingArrivals.length}</h3>
              <span className="text-muted small">Confirmed</span>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card shadow-sm border-0 border-start border-4 border-success bg-white p-3">
            <span className="text-muted small text-uppercase fw-bold">Open Folio Balances</span>
            <div className="d-flex align-items-baseline gap-2 mt-1">
              <h3 className="fw-bold text-success mb-0">${totalBalanceDue.toFixed(2)}</h3>
              <span className="text-muted small">In-House Ledger</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card shadow-sm border-0">
        <div className="card-header bg-white border-bottom py-3 d-flex flex-wrap justify-content-between align-items-center gap-3">
          {/* Status Tabs */}
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className={`btn ${statusFilter === 'in_house' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setStatusFilter('in_house')}
            >
              In-House Stays ({inHouseCount})
            </button>
            <button
              type="button"
              className={`btn ${statusFilter === 'checked_out' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setStatusFilter('checked_out')}
            >
              Past / Checked-Out
            </button>
            <button
              type="button"
              className={`btn ${statusFilter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setStatusFilter('all')}
            >
              All Records
            </button>
          </div>

          {/* Search Box */}
          <div style={{ maxWidth: '300px', width: '100%' }}>
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0">
                <i className="bi bi-search text-muted" />
              </span>
              <input
                type="text"
                className="form-control border-start-0"
                placeholder="Search guest, room, keycard..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setSearchTerm('')}
                >
                  <i className="bi bi-x" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card-body p-0">
          {staysLoading ? (
            <div className="p-5 text-center text-muted">Loading stay records...</div>
          ) : filteredStays.length === 0 ? (
            <div className="p-5 text-center text-muted">
              <i className="bi bi-inbox fs-2 text-muted d-block mb-2" />
              <p className="mb-0 fw-semibold">No stays match the active criteria.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="small text-muted ps-4">Room</th>
                    <th className="small text-muted">Guest Name & Confirmation</th>
                    <th className="small text-muted">Stay Window</th>
                    <th className="small text-muted">Keycard Code</th>
                    <th className="small text-muted">Reg Card</th>
                    <th className="small text-muted">Folio Balance</th>
                    <th className="small text-muted">Status</th>
                    <th className="small text-muted pe-4 text-end">Operational Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStays.map((stay) => {
                    const balance = stay.folioBalance ?? 0;
                    const isSettled = Math.abs(balance) < 0.005;

                    return (
                      <tr key={stay.id}>
                        {/* Room Number & Type */}
                        <td className="ps-4">
                          <div className="d-flex align-items-center gap-2">
                            <span className="badge bg-primary text-white font-monospace fs-6 px-2 py-1">
                              {stay.unitNumber || 'TBD'}
                            </span>
                            <span className="badge bg-light text-muted border" style={{ fontSize: '0.65rem' }}>
                              {stay.unitTypeName || 'Standard'}
                            </span>
                          </div>
                        </td>

                        {/* Guest & Res No */}
                        <td>
                          <div className="fw-bold text-dark">{stay.guestName || 'In-House Guest'}</div>
                          <span className="text-muted small font-monospace">
                            Res #{stay.reservationNo || stay.reservationId.slice(0, 8)}
                          </span>
                        </td>

                        {/* Dates */}
                        <td>
                          <div className="small fw-semibold text-dark">
                            In: {new Date(stay.actualCheckIn).toLocaleDateString()}
                          </div>
                          <div className="small text-muted">
                            Out: {stay.expectedCheckOut}
                          </div>
                        </td>

                        {/* Keycard */}
                        <td>
                          {stay.keycardCode ? (
                            <span className="badge bg-light text-dark border font-monospace">
                              <i className="bi bi-credit-card-2-front text-primary me-1" />
                              {stay.keycardCode}
                            </span>
                          ) : (
                            <span className="text-muted small">No card issued</span>
                          )}
                        </td>

                        {/* Reg Card Signed */}
                        <td>
                          {stay.registrationCardSigned ? (
                            <span className="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1">
                              <i className="bi bi-check2-circle" /> Signed
                            </span>
                          ) : (
                            <span className="badge bg-secondary-subtle text-secondary border">Unsigned</span>
                          )}
                        </td>

                        {/* Folio Balance */}
                        <td>
                          {isSettled ? (
                            <span className="badge bg-success-subtle text-success border border-success-subtle font-monospace px-2 py-1">
                              $0.00 Settled
                            </span>
                          ) : balance > 0 ? (
                            <span className="badge bg-danger-subtle text-danger border border-danger-subtle font-monospace px-2 py-1">
                              ${balance.toFixed(2)} Due
                            </span>
                          ) : (
                            <span className="badge bg-info-subtle text-info-emphasis border border-info-subtle font-monospace px-2 py-1">
                              -${Math.abs(balance).toFixed(2)} Credit
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td>
                          <span
                            className={`badge ${
                              stay.status === 'in_house'
                                ? 'bg-primary text-white'
                                : 'bg-secondary text-white'
                            } text-uppercase`}
                            style={{ fontSize: '0.65rem' }}
                          >
                            {stay.status.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Row Actions */}
                        <td className="pe-4 text-end">
                          <div className="btn-group btn-group-sm">
                            {/* Folio Workspace */}
                            <button
                              type="button"
                              className="btn btn-outline-primary d-inline-flex align-items-center gap-1"
                              onClick={() => setSelectedStayForFolio(stay)}
                              title="Open Folio Multi-Window Billing"
                            >
                              <i className="bi bi-receipt" />
                              <span>Folio</span>
                            </button>

                            {/* Room Move (in-house only) */}
                            {stay.status === 'in_house' && (
                              <button
                                type="button"
                                className="btn btn-outline-secondary d-inline-flex align-items-center gap-1"
                                onClick={() => setSelectedStayForMove(stay)}
                                title="Execute Room Move"
                              >
                                <i className="bi bi-arrow-left-right" />
                                <span>Move</span>
                              </button>
                            )}

                            {/* Check-Out (in-house only) */}
                            {stay.status === 'in_house' && (
                              <button
                                type="button"
                                className="btn btn-outline-danger d-inline-flex align-items-center gap-1"
                                onClick={() => setSelectedStayForCheckOut(stay)}
                                title="Check-Out Wizard"
                              >
                                <i className="bi bi-box-arrow-right" />
                                <span>Check-Out</span>
                              </button>
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

      {/* MODAL: Select Confirmed Arrival for Check-In */}
      {isSelectArrivalModalOpen && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)' }}
          tabIndex={-1}
          onClick={() => setIsSelectArrivalModalOpen(false)}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            style={{ maxWidth: '650px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content shadow-lg border-0 rounded-3">
              <div className="modal-header border-bottom bg-light px-4 py-3">
                <div className="d-flex align-items-center gap-2">
                  <div className="bg-primary text-white p-2 rounded-2">
                    <i className="bi bi-person-plus-fill fs-5" />
                  </div>
                  <div>
                    <h6 className="modal-title fw-bold mb-0">Select Confirmed Arrival for Check-In</h6>
                    <span className="text-muted small">
                      Select guest reservation to launch clean room inspection and keycard encoding wizard
                    </span>
                  </div>
                </div>
                <button type="button" className="btn-close" onClick={() => setIsSelectArrivalModalOpen(false)} />
              </div>

              <div className="modal-body p-4">
                {arrivalsLoading ? (
                  <div className="text-muted small text-center p-4">Loading arrivals...</div>
                ) : pendingArrivals.length === 0 ? (
                  <div className="p-4 text-center text-muted">
                    <i className="bi bi-calendar-check fs-2 text-success d-block mb-2" />
                    <p className="mb-0 fw-semibold">No pending confirmed reservations found for check-in.</p>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-2 max-h-96 overflow-auto">
                    {pendingArrivals.map((res) => {
                      const primaryUnit = res.units[0];
                      if (!primaryUnit) return null;

                      return (
                        <div
                          key={res.id}
                          className="p-3 rounded-2 border bg-white d-flex justify-content-between align-items-center hover-shadow transition-all"
                        >
                          <div>
                            <div className="d-flex align-items-center gap-2">
                              <span className="fw-bold text-dark">{res.guestName}</span>
                              <span className="badge bg-light text-dark border font-monospace">
                                #{res.reservationNo}
                              </span>
                            </div>
                            <span className="text-muted small d-block">
                              {primaryUnit.unitTypeName} • {primaryUnit.checkIn} to {primaryUnit.checkOut}
                            </span>
                            {primaryUnit.unitNumber && (
                              <span className="badge bg-primary-subtle text-primary border border-primary-subtle mt-1">
                                Pre-assigned: Room {primaryUnit.unitNumber}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            className="btn btn-sm btn-primary fw-semibold d-flex align-items-center gap-1 shadow-sm"
                            onClick={() => {
                              setIsSelectArrivalModalOpen(false);
                              setCheckInTarget({
                                reservationId: res.id,
                                reservationUnitId: primaryUnit.id,
                                guestName: res.guestName,
                                unitTypeName: primaryUnit.unitTypeName,
                                checkInDate: primaryUnit.checkIn,
                                checkOutDate: primaryUnit.checkOut,
                                preassignedUnitId: primaryUnit.unitId || undefined,
                              });
                            }}
                          >
                            <i className="bi bi-arrow-right" />
                            <span>Begin Check-In</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="modal-footer bg-light px-4 py-2">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setIsSelectArrivalModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. CHECK-IN WIZARD MODAL */}
      {checkInTarget && (
        <CheckInModal
          isOpen={true}
          reservationId={checkInTarget.reservationId}
          reservationUnitId={checkInTarget.reservationUnitId}
          guestName={checkInTarget.guestName}
          unitTypeName={checkInTarget.unitTypeName}
          checkInDate={checkInTarget.checkInDate}
          checkOutDate={checkInTarget.checkOutDate}
          preassignedUnitId={checkInTarget.preassignedUnitId}
          onClose={() => setCheckInTarget(null)}
          onSuccess={() => {
            setCheckInTarget(null);
            queryClient.invalidateQueries({ queryKey: ['front-desk-stays'] });
            queryClient.invalidateQueries({ queryKey: ['front-desk-arrivals'] });
            queryClient.invalidateQueries({ queryKey: ['board-units'] });
          }}
        />
      )}

      {/* 2. FOLIO WORKSPACE MODAL */}
      {selectedStayForFolio && (
        <FolioWorkspaceModal
          isOpen={true}
          folioId={selectedStayForFolio.folioId || ''}
          stayId={selectedStayForFolio.id}
          guestName={selectedStayForFolio.guestName}
          unitNumber={selectedStayForFolio.unitNumber}
          onClose={() => setSelectedStayForFolio(null)}
        />
      )}

      {/* 3. ROOM MOVE MODAL */}
      {selectedStayForMove && (
        <RoomMoveModal
          isOpen={true}
          stayId={selectedStayForMove.id}
          guestName={selectedStayForMove.guestName || 'In-House Guest'}
          currentUnitNumber={selectedStayForMove.unitNumber || 'TBD'}
          onClose={() => setSelectedStayForMove(null)}
          onSuccess={() => {
            setSelectedStayForMove(null);
            queryClient.invalidateQueries({ queryKey: ['front-desk-stays'] });
            queryClient.invalidateQueries({ queryKey: ['board-units'] });
          }}
        />
      )}

      {/* 4. CHECK-OUT WIZARD MODAL */}
      {selectedStayForCheckOut && (
        <CheckOutModal
          isOpen={true}
          stayId={selectedStayForCheckOut.id}
          guestName={selectedStayForCheckOut.guestName || 'In-House Guest'}
          unitNumber={selectedStayForCheckOut.unitNumber || 'TBD'}
          onClose={() => setSelectedStayForCheckOut(null)}
          onSuccess={() => {
            setSelectedStayForCheckOut(null);
            queryClient.invalidateQueries({ queryKey: ['front-desk-stays'] });
            queryClient.invalidateQueries({ queryKey: ['board-units'] });
            queryClient.invalidateQueries({ queryKey: ['hk-tasks'] });
          }}
        />
      )}
    </div>
  );
};
