import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardUnitDto } from '@innkeeper/contracts';
import { useAppStore } from '../stores/useAppStore';

interface StatusTransitionModalProps {
  unit: BoardUnitDto | null;
  targetStatus: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const StatusTransitionModal: React.FC<StatusTransitionModalProps> = ({
  unit,
  targetStatus,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();

  const [toStatus, setToStatus] = useState(targetStatus || 'vacant_clean');
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  React.useEffect(() => {
    if (targetStatus) setToStatus(targetStatus);
    setErrorMsg('');
  }, [targetStatus]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!unit) return;
      const res = await fetch(`/api/v1/branches/${activeBranchId}/units/${unit.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          toStatus,
          reason: reason || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || data.title || 'Status transition failed');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board'] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message);
    },
  });

  if (!isOpen || !unit) return null;

  const requiresReason = toStatus === 'out_of_order';

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)' }}
      tabIndex={-1}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '420px' }}>
        <div className="modal-content shadow-lg border-0 rounded-3">
          <div className="modal-header border-bottom bg-light px-4 py-3">
            <h6 className="modal-title fw-bold mb-0">Change Status — Room {unit.number}</h6>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body p-4 d-flex flex-column gap-3">
            {errorMsg && (
              <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-0">
                <i className="bi bi-exclamation-triangle-fill" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="form-label small fw-semibold text-muted">Current Status</label>
              <div className="p-2 rounded bg-light border fw-semibold text-dark small d-flex align-items-center gap-2">
                <i className={`bi ${unit.icon}`} />
                {unit.statusLabel}
              </div>
            </div>

            <div>
              <label className="form-label small fw-semibold text-muted">Target Status</label>
              <select
                className="form-select form-select-sm"
                value={toStatus}
                onChange={(e) => setToStatus(e.target.value)}
              >
                <option value="vacant_clean">Vacant Clean</option>
                <option value="vacant_dirty">Vacant Dirty</option>
                <option value="inspected">Inspected</option>
                <option value="due_out">Due Out</option>
                <option value="due_in">Due In</option>
                <option value="out_of_order">Out of Order (OOO)</option>
              </select>
            </div>

            <div>
              <label className="form-label small fw-semibold text-muted d-flex justify-content-between">
                <span>Reason</span>
                {requiresReason ? (
                  <span className="text-danger small">* Mandatory</span>
                ) : (
                  <span className="text-muted small">Optional</span>
                )}
              </label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder={requiresReason ? 'Reason for blocking room...' : 'Optional operational notes...'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required={requiresReason}
              />
            </div>
          </div>

          <div className="modal-footer bg-light px-4 py-2">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary fw-semibold"
              disabled={mutation.isPending || (requiresReason && !reason.trim())}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Updating...' : 'Confirm Transition'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
