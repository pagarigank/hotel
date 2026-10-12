import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';

interface FolioWorkspaceModalProps {
  folioId: string;
  stayId?: string;
  guestName?: string;
  unitNumber?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface FolioLine {
  id: string;
  windowNo: number;
  businessDate: string;
  lineType: 'charge' | 'payment' | 'adjustment' | 'transfer';
  chargeType: string;
  description: string;
  qty: number;
  unitAmount: number;
  amount: number;
  taxAmount: number;
  reversesLineId?: string;
  createdAt: string;
}

interface FolioData {
  id: string;
  folioNo: string;
  status: string;
  currency: string;
  totalCharges: number;
  totalPayments: number;
  balance: number;
  version: number;
  lines: FolioLine[];
}

export const FolioWorkspaceModal: React.FC<FolioWorkspaceModalProps> = ({
  folioId,
  stayId,
  guestName,
  unitNumber,
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId } = useAppStore();

  const [activeWindow, setActiveWindow] = useState<number>(1);
  const [showPostModal, setShowPostModal] = useState<boolean>(false);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [showVoidModal, setShowVoidModal] = useState<boolean>(false);
  const [selectedLineForVoid, setSelectedLineForVoid] = useState<FolioLine | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');

  // Post Charge Form State
  const [postChargeType, setPostChargeType] = useState<string>('fnb');
  const [postDescription, setPostDescription] = useState<string>('');
  const [postQty, setPostQty] = useState<number>(1);
  const [postUnitAmount, setPostUnitAmount] = useState<number>(0);
  const [postTaxAmount, setPostTaxAmount] = useState<number>(0);

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'city_ledger'>('card');
  const [cardLastFour, setCardLastFour] = useState<string>('4242');
  const [paymentReference, setPaymentReference] = useState<string>('');

  // Fetch Folio Details
  const { data: folio, isLoading, refetch } = useQuery<FolioData>({
    queryKey: ['folio', activeTenantId, folioId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/folios/${folioId}`, {
        headers: { 'X-Tenant-Id': activeTenantId },
      });
      if (!res.ok) throw new Error('Failed to load folio');
      return res.json();
    },
    enabled: isOpen && !!folioId,
  });

  // Post Charge Mutation
  const postChargeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/folios/${folioId}/lines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
        },
        body: JSON.stringify({
          windowNo: activeWindow,
          lineType: 'charge',
          chargeType: postChargeType,
          description: postDescription,
          qty: postQty,
          unitAmount: postUnitAmount,
          taxAmount: postTaxAmount,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || 'Failed to post charge');
      }
      return res.json();
    },
    onSuccess: () => {
      setShowPostModal(false);
      setPostDescription('');
      setPostUnitAmount(0);
      setPostTaxAmount(0);
      refetch();
    },
  });

  // Record Payment Mutation (PCI Tokenized)
  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/folios/${folioId}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
        },
        body: JSON.stringify({
          windowNo: activeWindow,
          amount: paymentAmount,
          paymentMethod,
          cardToken: paymentMethod === 'card' ? 'tok_simulated_token' : undefined,
          lastFour: paymentMethod === 'card' ? cardLastFour : undefined,
          reference: paymentReference || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || 'Failed to record payment');
      }
      return res.json();
    },
    onSuccess: () => {
      setShowPaymentModal(false);
      setPaymentAmount(0);
      setPaymentReference('');
      refetch();
    },
  });

  // Void Line Mutation (Append-only)
  const voidMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLineForVoid) return;
      const res = await fetch(`/api/v1/folios/${folioId}/lines/${selectedLineForVoid.id}/void`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
        },
        body: JSON.stringify({ reason: voidReason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || 'Failed to void line');
      }
      return res.json();
    },
    onSuccess: () => {
      setShowVoidModal(false);
      setSelectedLineForVoid(null);
      setVoidReason('');
      refetch();
    },
  });

  // Transfer Window Mutation
  const transferMutation = useMutation({
    mutationFn: async ({ lineId, targetWindow }: { lineId: string; targetWindow: number }) => {
      const res = await fetch(`/api/v1/folios/${folioId}/lines/${lineId}/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
        },
        body: JSON.stringify({ targetWindowNo: targetWindow }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || 'Failed to transfer line');
      }
      return res.json();
    },
    onSuccess: () => {
      refetch();
    },
  });

  if (!isOpen) return null;

  const currentLines = (folio?.lines || []).filter((l) => l.windowNo === activeWindow);
  const windowCharges = currentLines.filter((l) => l.lineType !== 'payment').reduce((sum, l) => sum + l.amount, 0);
  const windowPayments = currentLines.filter((l) => l.lineType === 'payment').reduce((sum, l) => sum + Math.abs(l.amount), 0);
  const windowBalance = windowCharges - windowPayments;

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)' }}>
      <div className="modal-dialog modal-dialog-centered modal-xl">
        <div className="modal-content shadow-lg border-0 rounded-3">
          {/* Header */}
          <div className="modal-header bg-white border-bottom px-4 py-3 d-flex justify-content-between align-items-center">
            <div>
              <div className="d-flex align-items-center gap-2">
                <h5 className="modal-title fw-bold text-dark mb-0">Folio Billing Workspace</h5>
                <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle">
                  {folio?.folioNo || 'Loading...'}
                </span>
                <span className={`badge ${folio?.status === 'settled' ? 'bg-success' : 'bg-primary'}`}>
                  {folio?.status === 'settled' ? 'Settled' : 'Open'}
                </span>
              </div>
              <small className="text-muted">
                {guestName ? `Guest: ${guestName}` : ''} {unitNumber ? `| Room ${unitNumber}` : ''} | Currency: {folio?.currency || 'USD'}
              </small>
            </div>

            <div className="d-flex align-items-center gap-3">
              {/* Overall Balance Widget */}
              <div className="text-end">
                <span className="text-muted small d-block">Overall Folio Balance</span>
                <strong className={`fs-5 ${folio && folio.balance > 0 ? 'text-danger' : 'text-success'}`}>
                  {folio?.currency} {folio?.balance?.toFixed(2) || '0.00'}
                </strong>
              </div>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>
          </div>

          {/* Window Tabs Bar */}
          <div className="bg-light px-4 pt-3 border-bottom d-flex justify-content-between align-items-center">
            <ul className="nav nav-tabs border-0">
              {[1, 2, 3, 4].map((wNo) => {
                const wLines = (folio?.lines || []).filter((l) => l.windowNo === wNo);
                const wBalance = wLines.reduce((sum, l) => sum + l.amount, 0);
                return (
                  <li key={wNo} className="nav-item">
                    <button
                      type="button"
                      className={`nav-link border-0 border-bottom border-3 fw-semibold px-3 py-2 ${
                        activeWindow === wNo
                          ? 'active border-primary text-primary bg-white shadow-sm'
                          : 'text-muted bg-transparent'
                      }`}
                      onClick={() => setActiveWindow(wNo)}
                    >
                      <i className="bi bi-window-sidebar me-1" />
                      Window {wNo}
                      {wLines.length > 0 && (
                        <span className="badge bg-light text-dark border ms-2 small">
                          {folio?.currency} {wBalance.toFixed(2)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="d-flex gap-2 pb-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary fw-semibold d-flex align-items-center gap-1"
                onClick={() => setShowPostModal(true)}
              >
                <i className="bi bi-plus-circle" /> Post Charge
              </button>
              <button
                type="button"
                className="btn btn-sm btn-success fw-semibold d-flex align-items-center gap-1"
                onClick={() => {
                  setPaymentAmount(Math.max(0, windowBalance));
                  setShowPaymentModal(true);
                }}
              >
                <i className="bi bi-credit-card" /> Record Payment
              </button>
            </div>
          </div>

          {/* Ledger Table Body */}
          <div className="modal-body p-0">
            {isLoading ? (
              <div className="text-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />
                Loading ledger transactions...
              </div>
            ) : currentLines.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <i className="bi bi-receipt fs-1 d-block text-secondary mb-2" />
                No charges or payments recorded on Window {activeWindow}. Click "Post Charge" to add transactions.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light text-uppercase small text-muted">
                    <tr>
                      <th className="ps-4">Date</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th className="text-center">Qty</th>
                      <th className="text-end">Unit Price</th>
                      <th className="text-end">Tax</th>
                      <th className="text-end">Total Amount</th>
                      <th className="text-center pe-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentLines.map((line) => {
                      const isVoid = line.amount < 0 && line.reversesLineId;
                      const isPayment = line.lineType === 'payment';

                      return (
                        <tr key={line.id} className={isVoid ? 'table-warning-subtle text-muted text-decoration-line-through' : ''}>
                          <td className="ps-4 small text-secondary">{line.businessDate}</td>
                          <td>
                            <span
                              className={`badge rounded-pill ${
                                isPayment
                                  ? 'bg-success-subtle text-success border border-success-subtle'
                                  : isVoid
                                  ? 'bg-danger-subtle text-danger border border-danger-subtle'
                                  : 'bg-primary-subtle text-primary border border-primary-subtle'
                              }`}
                            >
                              {line.chargeType.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <span className="fw-semibold text-dark">{line.description}</span>
                            {line.reversesLineId && (
                              <small className="d-block text-danger font-monospace" style={{ fontSize: '0.72rem' }}>
                                Ref Reversal: {line.reversesLineId.slice(0, 8)}...
                              </small>
                            )}
                          </td>
                          <td className="text-center">{line.qty}</td>
                          <td className="text-end">{line.unitAmount.toFixed(2)}</td>
                          <td className="text-end">{line.taxAmount > 0 ? line.taxAmount.toFixed(2) : '-'}</td>
                          <td className={`text-end fw-bold ${isPayment ? 'text-success' : line.amount < 0 ? 'text-danger' : 'text-dark'}`}>
                            {folio?.currency} {line.amount.toFixed(2)}
                          </td>
                          <td className="text-center pe-4">
                            {!isVoid && !isPayment && (
                              <div className="btn-group btn-group-sm">
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm"
                                  title="Void charge (append-only reversal)"
                                  onClick={() => {
                                    setSelectedLineForVoid(line);
                                    setShowVoidModal(true);
                                  }}
                                >
                                  Void
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary btn-sm dropdown-toggle dropdown-toggle-split"
                                  data-bs-toggle="dropdown"
                                  aria-expanded="false"
                                />
                                <ul className="dropdown-menu dropdown-menu-end shadow-sm">
                                  <li><h6 className="dropdown-header small">Transfer to Window</h6></li>
                                  {[1, 2, 3, 4].filter((w) => w !== activeWindow).map((targetW) => (
                                    <li key={targetW}>
                                      <button
                                        type="button"
                                        className="dropdown-item small"
                                        onClick={() => transferMutation.mutate({ lineId: line.id, targetWindow: targetW })}
                                      >
                                        Window {targetW}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Window Summary Footer */}
          <div className="modal-footer bg-light px-4 py-3 border-top d-flex justify-content-between align-items-center">
            <div className="d-flex gap-4">
              <div>
                <span className="text-muted small d-block">Window {activeWindow} Charges</span>
                <span className="fw-bold">{folio?.currency} {windowCharges.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted small d-block">Window {activeWindow} Payments</span>
                <span className="fw-bold text-success">{folio?.currency} {windowPayments.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted small d-block">Window {activeWindow} Net Balance</span>
                <span className={`fw-bold ${windowBalance > 0 ? 'text-danger' : 'text-success'}`}>
                  {folio?.currency} {windowBalance.toFixed(2)}
                </span>
              </div>
            </div>

            <button type="button" className="btn btn-secondary px-4 fw-semibold" onClick={onClose}>
              Close Workspace
            </button>
          </div>
        </div>
      </div>

      {/* --- Sub-modal: Post Charge --- */}
      {showPostModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow border-0 rounded-3">
              <div className="modal-header bg-light border-bottom px-4 py-3">
                <h6 className="modal-title fw-bold">Post Charge to Window {activeWindow}</h6>
                <button type="button" className="btn-close" onClick={() => setShowPostModal(false)} />
              </div>
              <div className="modal-body p-4">
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Charge Category</label>
                  <select
                    className="form-select"
                    value={postChargeType}
                    onChange={(e) => setPostChargeType(e.target.value)}
                  >
                    <option value="fnb">Food & Beverage (Restaurant / In-Room Dining)</option>
                    <option value="minibar">Minibar Consumption</option>
                    <option value="spa">Spa & Wellness</option>
                    <option value="laundry">Laundry & Valet Service</option>
                    <option value="misc">Miscellaneous Incidental</option>
                    <option value="room">Manual Room Charge</option>
                  </select>
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-semibold">Description</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Club Sandwich and Sparkling Water"
                    value={postDescription}
                    onChange={(e) => setPostDescription(e.target.value)}
                  />
                </div>

                <div className="row g-2 mb-3">
                  <div className="col-4">
                    <label className="form-label small fw-semibold">Quantity</label>
                    <input
                      type="number"
                      className="form-control"
                      min={1}
                      value={postQty}
                      onChange={(e) => setPostQty(Number(e.target.value))}
                    />
                  </div>
                  <div className="col-4">
                    <label className="form-label small fw-semibold">Unit Price</label>
                    <input
                      type="number"
                      className="form-control"
                      step="0.01"
                      min={0}
                      value={postUnitAmount}
                      onChange={(e) => setPostUnitAmount(Number(e.target.value))}
                    />
                  </div>
                  <div className="col-4">
                    <label className="form-label small fw-semibold">Tax Amount</label>
                    <input
                      type="number"
                      className="form-control"
                      step="0.01"
                      min={0}
                      value={postTaxAmount}
                      onChange={(e) => setPostTaxAmount(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="alert alert-light border small text-muted">
                  Total posting amount: <strong>{folio?.currency} {(postQty * postUnitAmount + postTaxAmount).toFixed(2)}</strong>
                </div>
              </div>
              <div className="modal-footer bg-light px-4 py-2 border-top">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowPostModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary px-3 fw-semibold"
                  disabled={postChargeMutation.isPending || !postDescription || postUnitAmount <= 0}
                  onClick={() => postChargeMutation.mutate()}
                >
                  {postChargeMutation.isPending ? 'Posting...' : 'Confirm Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Sub-modal: Record Payment --- */}
      {showPaymentModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow border-0 rounded-3">
              <div className="modal-header bg-light border-bottom px-4 py-3">
                <h6 className="modal-title fw-bold">Capture Payment (PCI DSS Tokenized)</h6>
                <button type="button" className="btn-close" onClick={() => setShowPaymentModal(false)} />
              </div>
              <div className="modal-body p-4">
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Payment Tender Method</label>
                  <select
                    className="form-select"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                  >
                    <option value="card">Credit Card (Simulated Token Gateway)</option>
                    <option value="cash">Cash Tender</option>
                    <option value="city_ledger">Direct Bill / City Ledger</option>
                  </select>
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-semibold">Amount ({folio?.currency})</label>
                  <input
                    type="number"
                    className="form-control form-control-lg fw-bold"
                    step="0.01"
                    min={0.01}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  />
                </div>

                {paymentMethod === 'card' && (
                  <div className="card bg-light border-0 p-3 mb-3">
                    <span className="small fw-semibold text-primary d-flex align-items-center gap-1 mb-2">
                      <i className="bi bi-shield-lock-fill" /> Zero Raw PAN Invariant (PCI DSS v4.0.1)
                    </span>
                    <div className="row g-2">
                      <div className="col-6">
                        <label className="form-label small text-muted">Card Brand</label>
                        <input type="text" className="form-control form-control-sm" value="Visa" readOnly />
                      </div>
                      <div className="col-6">
                        <label className="form-label small text-muted">Last 4 Digits</label>
                        <input
                          type="text"
                          className="form-control form-control-sm font-monospace"
                          maxLength={4}
                          value={cardLastFour}
                          onChange={(e) => setCardLastFour(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="mb-2">
                  <label className="form-label small fw-semibold">Reference / Receipt Note</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Front desk pos terminal #2"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer bg-light px-4 py-2 border-top">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowPaymentModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-success px-4 fw-semibold"
                  disabled={recordPaymentMutation.isPending || paymentAmount <= 0}
                  onClick={() => recordPaymentMutation.mutate()}
                >
                  {recordPaymentMutation.isPending ? 'Processing Tender...' : 'Authorize & Capture'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Sub-modal: Void Reason --- */}
      {showVoidModal && selectedLineForVoid && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow border-0 rounded-3">
              <div className="modal-header bg-danger text-white px-4 py-3">
                <h6 className="modal-title fw-bold">Void Line (Append-Only Reversal)</h6>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowVoidModal(false)} />
              </div>
              <div className="modal-body p-4">
                <p className="small text-muted mb-2">
                  You are reversing <strong>{selectedLineForVoid.description}</strong> for{' '}
                  <strong>{folio?.currency} {selectedLineForVoid.amount.toFixed(2)}</strong>.
                </p>
                <p className="small text-muted mb-3">
                  In compliance with accounting standards, this line will NOT be deleted. An equal and opposite reversal line will be posted to the audit ledger.
                </p>

                <label className="form-label small fw-semibold">Reason for Void</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Duplicate charge or incorrect room billing"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                />
              </div>
              <div className="modal-footer bg-light px-4 py-2 border-top">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowVoidModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger px-3 fw-semibold"
                  disabled={voidMutation.isPending || !voidReason.trim()}
                  onClick={() => voidMutation.mutate()}
                >
                  {voidMutation.isPending ? 'Reversing...' : 'Confirm Void'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
