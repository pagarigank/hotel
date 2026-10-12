import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardUnitDto } from '@innkeeper/contracts';
import { useAppStore } from '../stores/useAppStore';

interface UnitBlockModalProps {
  unit: BoardUnitDto | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const UnitBlockModal: React.FC<UnitBlockModalProps> = ({
  unit,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();

  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [blockType, setBlockType] = useState<'out_of_order' | 'out_of_service'>('out_of_order');
  const [reason, setReason] = useState('AC Compressor Repair');
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(nextWeek);
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (!unit) return;
      const res = await fetch(`/api/v1/properties/units/${unit.id}/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          branchId: activeBranchId,
          blockType,
          reason,
          fromDate,
          toDate,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || data.title || 'Blocking room failed');
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

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)' }}
      tabIndex={-1}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '440px' }}>
        <div className="modal-content shadow-lg border-0 rounded-3">
          <div className="modal-header border-bottom bg-light px-4 py-3">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-slash-circle-fill text-danger fs-5" />
              <div>
                <h6 className="modal-title fw-bold mb-0">Block Unit — Room {unit.number}</h6>
                <span className="text-muted small">Out-of-Order / Out-of-Service Maintenance</span>
              </div>
            </div>
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
              <label className="form-label small fw-semibold text-muted">Block Type</label>
              <select
                className="form-select form-select-sm"
                value={blockType}
                onChange={(e) => setBlockType(e.target.value as any)}
              >
                <option value="out_of_order">Out of Order (OOO - Deducts from Sellable Inventory)</option>
                <option value="out_of_service">Out of Service (OOS - Minor Fixes, Remains in Count)</option>
              </select>
            </div>

            <div>
              <label className="form-label small fw-semibold text-muted">Reason</label>
              <select
                className="form-select form-select-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="AC Compressor Repair">AC Compressor Repair</option>
                <option value="Plumbing / Bathroom Leak">Plumbing / Bathroom Leak</option>
                <option value="Electrical Issue">Electrical Issue</option>
                <option value="Deep Carpet Cleaning">Deep Carpet Cleaning</option>
                <option value="Furniture Replacement">Furniture Replacement</option>
                <option value="Painting & Renovations">Painting & Renovations</option>
                <option value="General Maintenance">General Maintenance</option>
              </select>
            </div>

            <div className="row g-2">
              <div className="col-6">
                <label className="form-label small fw-semibold text-muted">From Date</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="col-6">
                <label className="form-label small fw-semibold text-muted">To Date</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="form-label small fw-semibold text-muted">Technician Notes</label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                placeholder="Optional notes for maintenance crew..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer bg-light px-4 py-2">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger fw-semibold"
              disabled={mutation.isPending || !reason.trim()}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Blocking...' : 'Block Room'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
