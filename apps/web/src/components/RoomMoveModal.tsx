import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';

interface RoomMoveModalProps {
  stayId: string;
  guestName: string;
  currentUnitNumber: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface UnitOption {
  id: string;
  number: string;
  floor: string;
  statusCode: string;
  unitTypeName?: string;
}

export const RoomMoveModal: React.FC<RoomMoveModalProps> = ({
  stayId,
  guestName,
  currentUnitNumber,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();

  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch clean rooms
  const { data: unitsData, isLoading: loadingUnits } = useQuery<{ floors: Array<{ units: UnitOption[] }> }>({
    queryKey: ['board-compact', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/branches/${activeBranchId}/board/compact`, {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) throw new Error('Failed to fetch rooms');
      return res.json();
    },
    enabled: isOpen,
  });

  const availableUnits: UnitOption[] = (unitsData?.floors || []).flatMap((f) =>
    f.units.filter((u) => u.statusCode === 'vacant_clean' || u.statusCode === 'inspected'),
  );

  const roomMoveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/stays/${stayId}/room-move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
        },
        body: JSON.stringify({
          newUnitId: selectedUnitId,
          reason,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || 'Room move failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board-compact'] });
      queryClient.invalidateQueries({ queryKey: ['stays'] });
      queryClient.invalidateQueries({ queryKey: ['hk-tasks'] });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setErrorMessage(err.message);
    },
  });

  if (!isOpen) return null;

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content shadow-lg border-0 rounded-3">
          <div className="modal-header bg-light border-bottom px-4 py-3">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-arrow-left-right text-primary fs-5" />
              <h5 className="modal-title fw-bold text-dark mb-0">Relocate Guest (Room Move)</h5>
            </div>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>

          <div className="modal-body p-4">
            {errorMessage && (
              <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                <i className="bi bi-exclamation-triangle-fill" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="card bg-light border-0 p-3 mb-3">
              <span className="text-muted small d-block">Current Assignment</span>
              <strong className="fs-6 text-dark">{guestName}</strong>
              <span className="text-muted small">Occupying Room <strong>{currentUnitNumber}</strong></span>
            </div>

            <div className="mb-3">
              <label className="form-label small fw-semibold text-dark">Destination Clean Room</label>
              {loadingUnits ? (
                <div className="text-muted small">Loading available clean rooms...</div>
              ) : (
                <select
                  className="form-select"
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                >
                  <option value="">-- Select Destination Room --</option>
                  {availableUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      Room {u.number} (Floor {u.floor}) - {u.statusCode === 'inspected' ? 'Inspected Clean' : 'Vacant Clean'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label small fw-semibold text-dark">Reason for Relocation</label>
              <select
                className="form-select mb-2"
                onChange={(e) => setReason(e.target.value)}
                value={reason}
              >
                <option value="">-- Common Reasons --</option>
                <option value="Guest requested quiet room / higher floor">Guest requested quiet room / higher floor</option>
                <option value="Air conditioning / maintenance issue in room">Air conditioning / maintenance issue in room</option>
                <option value="Complimentary VIP room upgrade">Complimentary VIP room upgrade</option>
                <option value="Plumbing defect reported">Plumbing defect reported</option>
              </select>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Or type custom reason..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="p-3 border rounded-3 bg-light-subtle small text-muted">
              <i className="bi bi-info-circle text-primary me-1" />
              Room {currentUnitNumber} will be marked <code>vacant_dirty</code> and automatically queued for turnaround housekeeping clean.
            </div>
          </div>

          <div className="modal-footer bg-light px-4 py-3 border-top d-flex justify-content-between">
            <button type="button" className="btn btn-secondary px-3" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary px-4 fw-semibold"
              disabled={roomMoveMutation.isPending || !selectedUnitId || !reason.trim()}
              onClick={() => roomMoveMutation.mutate()}
            >
              {roomMoveMutation.isPending ? 'Moving...' : 'Confirm Room Move'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
