import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UnitTypeDto } from '@innkeeper/contracts';
import { useAppStore } from '../stores/useAppStore';

interface BulkUnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkUnitModal: React.FC<BulkUnitModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();

  const [floor, setFloor] = useState('6');
  const [prefix, setPrefix] = useState('60');
  const [startNumber, setStartNumber] = useState(1);
  const [endNumber, setEndNumber] = useState(10);
  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch unit types
  const { data: unitTypes } = useQuery<UnitTypeDto[]>({
    queryKey: ['unit-types', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/properties/unit-types?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load unit types');
      return res.json();
    },
    enabled: isOpen,
  });

  React.useEffect(() => {
    if (unitTypes && unitTypes.length > 0 && !selectedUnitTypeId) {
      setSelectedUnitTypeId(unitTypes[0].id);
    }
  }, [unitTypes, selectedUnitTypeId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/properties/units/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          branchId: activeBranchId,
          unitTypeId: selectedUnitTypeId,
          floor,
          prefix,
          startNumber: Number(startNumber),
          endNumber: Number(endNumber),
          padding: 1,
          statusCode: 'vacant_clean',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || data.title || 'Bulk unit creation failed');
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

  if (!isOpen) return null;

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)' }}
      tabIndex={-1}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '440px' }}>
        <div className="modal-content shadow-lg border-0 rounded-3">
          <div className="modal-header border-bottom bg-light px-4 py-3">
            <h6 className="modal-title fw-bold mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-grid-fill text-primary" />
              Bulk Unit Pattern Generator
            </h6>
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
              <label className="form-label small fw-semibold text-muted">Room Type</label>
              <select
                className="form-select form-select-sm"
                value={selectedUnitTypeId}
                onChange={(e) => setSelectedUnitTypeId(e.target.value)}
              >
                {unitTypes?.map((ut) => (
                  <option key={ut.id} value={ut.id}>
                    {ut.code} — {ut.name} (Base ₱{ut.baseRate.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div className="row g-2">
              <div className="col-6">
                <label className="form-label small fw-semibold text-muted">Floor Number</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                />
              </div>
              <div className="col-6">
                <label className="form-label small fw-semibold text-muted">Room Prefix</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                />
              </div>
            </div>

            <div className="row g-2">
              <div className="col-6">
                <label className="form-label small fw-semibold text-muted">Start Sequence</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={startNumber}
                  onChange={(e) => setStartNumber(Number(e.target.value))}
                />
              </div>
              <div className="col-6">
                <label className="form-label small fw-semibold text-muted">End Sequence</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={endNumber}
                  onChange={(e) => setEndNumber(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="p-2 rounded bg-light border text-muted small">
              Preview: Creates rooms <strong>{prefix}{startNumber}</strong> to <strong>{prefix}{endNumber}</strong> on Floor {floor}.
            </div>
          </div>

          <div className="modal-footer bg-light px-4 py-2">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary fw-semibold"
              disabled={mutation.isPending || !selectedUnitTypeId}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Generating...' : 'Generate Units'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
