import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type { ReservationDto, ModifyReservationDto } from '@innkeeper/contracts';

interface ModifyReservationModalProps {
  reservation: ReservationDto | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ModifyReservationModal: React.FC<ModifyReservationModalProps> = ({
  reservation,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();

  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'hold' | 'confirmed' | 'in_house' | 'checked_out' | 'cancelled' | 'no_show'>('confirmed');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (reservation) {
      setNotes(reservation.notes || '');
      setStatus((reservation.status as any) || 'confirmed');
      setErrorMessage(null);
    }
  }, [reservation, isOpen]);

  const modifyMutation = useMutation({
    mutationFn: async (payload: ModifyReservationDto) => {
      if (!reservation) return;
      const res = await fetch(`/api/v1/reservations/${reservation.id}`, {
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
        throw new Error(err.detail || err.title || 'Failed to modify reservation');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  if (!isOpen || !reservation) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    modifyMutation.mutate({
      status,
      notes: notes.trim(),
    });
  };

  const firstUnit = reservation.units?.[0];

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
      tabIndex={-1}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        style={{ maxWidth: 540 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content shadow-lg border-0 rounded-3">
          <form onSubmit={handleSubmit}>
            <div className="modal-header border-bottom bg-light px-4 py-3">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-pencil-square text-primary fs-5" />
                <h6 className="modal-title fw-bold mb-0">
                  Modify Reservation: {reservation.reservationNo}
                </h6>
              </div>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>

            <div className="modal-body p-4 d-flex flex-column gap-3">
              {errorMessage && (
                <div className="alert alert-danger py-2 small mb-0 d-flex align-items-center gap-2">
                  <i className="bi bi-exclamation-triangle-fill" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Guest & Room Summary Card */}
              <div className="p-3 bg-light rounded-3 border d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-bold text-dark">{reservation.guestName}</div>
                  <div className="small text-muted">
                    {firstUnit?.unitTypeName} ({firstUnit?.unitTypeCode}) • {firstUnit?.checkIn} → {firstUnit?.checkOut}
                  </div>
                </div>
                <div className="text-end">
                  <div className="fw-bold text-primary fs-6">${reservation.totalAmount.toFixed(2)}</div>
                  <span className="badge bg-secondary-subtle text-secondary small text-uppercase">
                    {reservation.status}
                  </span>
                </div>
              </div>

              {/* Status Selector */}
              <div>
                <label className="form-label small fw-bold text-muted mb-1">Reservation Status</label>
                <select
                  className="form-select form-select-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="hold">On Hold</option>
                  <option value="in_house">In-House</option>
                  <option value="checked_out">Checked Out</option>
                </select>
              </div>

              {/* Operational Notes */}
              <div>
                <label className="form-label small fw-bold text-muted mb-1">
                  Front Desk Operational Notes & Special Requests
                </label>
                <textarea
                  className="form-control form-control-sm"
                  rows={4}
                  placeholder="e.g. Late check-in requested (arrival 11 PM), quiet room on high floor"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="p-2.5 bg-light rounded border small text-muted">
                <i className="bi bi-shield-check text-success me-1" />
                Modifications update the reservation audit log and sync across Front Desk & Stay charts in real-time.
              </div>
            </div>

            <div className="modal-footer border-top bg-light px-4 py-2.5 d-flex justify-content-between">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={onClose}
                disabled={modifyMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary fw-semibold"
                disabled={modifyMutation.isPending}
              >
                {modifyMutation.isPending ? 'Saving...' : 'Save Modifications'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
