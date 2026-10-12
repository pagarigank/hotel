import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import { VoucherEditorModal } from './VoucherEditorModal';

interface AccountItem {
  id: string;
  code: string;
  name: string;
  accountClass: string;
  accountGroup: string;
  normalBalance: 'debit' | 'credit';
  isControlAccount: boolean;
  controlType?: string | null;
  isActive: boolean;
}

interface VoucherLineItem {
  id: string;
  lineNo: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
}

interface VoucherItem {
  id: string;
  voucherNo: string | null;
  voucherType: string;
  status: string;
  postingDate: string;
  fiscalPeriodName?: string;
  description: string;
  sourceType: string;
  reversalOf?: string | null;
  reversedBy?: string | null;
  totalDebit: number;
  totalCredit: number;
  postedAt?: string | null;
  lines?: VoucherLineItem[];
}

interface TrialBalanceLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: string;
  normalBalance: 'debit' | 'credit';
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
}

interface TrialBalanceData {
  branchId: string;
  fiscalPeriodName: string;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  lines: TrialBalanceLine[];
}

interface GlEntryItem {
  id: string;
  voucherId: string;
  voucherNo: string;
  voucherType: string;
  postingDate: string;
  accountCode: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

interface GlReportData {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: string;
  normalBalance: 'debit' | 'credit';
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  entries: GlEntryItem[];
}

interface UsaliPnlData {
  branchId: string;
  period: { startDate?: string; endDate?: string };
  operatingRevenue: {
    rooms: number;
    foodAndBeverage: number;
    otherOperated: number;
    total: number;
  };
  departmentalExpenses: {
    rooms: number;
    foodAndBeverage: number;
    other: number;
    total: number;
  };
  totalDepartmentalIncome: number;
  undistributedExpenses: {
    administrativeAndGeneral: number;
    salesAndMarketing: number;
    propertyOperations: number;
    utilities: number;
    total: number;
  };
  grossOperatingProfit: number;
  nonOperatingIncomeExpense: {
    rent: number;
    propertyTax: number;
    insurance: number;
    other: number;
    total: number;
  };
  netOperatingIncome: number;
}

interface FiscalPeriodItem {
  id: string;
  periodNo: number;
  name: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'soft_closed' | 'closed';
  closedAt?: string | null;
}

export const AccountingView: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, businessDate } = useAppStore();

  const [activeTab, setActiveTab] = useState<
    'vouchers' | 'accounts' | 'trial-balance' | 'gl' | 'pnl' | 'periods'
  >('vouchers');

  // Modals & form state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [reversalModalVoucher, setReversalModalVoucher] = useState<VoucherItem | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  // Vouchers filter state
  const [voucherFilterStatus, setVoucherFilterStatus] = useState<string>('all');
  const [voucherFilterType, setVoucherFilterType] = useState<string>('all');

  // Trial balance state
  const [tbPeriodId, setTbPeriodId] = useState<string>('');

  // GL state
  const [glAccountId, setGlAccountId] = useState<string>('');

  // P&L state
  const [pnlStartDate, setPnlStartDate] = useState<string>('2026-01-01');
  const [pnlEndDate, setPnlEndDate] = useState<string>('2026-12-31');

  // New Account state
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccountCode, setNewAccountCode] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountClass, setNewAccountClass] = useState('asset');
  const [newAccountGroup, setNewAccountGroup] = useState('Current Assets');
  const [newAccountNormalBalance, setNewAccountNormalBalance] = useState<'debit' | 'credit'>('debit');

  // 1. Fetch Vouchers
  const { data: vouchers = [], isLoading: vouchersLoading } = useQuery<VoucherItem[]>({
    queryKey: ['accounting-vouchers', activeTenantId, activeBranchId, voucherFilterStatus, voucherFilterType],
    queryFn: async () => {
      let url = `/api/v1/accounting/vouchers?branchId=${activeBranchId}`;
      if (voucherFilterStatus !== 'all') url += `&status=${voucherFilterStatus}`;
      if (voucherFilterType !== 'all') url += `&voucherType=${voucherFilterType}`;

      const res = await fetch(url, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load vouchers');
      return res.json();
    },
  });

  // 2. Fetch Selected Voucher Detail (Lines)
  const { data: voucherDetail } = useQuery<VoucherItem>({
    queryKey: ['accounting-voucher-detail', activeTenantId, selectedVoucherId],
    queryFn: async () => {
      if (!selectedVoucherId) return null;
      const res = await fetch(`/api/v1/accounting/vouchers/${selectedVoucherId}`, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load voucher detail');
      return res.json();
    },
    enabled: !!selectedVoucherId,
  });

  // 3. Fetch Accounts
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<AccountItem[]>({
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
  });

  // Set default GL account when accounts load
  React.useEffect(() => {
    if (accounts.length > 0 && !glAccountId) {
      const defaultAcct = accounts.find((a) => a.code === '1110') || accounts[0];
      setGlAccountId(defaultAcct.id);
    }
  }, [accounts, glAccountId]);

  // 4. Fetch Fiscal Periods
  const { data: periods = [] } = useQuery<FiscalPeriodItem[]>({
    queryKey: ['accounting-periods', activeTenantId],
    queryFn: async () => {
      const res = await fetch('/api/v1/accounting/fiscal-periods', {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load periods');
      return res.json();
    },
  });

  // 5. Fetch Trial Balance
  const { data: trialBalance, isLoading: tbLoading } = useQuery<TrialBalanceData>({
    queryKey: ['accounting-trial-balance', activeTenantId, activeBranchId, tbPeriodId],
    queryFn: async () => {
      let url = `/api/v1/accounting/reports/trial-balance?branchId=${activeBranchId}`;
      if (tbPeriodId) url += `&fiscalPeriodId=${tbPeriodId}`;
      const res = await fetch(url, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load trial balance');
      return res.json();
    },
  });

  // 6. Fetch General Ledger
  const { data: glReport, isLoading: glLoading } = useQuery<GlReportData>({
    queryKey: ['accounting-gl', activeTenantId, glAccountId],
    queryFn: async () => {
      if (!glAccountId) return null;
      const res = await fetch(`/api/v1/accounting/reports/general-ledger/${glAccountId}`, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load general ledger');
      return res.json();
    },
    enabled: !!glAccountId,
  });

  // 7. Fetch USALI P&L
  const { data: pnlReport, isLoading: pnlLoading } = useQuery<UsaliPnlData>({
    queryKey: ['accounting-usali-pnl', activeTenantId, activeBranchId, pnlStartDate, pnlEndDate],
    queryFn: async () => {
      const url = `/api/v1/accounting/reports/usali-pnl?branchId=${activeBranchId}&startDate=${pnlStartDate}&endDate=${pnlEndDate}`;
      const res = await fetch(url, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to load USALI P&L');
      return res.json();
    },
  });

  // Reversal Mutation
  const reverseMutation = useMutation({
    mutationFn: async ({ voucherId, reason }: { voucherId: string; reason: string }) => {
      const res = await fetch(`/api/v1/accounting/vouchers/${voucherId}/reverse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to reverse voucher');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-vouchers'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-trial-balance'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-gl'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-usali-pnl'] });
      setReversalModalVoucher(null);
      setReversalReason('');
    },
  });

  // Post Draft Mutation
  const postDraftMutation = useMutation({
    mutationFn: async (voucherId: string) => {
      const res = await fetch(`/api/v1/accounting/vouchers/${voucherId}/post`, {
        method: 'POST',
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to post voucher');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-vouchers'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-trial-balance'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-gl'] });
    },
  });

  // Period Status Mutation
  const periodStatusMutation = useMutation({
    mutationFn: async ({ periodId, status }: { periodId: string; status: string }) => {
      const res = await fetch(`/api/v1/accounting/fiscal-periods/${periodId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update period');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
    },
  });

  // Add Account Mutation
  const createAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/accounting/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          code: newAccountCode,
          name: newAccountName,
          accountClass: newAccountClass,
          accountGroup: newAccountGroup,
          normalBalance: newAccountNormalBalance,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create account');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-accounts'] });
      setShowAddAccountModal(false);
      setNewAccountCode('');
      setNewAccountName('');
    },
  });

  return (
    <div className="p-4 max-w-7xl mx-auto d-flex flex-column gap-4">
      {/* Top Header Card */}
      <div className="bg-white p-4 rounded-4 shadow-sm border d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center"
            style={{ width: '48px', height: '48px' }}
          >
            <i className="bi bi-bank fs-4" />
          </div>
          <div>
            <h4 className="fw-bold mb-0 text-dark">Accounting & General Ledger</h4>
            <div className="text-muted small">
              USALI 12th Revised Edition Standard · Double-Entry Ledger · Gapless Vouchers
            </div>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-primary d-flex align-items-center gap-2 px-3 py-2 fw-semibold shadow-sm"
            onClick={() => setIsEditorOpen(true)}
          >
            <i className="bi bi-journal-plus fs-6" />
            <span>New Voucher</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="bg-white p-2 rounded-3 shadow-sm border">
        <ul className="nav nav-pills gap-1">
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-3 py-2 fw-semibold d-flex align-items-center gap-2 ${
                activeTab === 'vouchers' ? 'active' : 'text-secondary'
              }`}
              onClick={() => setActiveTab('vouchers')}
            >
              <i className="bi bi-journal-text" />
              <span>Vouchers Ledger</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-3 py-2 fw-semibold d-flex align-items-center gap-2 ${
                activeTab === 'accounts' ? 'active' : 'text-secondary'
              }`}
              onClick={() => setActiveTab('accounts')}
            >
              <i className="bi bi-diagram-3" />
              <span>Chart of Accounts</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-3 py-2 fw-semibold d-flex align-items-center gap-2 ${
                activeTab === 'trial-balance' ? 'active' : 'text-secondary'
              }`}
              onClick={() => setActiveTab('trial-balance')}
            >
              <i className="bi bi-scale" />
              <span>Trial Balance</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-3 py-2 fw-semibold d-flex align-items-center gap-2 ${
                activeTab === 'gl' ? 'active' : 'text-secondary'
              }`}
              onClick={() => setActiveTab('gl')}
            >
              <i className="bi bi-card-checklist" />
              <span>General Ledger</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-3 py-2 fw-semibold d-flex align-items-center gap-2 ${
                activeTab === 'pnl' ? 'active' : 'text-secondary'
              }`}
              onClick={() => setActiveTab('pnl')}
            >
              <i className="bi bi-graph-up-arrow" />
              <span>USALI Departmental P&L</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-3 py-2 fw-semibold d-flex align-items-center gap-2 ${
                activeTab === 'periods' ? 'active' : 'text-secondary'
              }`}
              onClick={() => setActiveTab('periods')}
            >
              <i className="bi bi-calendar-check" />
              <span>Fiscal Periods & Locks</span>
            </button>
          </li>
        </ul>
      </div>

      {/* ========================================================================= */}
      {/* SUB-VIEW 1: VOUCHERS LEDGER */}
      {/* ========================================================================= */}
      {activeTab === 'vouchers' && (
        <div className="d-flex flex-column gap-3">
          {/* Filters Bar */}
          <div className="bg-white p-3 rounded-3 shadow-sm border d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="text-muted small fw-bold text-uppercase">Filters:</span>
              <select
                className="form-select form-select-sm"
                style={{ width: '140px' }}
                value={voucherFilterStatus}
                onChange={(e) => setVoucherFilterStatus(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="posted">Posted</option>
                <option value="draft">Draft</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <select
                className="form-select form-select-sm"
                style={{ width: '140px' }}
                value={voucherFilterType}
                onChange={(e) => setVoucherFilterType(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="JV">JV - Journal</option>
                <option value="RV">RV - Receipt</option>
                <option value="PV">PV - Payment</option>
                <option value="CV">CV - Contra</option>
                <option value="SV">SV - Sales</option>
                <option value="PB">PB - Purchase</option>
              </select>
            </div>

            <div className="text-muted small">
              Found <strong>{vouchers.length}</strong> vouchers
            </div>
          </div>

          {/* Vouchers Table */}
          <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Voucher No</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Period</th>
                    <th className="text-end">Total Amount</th>
                    <th>Status</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchersLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-4 text-muted">
                        <span className="spinner-border spinner-border-sm me-2" />
                        Loading vouchers...
                      </td>
                    </tr>
                  ) : vouchers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-4 text-muted">
                        No vouchers found for this filter.
                      </td>
                    </tr>
                  ) : (
                    vouchers.map((v) => (
                      <React.Fragment key={v.id}>
                        <tr
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedVoucherId(selectedVoucherId === v.id ? null : v.id)}
                          className={selectedVoucherId === v.id ? 'table-primary-subtle' : ''}
                        >
                          <td className="fw-bold font-monospace">
                            {v.voucherNo ? (
                              <span className="text-primary">{v.voucherNo}</span>
                            ) : (
                              <span className="badge bg-secondary-subtle text-secondary">DRAFT</span>
                            )}
                            {v.reversalOf && (
                              <div className="small text-danger fw-normal" style={{ fontSize: '0.72rem' }}>
                                <i className="bi bi-arrow-counterclockwise" /> Reversal
                              </div>
                            )}
                            {v.reversedBy && (
                              <div className="small text-muted fw-normal" style={{ fontSize: '0.72rem' }}>
                                <i className="bi bi-slash-circle" /> Reversed
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="badge bg-info-subtle text-info border border-info-subtle">
                              {v.voucherType}
                            </span>
                          </td>
                          <td className="small">{v.postingDate}</td>
                          <td>
                            <div className="fw-semibold text-dark text-truncate" style={{ maxWidth: '320px' }}>
                              {v.description}
                            </div>
                            <span className="text-muted small" style={{ fontSize: '0.72rem' }}>
                              Source: {v.sourceType}
                            </span>
                          </td>
                          <td className="small text-muted">{v.fiscalPeriodName || '-'}</td>
                          <td className="text-end font-monospace fw-semibold">
                            ${v.totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td>
                            {v.status === 'posted' ? (
                              <span className="badge bg-success-subtle text-success border border-success-subtle">
                                Posted
                              </span>
                            ) : v.status === 'draft' ? (
                              <span className="badge bg-warning-subtle text-warning border border-warning-subtle">
                                Draft
                              </span>
                            ) : (
                              <span className="badge bg-secondary-subtle text-secondary">
                                {v.status}
                              </span>
                            )}
                          </td>
                          <td className="text-end" onClick={(e) => e.stopPropagation()}>
                            <div className="btn-group btn-group-sm">
                              {v.status === 'draft' && (
                                <button
                                  type="button"
                                  className="btn btn-outline-success btn-sm"
                                  title="Post Draft Voucher"
                                  onClick={() => postDraftMutation.mutate(v.id)}
                                  disabled={postDraftMutation.isPending}
                                >
                                  <i className="bi bi-send-check" /> Post
                                </button>
                              )}
                              {v.status === 'posted' && !v.reversedBy && (
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm"
                                  title="Reverse Voucher"
                                  onClick={() => {
                                    setReversalModalVoucher(v);
                                    setReversalReason(`Correction for ${v.voucherNo}`);
                                  }}
                                >
                                  <i className="bi bi-arrow-counterclockwise" /> Reverse
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => setSelectedVoucherId(selectedVoucherId === v.id ? null : v.id)}
                              >
                                <i className={`bi bi-chevron-${selectedVoucherId === v.id ? 'up' : 'down'}`} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Lines Drawer */}
                        {selectedVoucherId === v.id && voucherDetail && (
                          <tr>
                            <td colSpan={8} className="p-0 bg-light">
                              <div className="p-3 border-top border-bottom">
                                <div className="d-flex align-items-center justify-content-between mb-2">
                                  <h6 className="fw-bold mb-0 text-dark">
                                    Double-Entry Lines ({voucherDetail.voucherNo || 'Draft'})
                                  </h6>
                                  {voucherDetail.postedAt && (
                                    <span className="text-muted small">
                                      Posted at: {new Date(voucherDetail.postedAt).toLocaleString()}
                                    </span>
                                  )}
                                </div>
                                <div className="table-responsive bg-white rounded-3 border">
                                  <table className="table table-sm align-middle mb-0">
                                    <thead className="table-light">
                                      <tr>
                                        <th style={{ width: '40px' }} className="text-center">#</th>
                                        <th>Account</th>
                                        <th>Line Description</th>
                                        <th className="text-end" style={{ width: '130px' }}>Debit ($)</th>
                                        <th className="text-end" style={{ width: '130px' }}>Credit ($)</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {voucherDetail.lines?.map((line) => (
                                        <tr key={line.id}>
                                          <td className="text-center text-muted small">{line.lineNo}</td>
                                          <td>
                                            <span className="fw-bold text-dark font-monospace me-2">
                                              {line.accountCode}
                                            </span>
                                            <span>{line.accountName}</span>
                                          </td>
                                          <td className="text-muted small">{line.description}</td>
                                          <td className="text-end font-monospace">
                                            {line.debit > 0
                                              ? `$${line.debit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                              : '-'}
                                          </td>
                                          <td className="text-end font-monospace">
                                            {line.credit > 0
                                              ? `$${line.credit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                              : '-'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot className="table-light fw-bold font-monospace">
                                      <tr>
                                        <td colSpan={3} className="text-end">TOTALS:</td>
                                        <td className="text-end text-success">
                                          ${voucherDetail.totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="text-end text-success">
                                          ${voucherDetail.totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 2: CHART OF ACCOUNTS (USALI) */}
      {/* ========================================================================= */}
      {activeTab === 'accounts' && (
        <div className="d-flex flex-column gap-3">
          <div className="bg-white p-3 rounded-3 shadow-sm border d-flex justify-content-between align-items-center">
            <div className="text-muted small">
              USALI Standard Chart of Accounts (Assets, Liabilities, Equity, Revenue, COGS, Expenses)
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
              onClick={() => setShowAddAccountModal(true)}
            >
              <i className="bi bi-plus-circle" />
              <span>Add Account</span>
            </button>
          </div>

          <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: '120px' }}>Code</th>
                    <th>Account Name</th>
                    <th>Class</th>
                    <th>Group</th>
                    <th>Normal Balance</th>
                    <th>Control Account</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accountsLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-muted">Loading accounts...</td>
                    </tr>
                  ) : (
                    accounts.map((acct) => (
                      <tr key={acct.id}>
                        <td className="font-monospace fw-bold text-primary">{acct.code}</td>
                        <td className="fw-semibold text-dark">{acct.name}</td>
                        <td>
                          <span className="badge bg-secondary-subtle text-secondary text-uppercase" style={{ fontSize: '0.7rem' }}>
                            {acct.accountClass.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="small text-muted">{acct.accountGroup}</td>
                        <td>
                          <span className={`badge ${acct.normalBalance === 'debit' ? 'bg-primary-subtle text-primary' : 'bg-info-subtle text-info'}`}>
                            {acct.normalBalance.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {acct.isControlAccount ? (
                            <span className="badge bg-warning-subtle text-dark border border-warning-subtle">
                              <i className="bi bi-shield-lock me-1" />
                              {acct.controlType || 'Control'}
                            </span>
                          ) : (
                            <span className="text-muted small">-</span>
                          )}
                        </td>
                        <td>
                          <span className="badge bg-success-subtle text-success">Active</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 3: TRIAL BALANCE */}
      {/* ========================================================================= */}
      {activeTab === 'trial-balance' && (
        <div className="d-flex flex-column gap-3">
          {/* Equilibrium Card */}
          <div className="bg-white p-4 rounded-4 shadow-sm border d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div>
              <h5 className="fw-bold mb-1 text-dark">Trial Balance Verification</h5>
              <div className="text-muted small">
                Double-Entry Invariant: Total Debits must exactly equal Total Credits
              </div>
            </div>

            <div className="d-flex align-items-center gap-3">
              <select
                className="form-select form-select-sm"
                style={{ width: '220px' }}
                value={tbPeriodId}
                onChange={(e) => setTbPeriodId(e.target.value)}
              >
                <option value="">All Open Periods (Year-to-Date)</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.status})
                  </option>
                ))}
              </select>

              {trialBalance?.isBalanced ? (
                <div className="badge bg-success-subtle text-success border border-success-subtle p-3 rounded-3 d-flex align-items-center gap-2">
                  <i className="bi bi-check-circle-fill fs-5" />
                  <div>
                    <div className="fw-bold">Trial Balance In Equilibrium</div>
                    <div className="small text-muted" style={{ fontSize: '0.72rem' }}>
                      $\sum Debit = \sum Credit$ Verified
                    </div>
                  </div>
                </div>
              ) : (
                <div className="badge bg-danger-subtle text-danger border border-danger-subtle p-3 rounded-3 d-flex align-items-center gap-2">
                  <i className="bi bi-exclamation-triangle-fill fs-5" />
                  <div>
                    <div className="fw-bold">Out of Balance</div>
                    <div className="small">Ledger Discrepancy Detected</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Trial Balance Table */}
          <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: '120px' }}>Account Code</th>
                    <th>Account Name</th>
                    <th>Class</th>
                    <th>Normal Side</th>
                    <th className="text-end" style={{ width: '160px' }}>Total Debit ($)</th>
                    <th className="text-end" style={{ width: '160px' }}>Total Credit ($)</th>
                    <th className="text-end" style={{ width: '160px' }}>Net Balance ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {tbLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-muted">Calculating trial balance...</td>
                    </tr>
                  ) : !trialBalance || trialBalance.lines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-muted">No transactions in selected period.</td>
                    </tr>
                  ) : (
                    trialBalance.lines.map((l) => (
                      <tr key={l.accountId}>
                        <td className="font-monospace fw-bold text-primary">{l.accountCode}</td>
                        <td className="fw-semibold text-dark">{l.accountName}</td>
                        <td>
                          <span className="badge bg-secondary-subtle text-secondary text-uppercase" style={{ fontSize: '0.7rem' }}>
                            {l.accountClass.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${l.normalBalance === 'debit' ? 'bg-primary-subtle text-primary' : 'bg-info-subtle text-info'}`}>
                            {l.normalBalance.toUpperCase()}
                          </span>
                        </td>
                        <td className="text-end font-monospace">
                          {l.totalDebit > 0
                            ? `$${l.totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '-'}
                        </td>
                        <td className="text-end font-monospace">
                          {l.totalCredit > 0
                            ? `$${l.totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '-'}
                        </td>
                        <td className="text-end font-monospace fw-bold">
                          ${l.netBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {trialBalance && (
                  <tfoot className="table-light fw-bold font-monospace fs-6">
                    <tr>
                      <td colSpan={4} className="text-end">GRAND TOTALS:</td>
                      <td className="text-end text-primary">
                        ${trialBalance.totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="text-end text-primary">
                        ${trialBalance.totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="text-end text-success">
                        ${Math.abs(trialBalance.totalDebit - trialBalance.totalCredit).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 4: GENERAL LEDGER (ACTIVITY & AUDIT) */}
      {/* ========================================================================= */}
      {activeTab === 'gl' && (
        <div className="d-flex flex-column gap-3">
          <div className="bg-white p-3 rounded-3 shadow-sm border d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div className="d-flex align-items-center gap-2">
              <span className="text-muted small fw-bold">Select Account:</span>
              <select
                className="form-select form-select-sm"
                style={{ width: '320px' }}
                value={glAccountId}
                onChange={(e) => setGlAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name} ({a.accountClass})
                  </option>
                ))}
              </select>
            </div>

            {glReport && (
              <div className="d-flex align-items-center gap-4">
                <div>
                  <span className="text-muted small d-block">TOTAL DEBIT</span>
                  <span className="font-monospace fw-bold text-dark">
                    ${glReport.totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-muted small d-block">TOTAL CREDIT</span>
                  <span className="font-monospace fw-bold text-dark">
                    ${glReport.totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-muted small d-block">CLOSING BALANCE</span>
                  <span className="font-monospace fw-bold text-primary fs-6">
                    ${glReport.closingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Date</th>
                    <th>Voucher No</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th className="text-end" style={{ width: '140px' }}>Debit ($)</th>
                    <th className="text-end" style={{ width: '140px' }}>Credit ($)</th>
                    <th className="text-end" style={{ width: '160px' }}>Running Balance ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {glLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-muted">Loading ledger entries...</td>
                    </tr>
                  ) : !glReport || glReport.entries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-muted">No transactions for this account.</td>
                    </tr>
                  ) : (
                    glReport.entries.map((e) => (
                      <tr key={e.id}>
                        <td className="small">{e.postingDate}</td>
                        <td className="font-monospace fw-bold text-primary">{e.voucherNo}</td>
                        <td>
                          <span className="badge bg-info-subtle text-info">{e.voucherType}</span>
                        </td>
                        <td className="fw-semibold text-dark">{e.description}</td>
                        <td className="text-end font-monospace">
                          {e.debit > 0
                            ? `$${e.debit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '-'}
                        </td>
                        <td className="text-end font-monospace">
                          {e.credit > 0
                            ? `$${e.credit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '-'}
                        </td>
                        <td className="text-end font-monospace fw-bold">
                          ${e.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 5: USALI DEPARTMENTAL P&L */}
      {/* ========================================================================= */}
      {activeTab === 'pnl' && (
        <div className="d-flex flex-column gap-3">
          {/* Date range filter */}
          <div className="bg-white p-3 rounded-3 shadow-sm border d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div className="d-flex align-items-center gap-3">
              <span className="text-muted small fw-bold">Reporting Period:</span>
              <input
                type="date"
                className="form-control form-control-sm"
                value={pnlStartDate}
                onChange={(e) => setPnlStartDate(e.target.value)}
              />
              <span className="text-muted">to</span>
              <input
                type="date"
                className="form-control form-control-sm"
                value={pnlEndDate}
                onChange={(e) => setPnlEndDate(e.target.value)}
              />
            </div>
            <div className="text-muted small">
              USALI 12th Revised Edition Format
            </div>
          </div>

          {pnlLoading ? (
            <div className="text-center py-5 text-muted">Calculating USALI P&L statement...</div>
          ) : pnlReport ? (
            <div className="card border-0 shadow-sm rounded-4 overflow-hidden p-4 bg-white">
              <div className="d-flex flex-column gap-4">
                {/* 1. Operating Revenue */}
                <div>
                  <h6 className="fw-bold text-uppercase text-primary border-bottom pb-2">
                    1. Operating Revenue
                  </h6>
                  <div className="d-flex justify-content-between py-1 border-bottom">
                    <span>Rooms Department</span>
                    <span className="font-monospace fw-semibold">
                      ${pnlReport.operatingRevenue.rooms.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between py-1 border-bottom">
                    <span>Food & Beverage</span>
                    <span className="font-monospace fw-semibold">
                      ${pnlReport.operatingRevenue.foodAndBeverage.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between py-1 border-bottom">
                    <span>Other Operated Departments</span>
                    <span className="font-monospace fw-semibold">
                      ${pnlReport.operatingRevenue.otherOperated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between py-2 bg-light px-2 rounded fw-bold">
                    <span>Total Operating Revenue</span>
                    <span className="font-monospace text-primary fs-6">
                      ${pnlReport.operatingRevenue.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* 2. Departmental Expenses */}
                <div>
                  <h6 className="fw-bold text-uppercase text-secondary border-bottom pb-2">
                    2. Departmental Expenses
                  </h6>
                  <div className="d-flex justify-content-between py-1 border-bottom">
                    <span>Rooms Department Expenses</span>
                    <span className="font-monospace fw-semibold">
                      ${pnlReport.departmentalExpenses.rooms.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between py-1 border-bottom">
                    <span>Food & Beverage Cost of Sales & Expenses</span>
                    <span className="font-monospace fw-semibold">
                      ${pnlReport.departmentalExpenses.foodAndBeverage.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between py-2 bg-light px-2 rounded fw-bold">
                    <span>Total Departmental Income</span>
                    <span className="font-monospace text-dark fs-6">
                      ${pnlReport.totalDepartmentalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* 3. Undistributed Operating Expenses */}
                <div>
                  <h6 className="fw-bold text-uppercase text-secondary border-bottom pb-2">
                    3. Undistributed Operating Expenses
                  </h6>
                  <div className="d-flex justify-content-between py-1 border-bottom">
                    <span>Administrative and General</span>
                    <span className="font-monospace fw-semibold">
                      ${pnlReport.undistributedExpenses.administrativeAndGeneral.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between py-1 border-bottom">
                    <span>Sales and Marketing</span>
                    <span className="font-monospace fw-semibold">
                      ${pnlReport.undistributedExpenses.salesAndMarketing.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between py-1 border-bottom">
                    <span>Property Operations and Maintenance</span>
                    <span className="font-monospace fw-semibold">
                      ${pnlReport.undistributedExpenses.propertyOperations.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between py-1 border-bottom">
                    <span>Utilities</span>
                    <span className="font-monospace fw-semibold">
                      ${pnlReport.undistributedExpenses.utilities.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Key Hotel Metric: Gross Operating Profit */}
                <div className="p-3 bg-primary-subtle rounded-3 border border-primary-subtle d-flex justify-content-between align-items-center">
                  <div>
                    <h5 className="fw-bold text-primary mb-0">GROSS OPERATING PROFIT (GOP)</h5>
                    <span className="text-muted small">Standard USALI Benchmark for Hotel Operating Performance</span>
                  </div>
                  <span className="font-monospace fw-bold fs-4 text-primary">
                    ${pnlReport.grossOperatingProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Bottom line: Net Operating Income */}
                <div className="p-3 bg-success-subtle rounded-3 border border-success-subtle d-flex justify-content-between align-items-center">
                  <div>
                    <h5 className="fw-bold text-success mb-0">NET OPERATING INCOME (EBITDA)</h5>
                    <span className="text-muted small">Operating Profit after Non-Operating Rent, Property Taxes & Insurance</span>
                  </div>
                  <span className="font-monospace fw-bold fs-4 text-success">
                    ${pnlReport.netOperatingIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 6: FISCAL PERIODS & LOCKS */}
      {/* ========================================================================= */}
      {activeTab === 'periods' && (
        <div className="d-flex flex-column gap-3">
          <div className="p-3 bg-white rounded-3 shadow-sm border d-flex align-items-center gap-3">
            <div
              className="rounded-circle bg-warning-subtle text-warning d-flex align-items-center justify-content-center"
              style={{ width: '40px', height: '40px' }}
            >
              <i className="bi bi-lock-fill fs-5" />
            </div>
            <div>
              <h6 className="fw-bold mb-0 text-dark">Database-Level Fiscal Period Locking</h6>
              <span className="text-muted small">
                PostgreSQL trigger <code>app.assert_period_open_for_posting</code> enforces immutability. Posting into closed periods is strictly rejected at the database level.
              </span>
            </div>
          </div>

          <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Period #</th>
                    <th>Name</th>
                    <th>Date Range</th>
                    <th>Status</th>
                    <th>Closed Timestamp</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.id}>
                      <td className="fw-bold font-monospace">Period {p.periodNo}</td>
                      <td className="fw-semibold text-dark">{p.name}</td>
                      <td className="small text-muted">{p.startDate} to {p.endDate}</td>
                      <td>
                        {p.status === 'open' ? (
                          <span className="badge bg-success-subtle text-success border border-success-subtle">
                            Open
                          </span>
                        ) : p.status === 'soft_closed' ? (
                          <span className="badge bg-warning-subtle text-warning border border-warning-subtle">
                            Soft Closed
                          </span>
                        ) : (
                          <span className="badge bg-danger-subtle text-danger border border-danger-subtle">
                            Closed
                          </span>
                        )}
                      </td>
                      <td className="small text-muted">
                        {p.closedAt ? new Date(p.closedAt).toLocaleString() : '-'}
                      </td>
                      <td className="text-end">
                        <div className="btn-group btn-group-sm">
                          {p.status === 'open' ? (
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => periodStatusMutation.mutate({ periodId: p.id, status: 'closed' })}
                              disabled={periodStatusMutation.isPending}
                            >
                              <i className="bi bi-lock" /> Close Period
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-outline-success btn-sm"
                              onClick={() => periodStatusMutation.mutate({ periodId: p.id, status: 'open' })}
                              disabled={periodStatusMutation.isPending}
                            >
                              <i className="bi bi-unlock" /> Reopen Period
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Voucher Editor Modal */}
      <VoucherEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
      />

      {/* Reversal Confirmation Modal */}
      {reversalModalVoucher && (
        <div
          className="modal-backdrop-custom d-flex align-items-center justify-content-center p-3"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            zIndex: 1060,
          }}
        >
          <div className="card border-0 shadow-lg rounded-4 overflow-hidden" style={{ width: '100%', maxWidth: '500px' }}>
            <div className="card-header bg-white border-bottom p-3">
              <h5 className="mb-0 fw-bold text-dark">Reverse Voucher</h5>
              <div className="text-muted small">Creates opposing journal entry linking audit references</div>
            </div>
            <div className="card-body p-4">
              <div className="alert alert-warning py-2 small mb-3">
                Reversing voucher <strong>{reversalModalVoucher.voucherNo}</strong> will generate a balanced contra-voucher with debits and credits inverted.
              </div>
              <label className="form-label small fw-bold text-secondary mb-1">Reason for Reversal</label>
              <input
                type="text"
                className="form-control form-control-sm mb-3"
                placeholder="e.g. Erroneous folio posting"
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
              />
            </div>
            <div className="card-footer bg-light border-top p-3 d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setReversalModalVoucher(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger fw-semibold"
                disabled={reverseMutation.isPending || !reversalReason.trim()}
                onClick={() =>
                  reverseMutation.mutate({
                    voucherId: reversalModalVoucher.id,
                    reason: reversalReason,
                  })
                }
              >
                {reverseMutation.isPending ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddAccountModal && (
        <div
          className="modal-backdrop-custom d-flex align-items-center justify-content-center p-3"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            zIndex: 1060,
          }}
        >
          <div className="card border-0 shadow-lg rounded-4 overflow-hidden" style={{ width: '100%', maxWidth: '550px' }}>
            <div className="card-header bg-white border-bottom p-3">
              <h5 className="mb-0 fw-bold text-dark">Add Chart of Accounts Item</h5>
              <div className="text-muted small">Standard USALI 12th Revised Edition</div>
            </div>
            <div className="card-body p-4 d-flex flex-column gap-3">
              <div>
                <label className="form-label small fw-bold text-secondary mb-1">Account Code</label>
                <input
                  type="text"
                  className="form-control form-control-sm font-monospace"
                  placeholder="e.g. 1030"
                  value={newAccountCode}
                  onChange={(e) => setNewAccountCode(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label small fw-bold text-secondary mb-1">Account Name</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="e.g. Cash in Transit - Armored"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                />
              </div>

              <div className="row g-2">
                <div className="col-md-6">
                  <label className="form-label small fw-bold text-secondary mb-1">Account Class</label>
                  <select
                    className="form-select form-select-sm"
                    value={newAccountClass}
                    onChange={(e) => setNewAccountClass(e.target.value)}
                  >
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                    <option value="equity">Equity</option>
                    <option value="revenue">Revenue</option>
                    <option value="cost_of_sales">Cost of Sales</option>
                    <option value="operating_expense">Operating Expense</option>
                    <option value="undistributed_expense">Undistributed Expense</option>
                    <option value="non_operating_expense">Non-Operating Expense</option>
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label small fw-bold text-secondary mb-1">Normal Side</label>
                  <select
                    className="form-select form-select-sm"
                    value={newAccountNormalBalance}
                    onChange={(e) => setNewAccountNormalBalance(e.target.value as any)}
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label small fw-bold text-secondary mb-1">Account Group</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="e.g. Current Assets"
                  value={newAccountGroup}
                  onChange={(e) => setNewAccountGroup(e.target.value)}
                />
              </div>
            </div>
            <div className="card-footer bg-light border-top p-3 d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setShowAddAccountModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary fw-semibold"
                disabled={createAccountMutation.isPending || !newAccountCode.trim() || !newAccountName.trim()}
                onClick={() => createAccountMutation.mutate()}
              >
                {createAccountMutation.isPending ? 'Saving...' : 'Save Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
