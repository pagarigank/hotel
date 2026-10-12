import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type { BoardUnitDto, CreateUnitDto, UpdateUnitDto } from '@innkeeper/contracts';

interface FloorDto {
  id: string;
  buildingId: string;
  number: string;
  name: string;
}

interface UnitTypeDto {
  id: string;
  code: string;
  name: string;
  kind: string;
  baseRate: number;
}

interface UnitFormModalProps {
  isOpen: boolean;
  unit?: BoardUnitDto | null; // If provided, edit mode; otherwise, create mode
  onClose: () => void;
  onSuccess?: () => void;
}

export const UnitFormModal: React.FC<UnitFormModalProps> = ({
  isOpen,
  unit,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();

  const isEdit = Boolean(unit);

  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [floorId, setFloorId] = useState('');
  const [unitTypeId, setUnitTypeId] = useState('');
  const [connectingUnitNumber, setConnectingUnitNumber] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch floors for branch
  const { data: floors } = useQuery<FloorDto[]>({
    queryKey: ['floors', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/properties/floors?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isOpen,
  });

  // Fetch unit types for tenant
  const { data: unitTypes } = useQuery<UnitTypeDto[]>({
    queryKey: ['unit-types', activeTenantId],
    queryFn: async () => {
      const res = await fetch('/api/v1/properties/unit-types', {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isOpen,
  });

  // Populate state on open / edit
  useEffect(() => {
    if (unit) {
      setNumber(unit.number);
      setName(unit.name || `Room ${unit.number}`);
      setUnitTypeId(unit.unitTypeId);
      setConnectingUnitNumber(unit.connectingUnitNumber || '');
      setSortOrder(1);
    } else {
      setNumber('');
      setName('');
      setConnectingUnitNumber('');
      setSortOrder(1);
    }
    setErrorMessage(null);
  }, [unit, isOpen]);

  // Set default floorId and unitTypeId when loaded
  useEffect(() => {
    if (floors && floors.length > 0 && !floorId) {
      setFloorId(floors[0].id);
    }
  }, [floors, floorId]);

  useEffect(() => {
    if (unitTypes && unitTypes.length > 0 && !unitTypeId) {
      setUnitTypeId(unitTypes[0].id);
    }
  }, [unitTypes, unitTypeId]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (payload: CreateUnitDto) => {
      const res = await fetch('/api/v1/properties/units', {
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
        throw new Error(err.detail || err.title || 'Failed to create unit');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board'] });
      queryClient.invalidateQueries({ queryKey: ['properties-units'] });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: UpdateUnitDto) => {
      if (!unit) return;
      const res = await fetch(`/api/v1/properties/units/${unit.id}`, {
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
        throw new Error(err.detail || err.title || 'Failed to update unit');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board'] });
      queryClient.invalidateQueries({ queryKey: ['properties-units'] });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: Error) => setErrorMessage(err.message),
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!number.trim()) {
      setErrorMessage('Room number is required.');
      return;
    }
    if (!floorId && floors && floors.length > 0) {
      setFloorId(floors[0].id);
    }
    if (!unitTypeId && unitTypes && unitTypes.length > 0) {
      setUnitTypeId(unitTypes[0].id);
    }

    const matchedFloor = floors?.find((f) => f.id === floorId);
    const effectiveFloor = matchedFloor ? matchedFloor.number : '1';
    const effectiveTypeId = unitTypeId || (unitTypes && unitTypes[0]?.id) || '21000000-0000-0000-0000-000000000001';

    if (isEdit) {
      updateMutation.mutate({
        number: number.trim(),
        name: name.trim() || `Room ${number.trim()}`,
        floor: effectiveFloor,
        unitTypeId: effectiveTypeId,
        attrs: { sortOrder: Number(sortOrder) || 1 },
      });
    } else {
      createMutation.mutate({
        branchId: activeBranchId,
        floor: effectiveFloor,
        unitTypeId: effectiveTypeId,
        number: number.trim(),
        name: name.trim() || `Room ${number.trim()}`,
        statusCode: 'vacant_clean',
        isSellable: true,
        attrs: { sortOrder: Number(sortOrder) || 1 },
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
      tabIndex={-1}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content shadow-lg border-0 rounded-3">
          <form onSubmit={handleSubmit}>
            <div className="modal-header border-bottom bg-light px-4 py-3">
              <div className="d-flex align-items-center gap-2">
                <i className={`bi ${isEdit ? 'bi-pencil-square' : 'bi-plus-square'} text-primary fs-5`} />
                <h6 className="modal-title fw-bold mb-0">
                  {isEdit ? `Edit Room ${unit?.number}` : 'Add Single Room Unit'}
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

              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label small fw-bold text-muted mb-1">
                    Room / Unit Number <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm font-monospace"
                    placeholder="e.g. 105"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    required
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label small fw-bold text-muted mb-1">Unit Label / Name</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="e.g. Deluxe King 105"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label small fw-bold text-muted mb-1">
                    Floor Assignment <span className="text-danger">*</span>
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={floorId}
                    onChange={(e) => setFloorId(e.target.value)}
                  >
                    {floors?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} (Floor {f.number})
                      </option>
                    ))}
                    {(!floors || floors.length === 0) && (
                      <option value="23000000-0000-0000-0000-000000000001">Floor 1</option>
                    )}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label small fw-bold text-muted mb-1">
                    Room Category / Type <span className="text-danger">*</span>
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={unitTypeId}
                    onChange={(e) => setUnitTypeId(e.target.value)}
                  >
                    {unitTypes?.map((ut) => (
                      <option key={ut.id} value={ut.id}>
                        {ut.name} ({ut.code}) - ${ut.baseRate}/night
                      </option>
                    ))}
                    {(!unitTypes || unitTypes.length === 0) && (
                      <option value="21000000-0000-0000-0000-000000000001">Standard Room (STD)</option>
                    )}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label small fw-bold text-muted mb-1">Connecting Room #</label>
                  <input
                    type="text"
                    className="form-control form-control-sm font-monospace"
                    placeholder="e.g. 106 (optional)"
                    value={connectingUnitNumber}
                    onChange={(e) => setConnectingUnitNumber(e.target.value)}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label small fw-bold text-muted mb-1">Board Sort Order</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    min={1}
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="p-2.5 bg-light rounded border small text-muted">
                <i className="bi bi-info-circle text-primary me-1" />
                Physical rooms inherit default capacities, base nightly rates, and amenities from their assigned Room Category.
              </div>
            </div>

            <div className="modal-footer border-top bg-light px-4 py-2.5 d-flex justify-content-between">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={onClose}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary fw-semibold"
                disabled={isPending}
              >
                {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Room'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
