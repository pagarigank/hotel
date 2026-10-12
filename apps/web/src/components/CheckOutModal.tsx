import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';

interface CheckOutModalProps {
  stayId: string;
  guestName: string;
  unitNumber: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CheckOutModal: React.FC<CheckOutModalProps> = ({
  stayId,
  guestName,
  unitNumber,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId } = useAppStore();

  const [settlementMethod, setSettlementMethod] = useState<'card' | 'cash'>('card');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  // Fetch Stay's primary folio
  const { data: folio, isLoading: loadingFolio, refetch: refetchFolio } = useQuery({
    queryKey: ['stay-folio', activeTenantId, stayId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/stays/${stayId}/folio`, {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) throw new Error('Failed to fetch folio for stay');
      return res.json();
    },
    enabled: isOpen && !!stayId,
  });

  const folioBalance = Number(folio?.balance || 0);

  // Quick Settle Balance Mutation
  const settleMutation = useMutation({
    mutationFn: async () => {
      if (!folio?.id) return;
      const res = await fetch(`/api/v1/folios/${folio.id}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
        },
        body: JSON.stringify({
          windowNo: 1,
          amount: folioBalance,
          paymentMethod: settlementMethod,
          cardToken: settlementMethod === 'card' ? 'tok_simulated_token' : undefined,
          lastFour: settlementMethod === 'card' ? '4242' : undefined,
          reference: 'Checkout Final Balance Settlement',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || 'Payment settlement failed');
      }
      return res.json();
    },
    onSuccess: () => {
      refetchFolio();
    },
    onError: (err: any) => {
      setErrorMessage(err.message);
    },
  });

  // Check-Out Mutation
  const checkOutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/stays/${stayId}/check-out`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
        },
        body: JSON.stringify({
          settlementType: 'zero_balance',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || 'Check-out failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board-compact'] });
      queryClient.invalidateQueries({ queryKey: ['stays'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['hk-tasks'] });
      setSuccessInfo(`Room ${unitNumber} successfully checked out! Status updated to 'vacant_dirty' and housekeeping checkout turnaround task dispatched.`);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);
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
          {/* Header */}
          <div className="modal-header bg-light border-bottom px-4 py-3">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-box-arrow-right text-danger fs-5" />
              <h5 className="modal-title fw-bold text-dark mb-0">Guest Check-Out & Settlement</h5>
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

            {successInfo ? (
              <div className="text-center py-4">
                <i className="bi bi-check-circle-fill text-success fs-1 d-block mb-2" />
                <h6 className="fw-bold text-dark">Check-Out Complete</h6>
                <p className="text-muted small mb-0">{successInfo}</p>
              </div>
            ) : (
              <div>
                <div className="card bg-light border-0 p-3 mb-3">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <strong className="d-block text-dark fs-6">{guestName}</strong>
                      <span className="text-muted small">Room {unitNumber}</span>
                    </div>
                    <span className="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1">
                      Due Out
                    </span>
                  </div>
                </div>

                {loadingFolio ? (
                  <div className="text-center py-3 text-muted">Checking folio balance...</div>
                ) : folioBalance > 0.009 ? (
                  <div className="border border-danger-subtle bg-danger-subtle rounded-3 p-3 mb-3">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span className="text-danger fw-bold small d-flex align-items-center gap-1">
                        <i className="bi bi-exclamation-octagon-fill" /> Outstanding Balance Required
                      </span>
                      <strong className="text-danger fs-5">
                        {folio?.currency} {folioBalance.toFixed(2)}
                      </strong>
                    </div>
                    <p className="small text-muted mb-3">
                      Hotel accounting policy strictly requires zero balance prior to departure clearance.
                    </p>

                    <label className="form-label small fw-semibold text-dark">Quick Settlement Tender</label>
                    <div className="input-group mb-2">
                      <select
                        className="form-select form-select-sm"
                        value={settlementMethod}
                        onChange={(e) => setSettlementMethod(e.target.value as any)}
                      >
                        <option value="card">Credit Card (Simulated Token)</option>
                        <option value="cash">Cash Settlement</option>
                      </select>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger fw-semibold px-3"
                        disabled={settleMutation.isPending}
                        onClick={() => settleMutation.mutate()}
                      >
                        {settleMutation.isPending ? 'Settling...' : `Settle ${folio?.currency} ${folioBalance.toFixed(2)}`}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="alert alert-success d-flex align-items-center gap-2 py-2 px-3 small mb-3">
                    <i className="bi bi-check-circle-fill text-success fs-5" />
                    <div>
                      <strong>Zero Balance Verified ({folio?.currency} 0.00)</strong>
                      <span className="d-block text-muted">Folio is fully settled. Guest is cleared for departure.</span>
                    </div>
                  </div>
                )}

                <div className="p-3 border rounded-3 bg-light small text-muted">
                  <div className="d-flex align-items-center gap-2 mb-1 text-dark fw-semibold">
                    <i className="bi bi-arrow-repeat text-primary" /> Automated Turnaround Actions:
                  </div>
                  <ul className="mb-0 ps-3">
                    <li>Room {unitNumber} physical state will transition to <code>vacant_dirty</code>.</li>
                    <li>High-priority Housekeeping checkout clean turnaround task will be queued.</li>
                    <li>Primary guest folio will be marked settled.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {!successInfo && (
            <div className="modal-footer bg-light px-4 py-3 border-top d-flex justify-content-between">
              <button type="button" className="btn btn-secondary px-3" onClick={onClose}>
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-danger px-4 fw-semibold d-flex align-items-center gap-2"
                disabled={checkOutMutation.isPending || folioBalance > 0.009}
                onClick={() => checkOutMutation.mutate()}
              >
                {checkOutMutation.isPending && <span className="spinner-border spinner-border-sm" />}
                <span>Confirm Check-Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
