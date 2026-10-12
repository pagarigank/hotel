import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type { BoardUnitDto, ReservationDto } from '@innkeeper/contracts';

interface WalkInModalProps {
  unit: BoardUnitDto | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (reservation: ReservationDto) => void;
}

export const WalkInModal: React.FC<WalkInModalProps> = ({
  unit,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, businessDate } = useAppStore();

  const today = businessDate || new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [checkIn, setCheckIn] = useState<string>(today);
  const [checkOut, setCheckOut] = useState<string>(tomorrow);
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [adults, setAdults] = useState<number>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const walkInMutation = useMutation({
    mutationFn: async () => {
      if (!unit) throw new Error('No unit selected');
      const payload = {
        branchId: activeBranchId,
        unitId: unit.id,
        checkIn,
        checkOut,
        adults,
        guest: {
          firstName: firstName.trim() || 'Walk-In',
          lastName: lastName.trim() || 'Guest',
          phone: phone.trim() || undefined,
        },
        notes: `Front desk quick walk-in arrival for Room ${unit.number}`,
      };

      const res = await fetch('/api/v1/reservations/walk-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.title || 'Walk-in booking failed');
      }

      return res.json() as Promise<ReservationDto>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['board-units'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['availability-search'] });
      if (onSuccess) onSuccess(data);
      onClose();
    },
    onError: (err: Error) => {
      setErrorMessage(err.message);
    },
  });

  if (!isOpen || !unit) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    walkInMutation.mutate();
  };

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
      tabIndex={-1}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        style={{ maxWidth: '480px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content shadow-lg border-0 rounded-3">
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div className="modal-header border-bottom bg-light px-4 py-3">
              <div className="d-flex align-items-center gap-2">
                <div
                  className="rounded-circle bg-warning text-dark d-flex align-items-center justify-content-center"
                  style={{ width: 36, height: 36 }}
                >
                  <i className="bi bi-lightning-charge-fill fs-6" />
                </div>
                <div>
                  <h6 className="modal-title fw-bold mb-0 text-dark">Quick Walk-In Arrival</h6>
                  <span className="text-muted small">Fast 3-click front desk check-in</span>
                </div>
              </div>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>

            {/* Body */}
            <div className="modal-body p-4 d-flex flex-column gap-3">
              {errorMessage && (
                <div className="alert alert-danger py-2 mb-0 small d-flex align-items-center gap-2">
                  <i className="bi bi-exclamation-triangle-fill" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Room pill */}
              <div className="p-3 bg-light rounded-3 border d-flex justify-content-between align-items-center">
                <div>
                  <span className="text-muted small d-block">Target Room</span>
                  <strong className="fs-5 text-primary">Room {unit.number}</strong>
                  <span className="text-muted small ms-2">({unit.unitTypeCode} — {unit.unitTypeName})</span>
                </div>
                <span className="badge bg-success-subtle text-success border border-success-subtle">
                  Ready for Arrival
                </span>
              </div>

              {/* Guest details */}
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label small fw-bold text-muted mb-1">First Name</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Guest First Name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="col-6">
                  <label className="form-label small fw-bold text-muted mb-1">Last Name</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Guest Last Name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
                <div className="col-12">
                  <label className="form-label small fw-bold text-muted mb-1">Mobile / Phone</label>
                  <input
                    type="tel"
                    className="form-control form-control-sm"
                    placeholder="+1-555-0100"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label small fw-bold text-muted mb-1">Check-In</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    required
                  />
                </div>
                <div className="col-6">
                  <label className="form-label small fw-bold text-muted mb-1">Check-Out</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    min={checkIn}
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    required
                  />
                </div>
                <div className="col-12">
                  <label className="form-label small fw-bold text-muted mb-1">Occupancy</label>
                  <select
                    className="form-select form-select-sm"
                    value={adults}
                    onChange={(e) => setAdults(Number(e.target.value))}
                  >
                    <option value={1}>1 Adult</option>
                    <option value={2}>2 Adults</option>
                    <option value={3}>3 Adults</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="modal-footer border-top bg-light px-4 py-3 d-flex justify-content-between">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={onClose}
                disabled={walkInMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-warning fw-bold text-dark d-flex align-items-center gap-1 shadow-sm px-3"
                disabled={walkInMutation.isPending}
              >
                {walkInMutation.isPending ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <i className="bi bi-check-circle-fill" />
                    <span>Confirm Walk-In & Check In</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
