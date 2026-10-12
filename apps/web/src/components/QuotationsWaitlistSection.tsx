import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type { QuotationDto, WaitlistDto, CreateQuotationDto, CreateWaitlistDto } from '@innkeeper/contracts';

export const QuotationsWaitlistSection: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, businessDate } = useAppStore();

  const [subTab, setSubTab] = useState<'quotations' | 'waitlists'>('quotations');
  const [isNewQuoteModalOpen, setIsNewQuoteModalOpen] = useState(false);
  const [isNewWaitlistModalOpen, setIsNewWaitlistModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  // New Quotation State
  const today = businessDate || new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const nextWeekEnd = new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0];

  const [qGuestName, setQGuestName] = useState('');
  const [qGuestEmail, setQGuestEmail] = useState('');
  const [qGuestPhone, setQGuestPhone] = useState('');
  const [qCheckIn, setQCheckIn] = useState(nextWeek);
  const [qCheckOut, setQCheckOut] = useState(nextWeekEnd);
  const [qAdults, setQAdults] = useState(2);

  // New Waitlist State
  const [wGuestName, setWGuestName] = useState('');
  const [wGuestEmail, setWGuestEmail] = useState('');
  const [wGuestPhone, setWGuestPhone] = useState('');
  const [wDesiredCheckIn, setWDesiredCheckIn] = useState(nextWeek);
  const [wDesiredCheckOut, setWDesiredCheckOut] = useState(nextWeekEnd);
  const [wPriority, setWPriority] = useState(1);

  // 1. Fetch Quotations
  const { data: quotations = [], isLoading: isQuotesLoading } = useQuery<QuotationDto[]>({
    queryKey: ['quotations', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/quotations?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: subTab === 'quotations',
  });

  // 2. Fetch Waitlists
  const { data: waitlists = [], isLoading: isWaitlistsLoading } = useQuery<WaitlistDto[]>({
    queryKey: ['waitlists', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/waitlists?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: subTab === 'waitlists',
  });

  // 3. Create Quotation Mutation
  const createQuoteMutation = useMutation({
    mutationFn: async (dto: CreateQuotationDto) => {
      const res = await fetch('/api/v1/quotations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify(dto),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.title || 'Quotation creation failed');
      }
      return res.json();
    },
    onSuccess: (data: QuotationDto) => {
      setFeedback({ message: `Quotation ${data.quotationNo} created with total $${data.totalAmount.toFixed(2)}!`, type: 'success' });
      setIsNewQuoteModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      setTimeout(() => setFeedback(null), 5000);
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  // 4. Convert Quotation Mutation
  const convertQuoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/quotations/${id}/convert`, {
        method: 'POST',
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.title || 'Quotation conversion failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setFeedback({
        message: `Quotation converted to Confirmed Booking ${data.reservation.reservationNo}!`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      setTimeout(() => setFeedback(null), 5000);
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  // 5. Create Waitlist Mutation
  const createWaitlistMutation = useMutation({
    mutationFn: async (dto: CreateWaitlistDto) => {
      const res = await fetch('/api/v1/waitlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify(dto),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.title || 'Waitlist entry failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({ message: 'Guest added to waitlist queue!', type: 'success' });
      setIsNewWaitlistModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['waitlists'] });
      setTimeout(() => setFeedback(null), 5000);
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  // 6. Convert Waitlist Mutation
  const convertWaitlistMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/waitlists/${id}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({ ratePlanId: '35000000-0000-0000-0000-000000000001' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.title || 'Waitlist conversion failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setFeedback({
        message: `Waitlist entry converted to Booking ${data.reservation.reservationNo}!`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['waitlists'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      setTimeout(() => setFeedback(null), 5000);
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  return (
    <div className="card shadow-sm border-0 rounded-3 overflow-hidden bg-white">
      {/* Header */}
      <div className="card-header bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center">
        <div>
          <div className="d-flex align-items-center gap-2">
            <h6 className="fw-bold mb-0 text-dark">Non-Binding Quotations & Waitlist Engine</h6>
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
              REQ-RSV-010
            </span>
          </div>
          <span className="text-muted small">
            Real-time price quotes, guest demand queuing, and 1-click conversion to confirmed booking
          </span>
        </div>

        <div className="d-flex align-items-center gap-2">
          {subTab === 'quotations' ? (
            <button
              type="button"
              className="btn btn-sm btn-primary fw-semibold d-flex align-items-center gap-2 shadow-sm"
              onClick={() => setIsNewQuoteModalOpen(true)}
            >
              <i className="bi bi-file-earmark-text-fill" />
              <span>New Quotation</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-primary fw-semibold d-flex align-items-center gap-2 shadow-sm"
              onClick={() => setIsNewWaitlistModalOpen(true)}
            >
              <i className="bi bi-hourglass-split" />
              <span>Add to Waitlist</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} py-2 px-4 mb-0 rounded-0 border-0 border-bottom small d-flex justify-content-between align-items-center`}>
          <span>{feedback.message}</span>
          <button type="button" className="btn-close" onClick={() => setFeedback(null)} />
        </div>
      )}

      {/* Sub Tabs */}
      <div className="px-4 py-2 bg-light border-bottom d-flex align-items-center gap-2">
        <button
          type="button"
          className={`btn btn-sm ${subTab === 'quotations' ? 'btn-white border shadow-sm fw-bold text-primary' : 'btn-light text-muted'}`}
          onClick={() => setSubTab('quotations')}
        >
          <i className="bi bi-file-earmark-text me-1" />
          <span>Quotations ({quotations.length})</span>
        </button>
        <button
          type="button"
          className={`btn btn-sm ${subTab === 'waitlists' ? 'btn-white border shadow-sm fw-bold text-primary' : 'btn-light text-muted'}`}
          onClick={() => setSubTab('waitlists')}
        >
          <i className="bi bi-hourglass me-1" />
          <span>Waitlist Queue ({waitlists.length})</span>
        </button>
      </div>

      {/* Body Content */}
      <div className="card-body p-0">
        {subTab === 'quotations' ? (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th className="px-4 py-3 small text-muted text-uppercase">Quote #</th>
                  <th className="py-3 small text-muted text-uppercase">Guest Name</th>
                  <th className="py-3 small text-muted text-uppercase">Dates</th>
                  <th className="py-3 small text-muted text-uppercase">Quoted Total</th>
                  <th className="py-3 small text-muted text-uppercase">Valid Until</th>
                  <th className="py-3 small text-muted text-uppercase">Status</th>
                  <th className="px-4 py-3 small text-muted text-uppercase text-end">1-Click Convert</th>
                </tr>
              </thead>
              <tbody>
                {isQuotesLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-4 text-muted small">Loading quotations...</td>
                  </tr>
                ) : quotations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-5 text-muted small">
                      <i className="bi bi-file-earmark-x fs-2 text-muted d-block mb-2" />
                      No quotations recorded. Click "New Quotation" to generate one.
                    </td>
                  </tr>
                ) : (
                  quotations.map((q) => (
                    <tr key={q.id}>
                      <td className="px-4 fw-bold font-monospace text-primary">{q.quotationNo}</td>
                      <td>
                        <span className="fw-semibold text-dark d-block">{q.guestName}</span>
                        <span className="small text-muted">{q.guestEmail || q.guestPhone || '—'}</span>
                      </td>
                      <td className="small text-muted">{q.checkIn} → {q.checkOut}</td>
                      <td className="fw-bold text-dark">${q.totalAmount.toFixed(2)}</td>
                      <td className="small text-muted">{q.validUntil.slice(0, 10)}</td>
                      <td>
                        <span className={`badge ${q.status === 'active' ? 'bg-success-subtle text-success' : q.status === 'converted' ? 'bg-primary-subtle text-primary' : 'bg-secondary-subtle text-secondary'}`}>
                          {q.status}
                        </span>
                      </td>
                      <td className="px-4 text-end">
                        {q.status === 'active' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1 shadow-sm fw-semibold"
                            onClick={() => convertQuoteMutation.mutate(q.id)}
                            disabled={convertQuoteMutation.isPending}
                          >
                            <i className="bi bi-check-circle-fill" />
                            <span>Convert to Booking</span>
                          </button>
                        )}
                        {q.status === 'converted' && (
                          <span className="badge bg-light text-muted border">Converted</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th className="px-4 py-3 small text-muted text-uppercase">Priority</th>
                  <th className="py-3 small text-muted text-uppercase">Guest Name</th>
                  <th className="py-3 small text-muted text-uppercase">Desired Dates</th>
                  <th className="py-3 small text-muted text-uppercase">Guests</th>
                  <th className="py-3 small text-muted text-uppercase">Status</th>
                  <th className="px-4 py-3 small text-muted text-uppercase text-end">1-Click Convert</th>
                </tr>
              </thead>
              <tbody>
                {isWaitlistsLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-muted small">Loading waitlist...</td>
                  </tr>
                ) : waitlists.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-5 text-muted small">
                      <i className="bi bi-hourglass fs-2 text-muted d-block mb-2" />
                      Waitlist queue is empty.
                    </td>
                  </tr>
                ) : (
                  waitlists.map((w) => (
                    <tr key={w.id}>
                      <td className="px-4">
                        <span className="badge bg-primary text-white rounded-pill px-2.5">#{w.priority}</span>
                      </td>
                      <td>
                        <span className="fw-semibold text-dark d-block">{w.guestName}</span>
                        <span className="small text-muted">{w.guestEmail || w.guestPhone || '—'}</span>
                      </td>
                      <td className="small text-muted">{w.desiredCheckIn} → {w.desiredCheckOut}</td>
                      <td className="small text-muted">{w.adults} Adults</td>
                      <td>
                        <span className={`badge ${w.status === 'waiting' ? 'bg-warning-subtle text-warning-emphasis' : w.status === 'converted' ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="px-4 text-end">
                        {w.status === 'waiting' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1 shadow-sm fw-semibold"
                            onClick={() => convertWaitlistMutation.mutate(w.id)}
                            disabled={convertWaitlistMutation.isPending}
                          >
                            <i className="bi bi-check-circle-fill" />
                            <span>Confirm Booking</span>
                          </button>
                        )}
                        {w.status === 'converted' && (
                          <span className="badge bg-light text-muted border">Converted</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Quotation Modal */}
      {isNewQuoteModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg border-0 rounded-3">
              <form onSubmit={(e) => {
                e.preventDefault();
                createQuoteMutation.mutate({
                  branchId: activeBranchId,
                  guestName: qGuestName,
                  guestEmail: qGuestEmail || undefined,
                  guestPhone: qGuestPhone || undefined,
                  unitTypeId: '55000000-0000-0000-0000-000000000001',
                  ratePlanId: '35000000-0000-0000-0000-000000000001',
                  checkIn: qCheckIn,
                  checkOut: qCheckOut,
                  adults: Number(qAdults),
                  children: 0,
                  validDays: 7,
                });
              }}>
                <div className="modal-header bg-light border-bottom py-3 px-4">
                  <h6 className="fw-bold mb-0 text-dark">Generate Non-Binding Price Quotation</h6>
                  <button type="button" className="btn-close" onClick={() => setIsNewQuoteModalOpen(false)} />
                </div>
                <div className="modal-body p-4 d-flex flex-column gap-3">
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Guest Full Name</label>
                    <input type="text" className="form-control form-control-sm" value={qGuestName} onChange={(e) => setQGuestName(e.target.value)} required />
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Email Address</label>
                      <input type="email" className="form-control form-control-sm" value={qGuestEmail} onChange={(e) => setQGuestEmail(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Phone Number</label>
                      <input type="text" className="form-control form-control-sm" value={qGuestPhone} onChange={(e) => setQGuestPhone(e.target.value)} />
                    </div>
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Check-In Date</label>
                      <input type="date" className="form-control form-control-sm" value={qCheckIn} onChange={(e) => setQCheckIn(e.target.value)} required />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Check-Out Date</label>
                      <input type="date" className="form-control form-control-sm" min={qCheckIn} value={qCheckOut} onChange={(e) => setQCheckOut(e.target.value)} required />
                    </div>
                  </div>
                </div>
                <div className="modal-footer bg-light border-top py-2 px-4">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setIsNewQuoteModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm btn-primary fw-semibold" disabled={createQuoteMutation.isPending}>
                    {createQuoteMutation.isPending ? 'Calculating Quote...' : 'Generate Quote'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* New Waitlist Modal */}
      {isNewWaitlistModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg border-0 rounded-3">
              <form onSubmit={(e) => {
                e.preventDefault();
                createWaitlistMutation.mutate({
                  branchId: activeBranchId,
                  guestName: wGuestName,
                  guestEmail: wGuestEmail || undefined,
                  guestPhone: wGuestPhone || undefined,
                  unitTypeId: '55000000-0000-0000-0000-000000000001',
                  desiredCheckIn: wDesiredCheckIn,
                  desiredCheckOut: wDesiredCheckOut,
                  adults: 1,
                  children: 0,
                  priority: Number(wPriority),
                });
              }}>
                <div className="modal-header bg-light border-bottom py-3 px-4">
                  <h6 className="fw-bold mb-0 text-dark">Add Guest to Waitlist</h6>
                  <button type="button" className="btn-close" onClick={() => setIsNewWaitlistModalOpen(false)} />
                </div>
                <div className="modal-body p-4 d-flex flex-column gap-3">
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Guest Full Name</label>
                    <input type="text" className="form-control form-control-sm" value={wGuestName} onChange={(e) => setWGuestName(e.target.value)} required />
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Email</label>
                      <input type="email" className="form-control form-control-sm" value={wGuestEmail} onChange={(e) => setWGuestEmail(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Phone</label>
                      <input type="text" className="form-control form-control-sm" value={wGuestPhone} onChange={(e) => setWGuestPhone(e.target.value)} />
                    </div>
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Desired Check-In</label>
                      <input type="date" className="form-control form-control-sm" value={wDesiredCheckIn} onChange={(e) => setWDesiredCheckIn(e.target.value)} required />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Desired Check-Out</label>
                      <input type="date" className="form-control form-control-sm" min={wDesiredCheckIn} value={wDesiredCheckOut} onChange={(e) => setWDesiredCheckOut(e.target.value)} required />
                    </div>
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Queue Priority (1 = standard, 2+ = VIP)</label>
                    <input type="number" className="form-control form-control-sm" min={1} max={5} value={wPriority} onChange={(e) => setWPriority(Number(e.target.value))} required />
                  </div>
                </div>
                <div className="modal-footer bg-light border-top py-2 px-4">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setIsNewWaitlistModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm btn-primary fw-semibold" disabled={createWaitlistMutation.isPending}>
                    {createWaitlistMutation.isPending ? 'Queuing...' : 'Save to Waitlist'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
