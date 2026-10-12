import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';

interface AccountOption {
  id: string;
  code: string;
  name: string;
  accountClass: string;
  normalBalance: 'debit' | 'credit';
}

interface EditableLine {
  id: string;
  accountId: string;
  description: string;
  debit: string;
  credit: string;
}

interface VoucherEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const VoucherEditorModal: React.FC<VoucherEditorModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, businessDate } = useAppStore();

  const [voucherType, setVoucherType] = useState<string>('JV');
  const [postingDate, setPostingDate] = useState<string>(businessDate || new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [lines, setLines] = useState<EditableLine[]>([
    { id: crypto.randomUUID(), accountId: '', description: '', debit: '', credit: '' },
    { id: crypto.randomUUID(), accountId: '', description: '', debit: '', credit: '' },
  ]);

  useEffect(() => {
    if (isOpen) {
      setPostingDate(businessDate || new Date().toISOString().slice(0, 10));
      setDescription('');
      setErrorMsg(null);
      setLines([
        { id: crypto.randomUUID(), accountId: '', description: '', debit: '', credit: '' },
        { id: crypto.randomUUID(), accountId: '', description: '', debit: '', credit: '' },
      ]);
    }
  }, [isOpen, businessDate]);

  // Load Chart of Accounts for selector
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<AccountOption[]>({
    queryKey: ['accounting-accounts', activeTenantId],
    queryFn: async () => {
      const res = await fetch('/api/v1/accounting/accounts', {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load accounts');
      return res.json();
    },
    enabled: isOpen,
  });

  // Calculate totals
  const totalDebit = lines.reduce((acc, l) => acc + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (parseFloat(l.credit) || 0), 0);
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100;
  const isBalanced = Math.abs(difference) < 0.0001 && totalDebit > 0;

  const handleUpdateLine = (index: number, field: keyof EditableLine, value: string) => {
    setLines((prev) => {
      const updated = [...prev];
      const current = { ...updated[index] };

      if (field === 'debit') {
        current.debit = value;
        if (parseFloat(value) > 0) current.credit = '0';
      } else if (field === 'credit') {
        current.credit = value;
        if (parseFloat(value) > 0) current.debit = '0';
      } else {
        (current as any)[field] = value;
      }

      updated[index] = current;
      return updated;
    });
  };

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), accountId: '', description: '', debit: '', credit: '' },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAutoBalance = (index: number, side: 'debit' | 'credit') => {
    const currentLineDebit = parseFloat(lines[index].debit) || 0;
    const currentLineCredit = parseFloat(lines[index].credit) || 0;

    const otherDebit = totalDebit - currentLineDebit;
    const otherCredit = totalCredit - currentLineCredit;

    if (side === 'debit') {
      const needed = Math.max(0, otherCredit - otherDebit);
      handleUpdateLine(index, 'debit', needed.toFixed(2));
    } else {
      const needed = Math.max(0, otherDebit - otherCredit);
      handleUpdateLine(index, 'credit', needed.toFixed(2));
    }
  };

  const createMutation = useMutation({
    mutationFn: async ({ autoPost }: { autoPost: boolean }) => {
      setErrorMsg(null);
      if (!description.trim()) {
        throw new Error('Please enter a voucher description.');
      }
      if (lines.some((l) => !l.accountId)) {
        throw new Error('Every line must have an account selected.');
      }

      const formattedLines = lines.map((l) => ({
        accountId: l.accountId,
        description: l.description || description,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
      }));

      const res = await fetch('/api/v1/accounting/vouchers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          branchId: activeBranchId,
          voucherType,
          postingDate,
          description,
          autoPost,
          lines: formattedLines,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to save voucher');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-vouchers'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-trial-balance'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-gl'] });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message);
    },
  });

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop-custom d-flex align-items-center justify-content-center p-3"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 1060,
      }}
    >
      <div
        className="card border-0 shadow-lg rounded-4 overflow-hidden d-flex flex-column"
        style={{ width: '100%', maxWidth: '1100px', maxHeight: '90vh' }}
      >
        {/* Modal Header */}
        <div className="card-header bg-white border-bottom p-3 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <div
              className="rounded-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center"
              style={{ width: '38px', height: '38px' }}
            >
              <i className="bi bi-journal-plus fs-5" />
            </div>
            <div>
              <h5 className="mb-0 fw-bold text-dark">Create Accounting Voucher</h5>
              <div className="text-muted small">Standard Double-Entry Journal Document</div>
            </div>
          </div>
          <button
            type="button"
            className="btn-close"
            aria-label="Close"
            onClick={onClose}
            disabled={createMutation.isPending}
          />
        </div>

        {/* Modal Body */}
        <div className="card-body p-4 overflow-auto flex-grow-1">
          {errorMsg && (
            <div className="alert alert-danger d-flex align-items-center gap-2 mb-3 py-2 px-3 rounded-3" role="alert">
              <i className="bi bi-exclamation-triangle-fill fs-5" />
              <div>{errorMsg}</div>
            </div>
          )}

          {/* Header Controls */}
          <div className="row g-3 mb-4">
            <div className="col-md-3">
              <label className="form-label small fw-bold text-secondary mb-1">Voucher Type</label>
              <select
                className="form-select form-select-sm"
                value={voucherType}
                onChange={(e) => setVoucherType(e.target.value)}
              >
                <option value="JV">JV - Journal Voucher</option>
                <option value="RV">RV - Receipt Voucher</option>
                <option value="PV">PV - Payment Voucher</option>
                <option value="CV">CV - Contra Voucher</option>
                <option value="SV">SV - Sales Voucher</option>
                <option value="PB">PB - Purchase Bill</option>
                <option value="DN">DN - Debit Note</option>
                <option value="CN">CN - Credit Note</option>
              </select>
            </div>

            <div className="col-md-3">
              <label className="form-label small fw-bold text-secondary mb-1">Posting Date</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={postingDate}
                onChange={(e) => setPostingDate(e.target.value)}
              />
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-secondary mb-1">Narration / Description</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="e.g. Month-end laundry inventory adjustment"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Grid of Double-Entry Lines */}
          <div className="table-responsive border rounded-3 mb-3 bg-white">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: '40px' }} className="text-center">#</th>
                  <th style={{ width: '35%' }}>Account (USALI)</th>
                  <th>Line Description</th>
                  <th style={{ width: '140px' }} className="text-end">Debit ($)</th>
                  <th style={{ width: '140px' }} className="text-end">Credit ($)</th>
                  <th style={{ width: '50px' }} className="text-center"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={line.id}>
                    <td className="text-center text-muted fw-semibold small">{idx + 1}</td>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={line.accountId}
                        onChange={(e) => handleUpdateLine(idx, 'accountId', e.target.value)}
                      >
                        <option value="">-- Select GL Account --</option>
                        {accounts.map((acct) => (
                          <option key={acct.id} value={acct.id}>
                            {acct.code} - {acct.name} ({acct.accountClass})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder={description || 'Line memo'}
                        value={line.description}
                        onChange={(e) => handleUpdateLine(idx, 'description', e.target.value)}
                      />
                    </td>
                    <td>
                      <div className="input-group input-group-sm">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-control text-end font-monospace"
                          placeholder="0.00"
                          value={line.debit}
                          onChange={(e) => handleUpdateLine(idx, 'debit', e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          title="Balance remaining"
                          onClick={() => handleAutoBalance(idx, 'debit')}
                        >
                          <i className="bi bi-magic" />
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="input-group input-group-sm">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-control text-end font-monospace"
                          placeholder="0.00"
                          value={line.credit}
                          onChange={(e) => handleUpdateLine(idx, 'credit', e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          title="Balance remaining"
                          onClick={() => handleAutoBalance(idx, 'credit')}
                        >
                          <i className="bi bi-magic" />
                        </button>
                      </div>
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="btn btn-link text-danger p-0 border-0"
                        title="Delete line"
                        disabled={lines.length <= 2}
                        onClick={() => handleRemoveLine(idx)}
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="d-flex justify-content-between align-items-center mb-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
              onClick={handleAddLine}
            >
              <i className="bi bi-plus-circle" />
              <span>Add Line</span>
            </button>
            <div className="text-muted small">
              Press magic wand <i className="bi bi-magic" /> to auto-fill the balancing offset amount.
            </div>
          </div>
        </div>

        {/* Modal Footer & Live Balance Bar */}
        <div className="card-footer bg-light border-top p-3 d-flex flex-wrap justify-content-between align-items-center gap-3">
          {/* Live Balance Bar */}
          <div className="d-flex align-items-center gap-4">
            <div className="d-flex flex-column">
              <span className="text-muted small" style={{ fontSize: '0.75rem' }}>TOTAL DEBIT</span>
              <span className="fw-bold font-monospace text-dark fs-6">
                ${totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="d-flex flex-column">
              <span className="text-muted small" style={{ fontSize: '0.75rem' }}>TOTAL CREDIT</span>
              <span className="fw-bold font-monospace text-dark fs-6">
                ${totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Equilibrium Indicator */}
            {isBalanced ? (
              <div className="badge bg-success-subtle text-success border border-success-subtle px-3 py-2 rounded-3 d-flex align-items-center gap-2">
                <i className="bi bi-check-circle-fill fs-6" />
                <span className="fw-semibold">Balanced ($0.00 difference)</span>
              </div>
            ) : (
              <div className="badge bg-danger-subtle text-danger border border-danger-subtle px-3 py-2 rounded-3 d-flex align-items-center gap-2">
                <i className="bi bi-exclamation-triangle-fill fs-6" />
                <span className="fw-semibold">
                  Out of Balance: ${Math.abs(difference).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary px-3"
              onClick={onClose}
              disabled={createMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary px-3"
              disabled={createMutation.isPending || totalDebit <= 0}
              onClick={() => createMutation.mutate({ autoPost: false })}
            >
              Save as Draft
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary px-4 fw-semibold d-flex align-items-center gap-2"
              disabled={createMutation.isPending || !isBalanced}
              onClick={() => createMutation.mutate({ autoPost: true })}
            >
              {createMutation.isPending && (
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              )}
              <i className="bi bi-send-check" />
              <span>Post Voucher</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
