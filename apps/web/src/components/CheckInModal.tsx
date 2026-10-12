import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';

interface CheckInModalProps {
  reservationId: string;
  reservationUnitId: string;
  guestName: string;
  unitTypeName: string;
  checkInDate: string;
  checkOutDate: string;
  preassignedUnitId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface UnitOption {
  id: string;
  number: string;
  floor: string;
  statusCode: string;
}

export const CheckInModal: React.FC<CheckInModalProps> = ({
  reservationId,
  reservationUnitId,
  guestName,
  unitTypeName,
  checkInDate,
  checkOutDate,
  preassignedUnitId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(preassignedUnitId || '');
  const [keycardCode, setKeycardCode] = useState<string>('');
  const [regCardAccepted, setRegCardAccepted] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch clean units for assignment
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
    f.units.filter((u) => u.statusCode === 'vacant_clean' || u.statusCode === 'inspected' || u.id === preassignedUnitId),
  );

  const checkInMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/stays/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
        },
        body: JSON.stringify({
          reservationId,
          reservationUnitId,
          unitId: selectedUnitId,
          keycardCode: keycardCode || undefined,
          registrationCardAccepted: regCardAccepted,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || 'Check-in failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board-compact'] });
      queryClient.invalidateQueries({ queryKey: ['stays'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
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
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content shadow-lg border-0 rounded-3">
          {/* Header */}
          <div className="modal-header bg-light border-bottom px-4 py-3">
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-primary text-white rounded-pill px-2 py-1">Step {step} of 3</span>
              <h5 className="modal-title fw-bold text-dark mb-0">Front Desk Guest Check-In Wizard</h5>
            </div>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>

          {/* Stepper Progress */}
          <div className="bg-light-subtle border-bottom px-4 py-2 d-flex justify-content-between align-items-center">
            <div className={`d-flex align-items-center gap-2 ${step >= 1 ? 'text-primary fw-bold' : 'text-muted'}`}>
              <span className={`badge rounded-circle ${step >= 1 ? 'bg-primary' : 'bg-secondary'}`}>1</span>
              <span className="small">Registration</span>
            </div>
            <i className="bi bi-chevron-right text-muted small" />
            <div className={`d-flex align-items-center gap-2 ${step >= 2 ? 'text-primary fw-bold' : 'text-muted'}`}>
              <span className={`badge rounded-circle ${step >= 2 ? 'bg-primary' : 'bg-secondary'}`}>2</span>
              <span className="small">Room Allocation</span>
            </div>
            <i className="bi bi-chevron-right text-muted small" />
            <div className={`d-flex align-items-center gap-2 ${step >= 3 ? 'text-primary fw-bold' : 'text-muted'}`}>
              <span className={`badge rounded-circle ${step >= 3 ? 'bg-primary' : 'bg-secondary'}`}>3</span>
              <span className="small">Keycard & Finalize</span>
            </div>
          </div>

          {/* Body */}
          <div className="modal-body p-4">
            {errorMessage && (
              <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                <i className="bi bi-exclamation-triangle-fill" />
                <span>{errorMessage}</span>
              </div>
            )}

            {step === 1 && (
              <div>
                <h6 className="fw-bold text-dark mb-3">Guest & Booking Details</h6>
                <div className="card bg-light border-0 p-3 mb-3">
                  <div className="row g-2">
                    <div className="col-sm-6">
                      <span className="text-muted small d-block">Primary Guest</span>
                      <strong className="fs-6 text-dark">{guestName}</strong>
                    </div>
                    <div className="col-sm-6">
                      <span className="text-muted small d-block">Room Category</span>
                      <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                        {unitTypeName}
                      </span>
                    </div>
                    <div className="col-sm-6">
                      <span className="text-muted small d-block">Arrival Date</span>
                      <span className="fw-semibold">{checkInDate}</span>
                    </div>
                    <div className="col-sm-6">
                      <span className="text-muted small d-block">Departure Date</span>
                      <span className="fw-semibold">{checkOutDate}</span>
                    </div>
                  </div>
                </div>

                <div className="form-check p-3 border rounded-3 bg-white">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="regCardCheck"
                    checked={regCardAccepted}
                    onChange={(e) => setRegCardAccepted(e.target.checked)}
                  />
                  <label className="form-check-label small text-dark" htmlFor="regCardCheck">
                    <strong>Guest Registration Card & Policy Agreement</strong>
                    <span className="d-block text-muted">
                      Guest has presented government identification and agreed to standard hotel terms, non-smoking policy, and check-out at 11:00 AM.
                    </span>
                  </label>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h6 className="fw-bold text-dark mb-2">Select Clean Room Assignment</h6>
                <p className="text-muted small mb-3">
                  System strictly requires rooms to be in <code>vacant_clean</code> or <code>inspected</code> state.
                </p>

                {loadingUnits ? (
                  <div className="text-center py-4 text-muted">Loading available rooms...</div>
                ) : availableUnits.length === 0 ? (
                  <div className="alert alert-warning small">
                    <i className="bi bi-exclamation-circle me-1" />
                    No clean rooms currently available in this category. Please request housekeeping priority clean.
                  </div>
                ) : (
                  <div className="row g-2 max-h-60 overflow-y-auto" style={{ maxHeight: '240px' }}>
                    {availableUnits.map((u) => (
                      <div key={u.id} className="col-sm-6">
                        <div
                          className={`p-3 border rounded-2 cursor-pointer d-flex justify-content-between align-items-center transition-all ${
                            selectedUnitId === u.id
                              ? 'border-primary bg-primary-subtle shadow-sm'
                              : 'bg-white hover-bg-light'
                          }`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedUnitId(u.id)}
                        >
                          <div>
                            <strong className="d-block text-dark">Room {u.number}</strong>
                            <span className="small text-muted">Floor {u.floor}</span>
                          </div>
                          <span className={`badge ${u.statusCode === 'inspected' ? 'bg-success' : 'bg-info text-dark'}`}>
                            {u.statusCode === 'inspected' ? 'Inspected Clean' : 'Vacant Clean'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div>
                <h6 className="fw-bold text-dark mb-3">Keycard & Folio Activation</h6>
                <div className="mb-3">
                  <label className="form-label small fw-semibold text-muted">Keycard RFID / Encoder Code</label>
                  <div className="input-group">
                    <span className="input-group-text bg-light"><i className="bi bi-key-fill text-primary" /></span>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. KEY-101-4921"
                      value={keycardCode}
                      onChange={(e) => setKeycardCode(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setKeycardCode(`KEY-${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`)}
                    >
                      Auto Generate
                    </button>
                  </div>
                  <small className="text-muted">Enter RFID physical card tag or click auto-generate for mock keycard encoding.</small>
                </div>

                <div className="card bg-light border-0 p-3">
                  <div className="d-flex align-items-center gap-2 text-success fw-semibold small mb-1">
                    <i className="bi bi-shield-check fs-5" />
                    <span>Folio Master Window 1 Initialized</span>
                  </div>
                  <p className="text-muted small mb-0">
                    A primary guest folio will be created for room rate postings, taxes, and incidental charges with PCI DSS tokenized payment protection.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="modal-footer bg-light px-4 py-3 border-top d-flex justify-content-between">
            {step > 1 ? (
              <button type="button" className="btn btn-outline-secondary px-3" onClick={() => setStep((s) => (s - 1) as any)}>
                Back
              </button>
            ) : <div />}

            <div className="d-flex gap-2">
              <button type="button" className="btn btn-secondary px-3" onClick={onClose}>
                Cancel
              </button>

              {step < 3 ? (
                <button
                  type="button"
                  className="btn btn-primary px-4 fw-semibold"
                  disabled={step === 1 && !regCardAccepted || step === 2 && !selectedUnitId}
                  onClick={() => setStep((s) => (s + 1) as any)}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-success px-4 fw-semibold d-flex align-items-center gap-2"
                  disabled={checkInMutation.isPending || !selectedUnitId}
                  onClick={() => checkInMutation.mutate()}
                >
                  {checkInMutation.isPending && <span className="spinner-border spinner-border-sm" />}
                  <span>Complete Check-In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
