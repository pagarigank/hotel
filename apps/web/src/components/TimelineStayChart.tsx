import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type { BoardUnitDto, ReservationDto, AvailabilityUnitTypeResultDto } from '@innkeeper/contracts';
import { ReservationWizardModal } from './ReservationWizardModal';

interface TimelineStayChartProps {
  units: BoardUnitDto[];
  onSelectUnit?: (unit: BoardUnitDto) => void;
}

export const TimelineStayChart: React.FC<TimelineStayChartProps> = ({ units, onSelectUnit }) => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, businessDate } = useAppStore();

  // Timeline horizon state (14 days window)
  const initialStartDate = useMemo(() => {
    return businessDate || new Date().toISOString().split('T')[0];
  }, [businessDate]);

  const [startDateStr, setStartDateStr] = useState<string>(initialStartDate);
  const [draggedResId, setDraggedResId] = useState<string | null>(null);
  const [hoverTargetUnitId, setHoverTargetUnitId] = useState<string | null>(null);
  const [hoverTargetDate, setHoverTargetDate] = useState<string | null>(null);

  // Reservation Wizard modal state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardRoom, setWizardRoom] = useState<AvailabilityUnitTypeResultDto | null>(null);
  const [wizardDates, setWizardDates] = useState<{
    checkIn: string;
    checkOut: string;
    adults: number;
    children: number;
  } | null>(null);

  // Selected reservation details popup
  const [activeReservation, setActiveReservation] = useState<ReservationDto | null>(null);
  const [moveFeedback, setMoveFeedback] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  // Calculate the 14 days in view
  const days = useMemo(() => {
    const list: { dateStr: string; dayNumber: number; dayName: string; isWeekend: boolean }[] = [];
    const base = new Date(startDateStr);
    for (let i = 0; i < 14; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayNum = d.getDay();
      list.push({
        dateStr,
        dayNumber: d.getDate(),
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        isWeekend: dayNum === 0 || dayNum === 6,
      });
    }
    return list;
  }, [startDateStr]);

  // Fetch all reservations for active branch to plot on the timeline
  const { data: reservations = [] } = useQuery<ReservationDto[]>({
    queryKey: ['reservations', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reservations?branchId=${activeBranchId}`, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 20000,
  });

  // Map reservations to units and date spans
  const unitReservationsMap = useMemo(() => {
    const map = new Map<string, Array<{ res: ReservationDto; unitItemId: string; checkIn: string; checkOut: string }>>();
    for (const r of reservations) {
      if (r.status === 'cancelled') continue;
      for (const uItem of r.units) {
        if (!uItem.unitId) continue;
        const existing = map.get(uItem.unitId) || [];
        existing.push({
          res: r,
          unitItemId: uItem.id,
          checkIn: uItem.checkIn,
          checkOut: uItem.checkOut,
        });
        map.set(uItem.unitId, existing);
      }
    }
    return map;
  }, [reservations]);

  // Move Reservation to another room
  const moveMutation = useMutation({
    mutationFn: async ({ reservationId, newUnitId }: { reservationId: string; newUnitId: string }) => {
      const targetRes = reservations.find((r) => r.id === reservationId);
      if (!targetRes) throw new Error('Reservation not found');
      const targetUnit = units.find((u) => u.id === newUnitId);
      if (!targetUnit) throw new Error('Target unit not found');

      const payload = {
        notes: `${targetRes.notes || ''} [Reassigned to Room ${targetUnit.number}]`.trim(),
        units: targetRes.units.map((u) => ({
          id: u.id,
          unitTypeId: targetUnit.unitTypeId,
          unitId: newUnitId,
          ratePlanId: u.ratePlanId,
          checkIn: u.checkIn,
          checkOut: u.checkOut,
          adults: u.adults,
          children: u.children,
        })),
      };

      const res = await fetch(`/api/v1/reservations/${reservationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.title || 'Room reassignment failed');
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      const u = units.find((x) => x.id === vars.newUnitId);
      setMoveFeedback({
        message: `Successfully reassigned reservation to Room ${u?.number || ''}!`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      setTimeout(() => setMoveFeedback(null), 5000);
    },
    onError: (err: Error) => {
      setMoveFeedback({
        message: `Reassignment rejected: ${err.message}`,
        type: 'danger',
      });
      setTimeout(() => setMoveFeedback(null), 6000);
    },
  });

  // Navigate Days
  const handleShiftDays = (delta: number) => {
    const d = new Date(startDateStr);
    d.setDate(d.getDate() + delta);
    setStartDateStr(d.toISOString().split('T')[0]);
  };

  const handleResetToday = () => {
    setStartDateStr(initialStartDate);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, resId: string) => {
    e.dataTransfer.setData('text/plain', resId);
    setDraggedResId(resId);
  };

  const handleDragOver = (e: React.DragEvent, unitId: string, dateStr: string) => {
    e.preventDefault();
    setHoverTargetUnitId(unitId);
    setHoverTargetDate(dateStr);
  };

  const handleDrop = (e: React.DragEvent, targetUnitId: string) => {
    e.preventDefault();
    const resId = e.dataTransfer.getData('text/plain') || draggedResId;
    setDraggedResId(null);
    setHoverTargetUnitId(null);
    setHoverTargetDate(null);

    if (!resId) return;

    // Check collision for target unit
    const draggedRes = reservations.find((r) => r.id === resId);
    if (!draggedRes) return;

    const unitStays = unitReservationsMap.get(targetUnitId) || [];
    const checkIn = draggedRes.units[0]?.checkIn;
    const checkOut = draggedRes.units[0]?.checkOut;

    const hasCollision = unitStays.some((s) => {
      if (s.res.id === resId) return false;
      return checkIn < s.checkOut && checkOut > s.checkIn;
    });

    if (hasCollision) {
      setMoveFeedback({
        message: `ROOM_NOT_AVAILABLE: Room collision detected on overlapping dates. Snap-back applied.`,
        type: 'danger',
      });
      setTimeout(() => setMoveFeedback(null), 5000);
      return;
    }

    moveMutation.mutate({ reservationId: resId, newUnitId: targetUnitId });
  };

  // Double-click tile to book
  const handleTileDoubleClick = (unit: BoardUnitDto, dateStr: string) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 2);
    const checkoutStr = d.toISOString().split('T')[0];

    setWizardRoom({
      unitTypeId: unit.unitTypeId,
      code: unit.unitTypeCode,
      name: unit.unitTypeName,
      baseRate: 120,
      availableUnitsCount: 1,
    } as unknown as AvailabilityUnitTypeResultDto);

    setWizardDates({
      checkIn: dateStr,
      checkOut: checkoutStr,
      adults: 2,
      children: 0,
    });

    setIsWizardOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_house':
        return { bg: '#dcfce7', text: '#15803d', border: '#86efac' };
      case 'confirmed':
        return { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' };
      case 'hold':
        return { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' };
      case 'checked_out':
        return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
      default:
        return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
    }
  };

  return (
    <div className="card shadow-sm border-0 rounded-3 overflow-hidden bg-white">
      {/* 1. Header Toolbar */}
      <div className="card-header bg-white border-bottom py-3 px-4 d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div className="d-flex align-items-center gap-2">
          <div
            className="rounded-circle bg-primary-subtle text-primary p-2 d-flex align-items-center justify-content-center"
            style={{ width: 36, height: 36 }}
          >
            <i className="bi bi-calendar-range fs-6" />
          </div>
          <div>
            <h6 className="fw-bold mb-0 text-dark">Timeline Stay Chart View</h6>
            <span className="text-muted small">
              Multi-day visual room allocation · Drag reservation bar to reassign · Double-click empty cell to book
            </span>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="d-flex align-items-center gap-2">
          <div className="btn-group btn-group-sm shadow-sm" role="group">
            <button
              type="button"
              className="btn btn-outline-secondary d-flex align-items-center gap-1"
              onClick={() => handleShiftDays(-14)}
              title="Previous 14 Days"
            >
              <i className="bi bi-chevron-double-left" />
              <span>-14d</span>
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary d-flex align-items-center gap-1"
              onClick={() => handleShiftDays(-1)}
              title="Previous Day"
            >
              <i className="bi bi-chevron-left" />
            </button>
            <button
              type="button"
              className="btn btn-primary fw-semibold px-3"
              onClick={handleResetToday}
            >
              Today
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary d-flex align-items-center gap-1"
              onClick={() => handleShiftDays(1)}
              title="Next Day"
            >
              <i className="bi bi-chevron-right" />
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary d-flex align-items-center gap-1"
              onClick={() => handleShiftDays(14)}
              title="Next 14 Days"
            >
              <span>+14d</span>
              <i className="bi bi-chevron-double-right" />
            </button>
          </div>

          <input
            type="date"
            className="form-control form-control-sm border shadow-sm"
            style={{ width: 140 }}
            value={startDateStr}
            onChange={(e) => setStartDateStr(e.target.value)}
          />
        </div>
      </div>

      {/* Move Notification Feedback */}
      {moveFeedback && (
        <div
          className={`alert alert-${moveFeedback.type} py-2 px-4 mb-0 rounded-0 border-0 border-bottom small d-flex align-items-center justify-content-between`}
        >
          <span className="d-flex align-items-center gap-2">
            <i
              className={`bi ${moveFeedback.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`}
            />
            <span>{moveFeedback.message}</span>
          </span>
          <button type="button" className="btn-close" onClick={() => setMoveFeedback(null)} />
        </div>
      )}

      {/* 2. Timeline Grid Container */}
      <div className="table-responsive" style={{ maxHeight: '680px' }}>
        <table className="table table-bordered mb-0 align-middle user-select-none" style={{ minWidth: 1200 }}>
          {/* Timeline Header: Days */}
          <thead className="table-light sticky-top" style={{ zIndex: 10 }}>
            <tr>
              <th
                className="bg-light text-muted small fw-bold px-3 py-2 text-start sticky-left"
                style={{ width: 180, minWidth: 180, zIndex: 11 }}
              >
                Room / Type
              </th>
              {days.map((d) => (
                <th
                  key={d.dateStr}
                  className={`text-center py-2 px-1 ${d.isWeekend ? 'bg-light-subtle' : ''}`}
                  style={{ width: `${82 / 14}%`, minWidth: 70 }}
                >
                  <div className="small fw-semibold text-muted text-uppercase" style={{ fontSize: '0.72rem' }}>
                    {d.dayName}
                  </div>
                  <div
                    className={`fw-bold fs-6 ${
                      d.dateStr === initialStartDate ? 'text-primary' : 'text-dark'
                    }`}
                  >
                    {d.dayNumber}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Unit Rows */}
          <tbody>
            {units.map((unit) => {
              const unitStays = unitReservationsMap.get(unit.id) || [];
              const isTargetHovered = hoverTargetUnitId === unit.id;

              return (
                <tr
                  key={unit.id}
                  className={isTargetHovered ? 'bg-primary-subtle' : ''}
                  onDragOver={(e) => handleDragOver(e, unit.id, hoverTargetDate || '')}
                  onDrop={(e) => handleDrop(e, unit.id)}
                >
                  {/* Unit Label Column */}
                  <td
                    className="p-2 sticky-left bg-white border-end shadow-sm"
                    style={{ minWidth: 180, maxWidth: 180 }}
                  >
                    <div className="d-flex align-items-center justify-content-between">
                      <div className="d-flex align-items-center gap-2">
                        <span className="fw-bold text-dark fs-6">Room {unit.number}</span>
                        <span className="badge bg-secondary-subtle text-secondary small px-1 py-0.5">
                          {unit.unitTypeCode}
                        </span>
                      </div>
                      <span
                        className="badge rounded-pill small"
                        style={{
                          fontSize: '0.65rem',
                          backgroundColor:
                            unit.statusCode === 'vacant_clean'
                              ? '#dcfce7'
                              : unit.statusCode === 'occupied'
                              ? '#fee2e2'
                              : '#fef3c7',
                          color:
                            unit.statusCode === 'vacant_clean'
                              ? '#166534'
                              : unit.statusCode === 'occupied'
                              ? '#991b1b'
                              : '#854d0e',
                        }}
                      >
                        {unit.statusLabel}
                      </span>
                    </div>
                    <div className="text-muted small text-truncate" style={{ fontSize: '0.75rem' }}>
                      Floor {unit.floor || '1'} · {unit.building || 'Main'}
                    </div>
                  </td>

                  {/* 14 Day Cells */}
                  {days.map((day) => {
                    // Check if a reservation starts on or spans this day
                    const matchingStay = unitStays.find((s) => {
                      return day.dateStr >= s.checkIn && day.dateStr < s.checkOut;
                    });

                    const isCheckInDay = matchingStay?.checkIn === day.dateStr;
                    const isOccupied = !!matchingStay;

                    return (
                      <td
                        key={day.dateStr}
                        className={`p-1 text-center position-relative ${
                          day.isWeekend ? 'bg-light-subtle' : ''
                        }`}
                        style={{ height: 54, minWidth: 70 }}
                        onDoubleClick={() => {
                          if (!isOccupied) handleTileDoubleClick(unit, day.dateStr);
                        }}
                        onDragOver={(e) => handleDragOver(e, unit.id, day.dateStr)}
                      >
                        {matchingStay ? (
                          // Render Reservation Bar (if it is the check-in day, or start of the 14-day window)
                          isCheckInDay || day.dateStr === days[0].dateStr ? (
                            <div
                              draggable
                              onDragStart={(e) => handleDragStart(e, matchingStay.res.id)}
                              onClick={() => setActiveReservation(matchingStay.res)}
                              className="rounded-2 p-1 text-start shadow-sm border position-absolute top-50 translate-middle-y cursor-grab"
                              style={{
                                ...getStatusColor(matchingStay.res.status),
                                left: 4,
                                width: `calc(${
                                  Math.min(
                                    14 - days.findIndex((d) => d.dateStr === day.dateStr),
                                    Math.ceil(
                                      (new Date(matchingStay.checkOut).getTime() -
                                        new Date(Math.max(new Date(day.dateStr).getTime(), new Date(matchingStay.checkIn).getTime())).getTime()) /
                                        86400000,
                                    ),
                                  ) * 100
                                }% - 8px)`,
                                zIndex: 5,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                              }}
                              title={`${matchingStay.res.guestName} (${matchingStay.res.reservationNo})\n${matchingStay.checkIn} → ${matchingStay.checkOut}\nTotal: $${matchingStay.res.totalAmount}`}
                            >
                              <div className="d-flex align-items-center gap-1">
                                <i className="bi bi-person-fill small" />
                                <span className="fw-bold small text-truncate" style={{ fontSize: '0.75rem' }}>
                                  {matchingStay.res.guestName}
                                </span>
                              </div>
                              <div className="small text-truncate" style={{ fontSize: '0.68rem', opacity: 0.9 }}>
                                {matchingStay.res.reservationNo}
                              </div>
                            </div>
                          ) : null
                        ) : (
                          // Empty Day Cell: allows double click to book
                          <div
                            className="w-100 h-100 d-flex align-items-center justify-content-center text-muted opacity-0 hover-opacity-100"
                            style={{ cursor: 'pointer' }}
                            title="Double-click to book this room"
                          >
                            <i className="bi bi-plus-circle text-primary opacity-50" />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 3. Reservation Details Modal */}
      {activeReservation && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
          tabIndex={-1}
          onClick={() => setActiveReservation(null)}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            style={{ maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content shadow-lg border-0 rounded-3">
              <div className="modal-header bg-light border-bottom py-3 px-4">
                <div>
                  <h6 className="fw-bold mb-0 text-dark">Reservation Details</h6>
                  <span className="text-muted small">{activeReservation.reservationNo}</span>
                </div>
                <button type="button" className="btn-close" onClick={() => setActiveReservation(null)} />
              </div>
              <div className="modal-body p-4 d-flex flex-column gap-3">
                <div className="p-3 bg-light rounded-3 d-flex justify-content-between align-items-center">
                  <div>
                    <span className="text-muted small d-block">Guest Name</span>
                    <span className="fw-bold fs-6 text-dark">{activeReservation.guestName}</span>
                  </div>
                  <span
                    className="badge text-uppercase px-3 py-1.5 fw-semibold"
                    style={getStatusColor(activeReservation.status)}
                  >
                    {activeReservation.status}
                  </span>
                </div>

                <div className="row g-2">
                  <div className="col-6">
                    <div className="p-2 border rounded-2">
                      <span className="text-muted small d-block">Check-In</span>
                      <span className="fw-bold text-dark">{activeReservation.units[0]?.checkIn}</span>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="p-2 border rounded-2">
                      <span className="text-muted small d-block">Check-Out</span>
                      <span className="fw-bold text-dark">{activeReservation.units[0]?.checkOut}</span>
                    </div>
                  </div>
                </div>

                <div className="row g-2">
                  <div className="col-6">
                    <div className="p-2 border rounded-2">
                      <span className="text-muted small d-block">Total Nights</span>
                      <span className="fw-bold text-dark">{activeReservation.totalNights} Night(s)</span>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="p-2 border rounded-2">
                      <span className="text-muted small d-block">Total Amount</span>
                      <span className="fw-bold text-primary">${activeReservation.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {activeReservation.notes && (
                  <div className="p-2 bg-light-subtle rounded-2 border">
                    <span className="text-muted small d-block fw-semibold">Notes / Special Requests</span>
                    <span className="small text-dark">{activeReservation.notes}</span>
                  </div>
                )}
              </div>
              <div className="modal-footer bg-light border-top py-2 px-4">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setActiveReservation(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Double-click Wizard Modal */}
      {isWizardOpen && (
        <ReservationWizardModal
          isOpen={isWizardOpen}
          initialRoom={wizardRoom}
          initialDates={wizardDates}
          onClose={() => setIsWizardOpen(false)}
          onSuccess={() => {
            setIsWizardOpen(false);
            queryClient.invalidateQueries({ queryKey: ['reservations'] });
            queryClient.invalidateQueries({ queryKey: ['board'] });
          }}
        />
      )}
    </div>
  );
};
