import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type { GuestDto, CompanyDto, CreateGuestDto, UpdateGuestDto, MergeGuestsDto } from '@innkeeper/contracts';

export const GuestsProfilesSection: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();

  const [activeSubTab, setActiveSubTab] = useState<'guests' | 'companies'>('guests');
  const [search, setSearch] = useState('');
  const [selectedGuest, setSelectedGuest] = useState<GuestDto | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [nationality, setNationality] = useState('');
  const [vipStatus, setVipStatus] = useState<'standard' | 'silver' | 'gold' | 'platinum' | 'blacklist'>('standard');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  // Merge modal state
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeReason, setMergeReason] = useState('Duplicate profile identified during check-in');

  // Company form state
  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [companyTaxId, setCompanyTaxId] = useState('');

  // 1. Fetch Guests
  const { data: guests, isLoading: isGuestsLoading } = useQuery<GuestDto[]>({
    queryKey: ['guests', activeTenantId, search],
    queryFn: async () => {
      const url = search.trim()
        ? `/api/v1/guests?search=${encodeURIComponent(search.trim())}`
        : '/api/v1/guests';
      const res = await fetch(url, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // 2. Fetch Companies
  const { data: companies, isLoading: isCompaniesLoading } = useQuery<CompanyDto[]>({
    queryKey: ['companies', activeTenantId],
    queryFn: async () => {
      const res = await fetch('/api/v1/companies', {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Create Guest Mutation
  const createGuestMutation = useMutation({
    mutationFn: async (payload: CreateGuestDto) => {
      const res = await fetch('/api/v1/guests', {
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
        throw new Error(err.detail || err.title || 'Failed to create guest profile');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({ message: 'Guest profile created successfully.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      setIsCreateModalOpen(false);
      resetForm();
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  // Update Guest Mutation
  const updateGuestMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateGuestDto }) => {
      const res = await fetch(`/api/v1/guests/${id}`, {
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
        throw new Error(err.detail || err.title || 'Failed to update guest profile');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({ message: 'Guest profile updated.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      setIsEditModalOpen(false);
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  // Merge Guests Mutation
  const mergeMutation = useMutation({
    mutationFn: async (payload: MergeGuestsDto) => {
      const res = await fetch('/api/v1/guests/merge', {
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
        throw new Error(err.detail || err.title || 'Merge failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({
        message: 'Guest profiles merged cleanly. Historical bookings & folios re-linked to winner.',
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      setIsMergeModalOpen(false);
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  // Create Company Mutation
  const createCompanyMutation = useMutation({
    mutationFn: async (payload: { name: string; code?: string; taxId?: string }) => {
      const res = await fetch('/api/v1/companies', {
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
        throw new Error(err.detail || err.title || 'Failed to create corporate account');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({ message: 'Corporate account created.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setIsCompanyModalOpen(false);
      setCompanyName('');
      setCompanyCode('');
      setCompanyTaxId('');
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setIdNumber('');
    setNationality('');
    setVipStatus('standard');
  };

  const openEditModal = (g: GuestDto) => {
    setSelectedGuest(g);
    setFirstName(g.firstName);
    setLastName(g.lastName);
    setEmail(g.email || '');
    setPhone(g.phone || '');
    setNationality(g.nationality || '');
    setVipStatus(g.vipStatus || 'standard');
    setIsEditModalOpen(true);
  };

  const openMergeModal = (g: GuestDto) => {
    setSelectedGuest(g);
    setMergeTargetId(g.id);
    const other = guests?.find((x) => x.id !== g.id);
    setMergeSourceId(other ? other.id : '');
    setIsMergeModalOpen(true);
  };

  return (
    <div className="d-flex flex-column gap-4">
      {/* Top Header Card */}
      <div className="card shadow-sm border-0 rounded-3">
        <div className="card-header bg-white border-bottom py-3 px-4 d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div>
            <div className="d-flex align-items-center gap-2">
              <h5 className="fw-bold mb-0 text-dark">Guest & Company Profiles Directory</h5>
              <span className="badge bg-light text-muted border">
                {activeSubTab === 'guests' ? `${guests?.length || 0} Guests` : `${companies?.length || 0} Accounts`}
              </span>
            </div>
            <span className="text-muted small">
              GDPR/Privacy consent tracking, guest history deduplication, and corporate accounts
            </span>
          </div>

          <div className="d-flex align-items-center gap-2">
            <div className="btn-group btn-group-sm" role="group">
              <button
                type="button"
                className={`btn ${activeSubTab === 'guests' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveSubTab('guests')}
              >
                <i className="bi bi-people me-1" />
                Guests
              </button>
              <button
                type="button"
                className={`btn ${activeSubTab === 'companies' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveSubTab('companies')}
              >
                <i className="bi bi-buildings me-1" />
                Corporate Accounts
              </button>
            </div>

            {activeSubTab === 'guests' ? (
              <button
                type="button"
                className="btn btn-sm btn-primary d-flex align-items-center gap-1 fw-semibold shadow-sm"
                onClick={() => {
                  resetForm();
                  setIsCreateModalOpen(true);
                }}
              >
                <i className="bi bi-person-plus-fill" />
                <span>New Guest Profile</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-primary d-flex align-items-center gap-1 fw-semibold shadow-sm"
                onClick={() => setIsCompanyModalOpen(true)}
              >
                <i className="bi bi-building-add" />
                <span>New Corporate Account</span>
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div className={`alert alert-${feedback.type} m-3 mb-0 py-2 small d-flex justify-content-between align-items-center`}>
            <span>{feedback.message}</span>
            <button type="button" className="btn-close" onClick={() => setFeedback(null)} />
          </div>
        )}

        {/* Content Table */}
        <div className="card-body p-0">
          {activeSubTab === 'guests' ? (
            <>
              {/* Search Bar */}
              <div className="p-3 border-bottom bg-light-subtle d-flex align-items-center gap-3">
                <div className="input-group input-group-sm" style={{ maxWidth: 360 }}>
                  <span className="input-group-text bg-white border-end-0">
                    <i className="bi bi-search text-muted" />
                  </span>
                  <input
                    type="text"
                    className="form-control border-start-0"
                    placeholder="Search by name, email, or phone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {search && (
                  <button type="button" className="btn btn-sm btn-light border" onClick={() => setSearch('')}>
                    Clear
                  </button>
                )}
              </div>

              {isGuestsLoading ? (
                <div className="p-4 text-center text-muted small">Loading guest profiles...</div>
              ) : guests?.length === 0 ? (
                <div className="p-4 text-center text-muted small">No guest profiles found matching criteria.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light small text-muted text-uppercase">
                      <tr>
                        <th className="ps-4">Guest Name</th>
                        <th>VIP Status</th>
                        <th>Email & Phone</th>
                        <th>ID / Passport</th>
                        <th>Nationality</th>
                        <th className="pe-4 text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="small">
                      {guests?.map((g) => (
                        <tr key={g.id}>
                          <td className="ps-4">
                            <div className="fw-semibold text-dark">
                              {g.firstName} {g.lastName}
                            </div>
                            <span className="font-monospace text-muted" style={{ fontSize: '0.72rem' }}>
                              ID: {g.id.slice(0, 8)}...
                            </span>
                          </td>
                          <td>
                            {(g.vipStatus === 'gold' || g.vipStatus === 'platinum') ? (
                              <span className="badge bg-warning text-dark border border-warning-subtle">
                                <i className="bi bi-star-fill me-1" />
                                VIP ({g.vipStatus})
                              </span>
                            ) : (
                              <span className="badge bg-light text-muted border text-capitalize">{g.vipStatus}</span>
                            )}
                          </td>
                          <td>
                            <div className="text-dark">{g.email || '—'}</div>
                            <div className="text-muted small">{g.phone || '—'}</div>
                          </td>
                          <td>
                            <span className="font-monospace text-dark">{g.attrs?.idNumber || '—'}</span>
                          </td>
                          <td>{g.nationality || '—'}</td>
                          <td className="pe-4 text-end">
                            <div className="btn-group btn-group-sm">
                              <button
                                type="button"
                                className="btn btn-outline-secondary"
                                title="Edit Profile"
                                onClick={() => openEditModal(g)}
                              >
                                <i className="bi bi-pencil" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-primary"
                                title="Merge Duplicate Profiles"
                                onClick={() => openMergeModal(g)}
                              >
                                <i className="bi bi-intersect" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="table-responsive">
              {isCompaniesLoading ? (
                <div className="p-4 text-center text-muted small">Loading corporate accounts...</div>
              ) : companies?.length === 0 ? (
                <div className="p-4 text-center text-muted small">No corporate accounts found.</div>
              ) : (
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light small text-muted text-uppercase">
                    <tr>
                      <th className="ps-4">Company Name</th>
                      <th>Billing Email</th>
                      <th>Tax Identifier</th>
                      <th>Contract Type</th>
                    </tr>
                  </thead>
                  <tbody className="small">
                    {companies?.map((c) => (
                      <tr key={c.id}>
                        <td className="ps-4 fw-semibold text-dark">{c.name}</td>
                        <td>
                          <span className="text-primary">{c.billingEmail || '—'}</span>
                        </td>
                        <td>
                          <span className="font-monospace text-muted">{c.taxIdentifier || '—'}</span>
                        </td>
                        <td>
                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                            Corporate Rate Plan
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Guest Modal */}
      {isCreateModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 520 }}>
            <div className="modal-content shadow-lg border-0 rounded-3">
              <form onSubmit={(e) => {
                e.preventDefault();
                createGuestMutation.mutate({
                  firstName,
                  lastName,
                  email: email || undefined,
                  phone: phone || undefined,
                  nationality: nationality || undefined,
                  vipStatus,
                  attrs: { idNumber: idNumber || undefined },
                });
              }}>
                <div className="modal-header bg-light border-bottom py-3 px-4">
                  <h6 className="fw-bold mb-0 text-dark">Create Guest Profile</h6>
                  <button type="button" className="btn-close" onClick={() => setIsCreateModalOpen(false)} />
                </div>
                <div className="modal-body p-4 d-flex flex-column gap-3">
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">First Name *</label>
                      <input type="text" className="form-control form-control-sm" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Last Name *</label>
                      <input type="text" className="form-control form-control-sm" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Email</label>
                      <input type="email" className="form-control form-control-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Phone</label>
                      <input type="tel" className="form-control form-control-sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Passport / ID #</label>
                      <input type="text" className="form-control form-control-sm font-monospace" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Nationality</label>
                      <input type="text" className="form-control form-control-sm" value={nationality} onChange={(e) => setNationality(e.target.value)} />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-bold text-muted mb-1">VIP Classification</label>
                      <select className="form-select form-select-sm" value={vipStatus} onChange={(e) => setVipStatus(e.target.value as any)}>
                        <option value="standard">Standard Guest</option>
                        <option value="silver">Silver Tier</option>
                        <option value="gold">Gold Tier</option>
                        <option value="platinum">Platinum VIP</option>
                        <option value="blacklist">Blacklisted</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-footer bg-light border-top px-4 py-2.5 d-flex justify-content-between">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setIsCreateModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm btn-primary fw-semibold" disabled={createGuestMutation.isPending}>
                    {createGuestMutation.isPending ? 'Saving...' : 'Save Guest Profile'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Guest Modal */}
      {isEditModalOpen && selectedGuest && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 520 }}>
            <div className="modal-content shadow-lg border-0 rounded-3">
              <form onSubmit={(e) => {
                e.preventDefault();
                updateGuestMutation.mutate({
                  id: selectedGuest.id,
                  payload: {
                    firstName,
                    lastName,
                    email: email || undefined,
                    phone: phone || undefined,
                    nationality: nationality || undefined,
                    vipStatus,
                    attrs: { idNumber: idNumber || undefined },
                  },
                });
              }}>
                <div className="modal-header bg-light border-bottom py-3 px-4">
                  <h6 className="fw-bold mb-0 text-dark">Edit Guest: {selectedGuest.firstName} {selectedGuest.lastName}</h6>
                  <button type="button" className="btn-close" onClick={() => setIsEditModalOpen(false)} />
                </div>
                <div className="modal-body p-4 d-flex flex-column gap-3">
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">First Name *</label>
                      <input type="text" className="form-control form-control-sm" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Last Name *</label>
                      <input type="text" className="form-control form-control-sm" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Email</label>
                      <input type="email" className="form-control form-control-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Phone</label>
                      <input type="tel" className="form-control form-control-sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Passport / ID #</label>
                      <input type="text" className="form-control form-control-sm font-monospace" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Nationality</label>
                      <input type="text" className="form-control form-control-sm" value={nationality} onChange={(e) => setNationality(e.target.value)} />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-bold text-muted mb-1">VIP Classification</label>
                      <select className="form-select form-select-sm" value={vipStatus} onChange={(e) => setVipStatus(e.target.value as any)}>
                        <option value="standard">Standard Guest</option>
                        <option value="silver">Silver Tier</option>
                        <option value="gold">Gold Tier</option>
                        <option value="platinum">Platinum VIP</option>
                        <option value="blacklist">Blacklisted</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-footer bg-light border-top px-4 py-2.5 d-flex justify-content-between">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setIsEditModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm btn-primary fw-semibold" disabled={updateGuestMutation.isPending}>
                    {updateGuestMutation.isPending ? 'Updating...' : 'Save Updates'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Merge Guests Modal */}
      {isMergeModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 540 }}>
            <div className="modal-content shadow-lg border-0 rounded-3">
              <form onSubmit={(e) => {
                e.preventDefault();
                mergeMutation.mutate({
                  sourceGuestId: mergeSourceId,
                  targetGuestId: mergeTargetId,
                  reason: mergeReason,
                });
              }}>
                <div className="modal-header bg-light border-bottom py-3 px-4">
                  <h6 className="fw-bold mb-0 text-dark">
                    <i className="bi bi-intersect text-primary me-2" />
                    Merge Duplicate Guest Profiles (REQ-RSV-013)
                  </h6>
                  <button type="button" className="btn-close" onClick={() => setIsMergeModalOpen(false)} />
                </div>
                <div className="modal-body p-4 d-flex flex-column gap-3">
                  <div className="alert alert-warning py-2 small mb-0">
                    <i className="bi bi-exclamation-triangle-fill me-1" />
                    All historical reservations, folios, and stays will be atomically re-linked to the <strong>Winner Profile</strong>. The duplicate profile will be soft-deleted.
                  </div>

                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Target Winner Profile (Retained) *</label>
                    <select className="form-select form-select-sm" value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)}>
                      {guests?.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.firstName} {g.lastName} ({g.email || g.phone || g.id.slice(0, 8)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Duplicate Source Profile (Soft-Deleted) *</label>
                    <select className="form-select form-select-sm" value={mergeSourceId} onChange={(e) => setMergeSourceId(e.target.value)}>
                      {guests?.filter((g) => g.id !== mergeTargetId).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.firstName} {g.lastName} ({g.email || g.phone || g.id.slice(0, 8)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Audit Reason</label>
                    <input type="text" className="form-control form-control-sm" value={mergeReason} onChange={(e) => setMergeReason(e.target.value)} required />
                  </div>
                </div>
                <div className="modal-footer bg-light border-top px-4 py-2.5 d-flex justify-content-between">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setIsMergeModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm btn-danger fw-semibold" disabled={mergeMutation.isPending || !mergeSourceId || mergeSourceId === mergeTargetId}>
                    {mergeMutation.isPending ? 'Merging...' : 'Confirm & Re-link Records'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Create Company Modal */}
      {isCompanyModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 480 }}>
            <div className="modal-content shadow-lg border-0 rounded-3">
              <form onSubmit={(e) => {
                e.preventDefault();
                createCompanyMutation.mutate({
                  name: companyName,
                  code: companyCode || undefined,
                  taxId: companyTaxId || undefined,
                });
              }}>
                <div className="modal-header bg-light border-bottom py-3 px-4">
                  <h6 className="fw-bold mb-0 text-dark">Create Corporate Account</h6>
                  <button type="button" className="btn-close" onClick={() => setIsCompanyModalOpen(false)} />
                </div>
                <div className="modal-body p-4 d-flex flex-column gap-3">
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Company / Organization Name *</label>
                    <input type="text" className="form-control form-control-sm" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Corporate Code</label>
                    <input type="text" className="form-control form-control-sm font-monospace" placeholder="e.g. CORP-GOOGLE" value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Tax ID / VAT Registration #</label>
                    <input type="text" className="form-control form-control-sm font-monospace" placeholder="e.g. 123-456-789-000" value={companyTaxId} onChange={(e) => setCompanyTaxId(e.target.value)} />
                  </div>
                </div>
                <div className="modal-footer bg-light border-top px-4 py-2.5 d-flex justify-content-between">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setIsCompanyModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm btn-primary fw-semibold" disabled={createCompanyMutation.isPending}>
                    {createCompanyMutation.isPending ? 'Creating...' : 'Save Corporate Account'}
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
