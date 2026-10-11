import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';

interface ManagerOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManagerOverrideModal: React.FC<ManagerOverrideModalProps> = ({ isOpen, onClose }) => {
  const { activeTenantId } = useAppStore();

  const [managerEmail, setManagerEmail] = useState('admin@acme.com');
  const [managerPin, setManagerPin] = useState('1234');
  const [action, setAction] = useState('apply_folio_discount');
  const [discountPct, setDiscountPct] = useState(25);
  const [reason, setReason] = useState('VIP guest complaint regarding delayed room inspection');
  const [overrideResult, setOverrideResult] = useState<any>(null);

  const overrideMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/auth/manager-override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
        },
        body: JSON.stringify({
          managerEmail,
          managerPin,
          action,
          discountPct: Number(discountPct),
          reason,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || errorData.title || 'Manager override failed');
      }

      return res.json();
    },
    onSuccess: (data) => {
      setOverrideResult(data);
    },
  });

  if (!isOpen) return null;

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)' }}
      tabIndex={-1}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content shadow-lg border-0 rounded-3">
          <div className="modal-header border-bottom bg-light px-4 py-3">
            <div className="d-flex align-items-center gap-2">
              <div
                className="rounded-circle bg-warning-subtle text-warning d-flex align-items-center justify-content-center"
                style={{ width: '36px', height: '36px' }}
              >
                <i className="bi bi-shield-lock-fill fs-5" />
              </div>
              <div>
                <h6 className="modal-title fw-bold mb-0">Manager Override Authorization</h6>
                <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                  Sensitive operational limit bypass with mandatory audit logging
                </span>
              </div>
            </div>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body px-4 py-3">
            {overrideResult ? (
              <div className="alert alert-success border-success-subtle p-3 mb-0">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <i className="bi bi-check-circle-fill text-success fs-5" />
                  <span className="fw-bold">Override Approved by {overrideResult.managerName}</span>
                </div>
                <p className="small mb-2 text-dark">
                  High-priority audit log registered with transaction signature. Valid for 5 minutes.
                </p>
                <div className="p-2 bg-white rounded border font-monospace text-break" style={{ fontSize: '0.75rem' }}>
                  <span className="fw-bold text-muted">Token:</span> {overrideResult.overrideToken}
                </div>
                <div className="mt-3 text-end">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      setOverrideResult(null);
                      onClose();
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  overrideMutation.mutate();
                }}
              >
                {overrideMutation.isError && (
                  <div className="alert alert-danger py-2 px-3 small mb-3">
                    <i className="bi bi-exclamation-triangle-fill me-2" />
                    {(overrideMutation.error as Error).message}
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label small fw-semibold text-muted">Manager Email</label>
                  <input
                    type="email"
                    className="form-control form-control-sm"
                    value={managerEmail}
                    onChange={(e) => setManagerEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-semibold text-muted">
                    Manager PIN <span className="badge bg-secondary-subtle text-secondary ms-1">Default: 1234</span>
                  </label>
                  <input
                    type="password"
                    maxLength={8}
                    className="form-control form-control-sm font-monospace"
                    value={managerPin}
                    onChange={(e) => setManagerPin(e.target.value)}
                    required
                  />
                </div>

                <div className="row g-2 mb-3">
                  <div className="col-7">
                    <label className="form-label small fw-semibold text-muted">Action Type</label>
                    <select
                      className="form-select form-select-sm"
                      value={action}
                      onChange={(e) => setAction(e.target.value)}
                    >
                      <option value="apply_folio_discount">Apply Discount Exceeding Limit</option>
                      <option value="void_posted_charge">Void Posted Folio Charge</option>
                      <option value="night_audit_override">Night Audit Imbalance Bypass</option>
                    </select>
                  </div>
                  <div className="col-5">
                    <label className="form-label small fw-semibold text-muted">Discount %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="form-control form-control-sm"
                      value={discountPct}
                      onChange={(e) => setDiscountPct(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-semibold text-muted">Mandatory Reason</label>
                  <textarea
                    rows={2}
                    className="form-control form-control-sm"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    placeholder="Provide detailed justification for audit trail..."
                  />
                </div>

                <div className="d-flex justify-content-end gap-2 pt-2 border-top">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-sm btn-warning fw-semibold d-flex align-items-center gap-1"
                    disabled={overrideMutation.isPending}
                  >
                    {overrideMutation.isPending && (
                      <span className="spinner-border spinner-border-sm me-1" role="status" />
                    )}
                    Authorize Override
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
