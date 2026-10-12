import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type { RatePlanDto, CreateRatePlanDto, SetRateCalendarDto, SetRestrictionsDto } from '@innkeeper/contracts';

export const RatesManagementSection: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();

  const [activeTab, setActiveTab] = useState<'plans' | 'calendar' | 'restrictions'>('plans');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  // New Rate Plan Modal
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planCode, setPlanCode] = useState('');
  const [planName, setPlanName] = useState('');
  const [planMultiplier, setPlanMultiplier] = useState<number>(1.0);
  const [planMealPlan, setPlanMealPlan] = useState('breakfast');
  const [planPolicy, setPlanPolicy] = useState('standard');

  // Rate Calendar Override Form
  const [selectedRatePlanId, setSelectedRatePlanId] = useState('');
  const [calStartDate, setCalStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [calEndDate, setCalEndDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
  const [calRate, setCalRate] = useState<number>(140);

  // Restrictions Form
  const [restMinLos, setRestMinLos] = useState<number>(1);
  const [restMaxLos, setRestMaxLos] = useState<number>(14);
  const [restClosedArrival, setRestClosedArrival] = useState(false);
  const [restClosedDeparture, setRestClosedDeparture] = useState(false);
  const [restStopSell, setRestStopSell] = useState(false);

  // 1. Fetch Rate Plans
  const { data: ratePlans, isLoading: isPlansLoading } = useQuery<RatePlanDto[]>({
    queryKey: ['rate-plans', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/branches/${activeBranchId}/rate-plans`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Default selected plan
  React.useEffect(() => {
    if (ratePlans && ratePlans.length > 0 && !selectedRatePlanId) {
      setSelectedRatePlanId(ratePlans[0].id);
    }
  }, [ratePlans, selectedRatePlanId]);

  // Create Rate Plan Mutation
  const createPlanMutation = useMutation({
    mutationFn: async (payload: CreateRatePlanDto) => {
      const res = await fetch(`/api/v1/branches/${activeBranchId}/rate-plans`, {
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
        throw new Error(err.detail || err.title || 'Failed to create rate plan');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({ message: 'Rate plan created successfully.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['rate-plans'] });
      setIsPlanModalOpen(false);
      setPlanCode('');
      setPlanName('');
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  // Set Rate Calendar Mutation
  const setCalendarMutation = useMutation({
    mutationFn: async (payload: SetRateCalendarDto) => {
      const res = await fetch(`/api/v1/branches/${activeBranchId}/rate-calendar`, {
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
        throw new Error(err.detail || err.title || 'Failed to update rate calendar');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({ message: 'Seasonal rate override saved across date window.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['rate-calendar'] });
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  // Set Restrictions Mutation
  const setRestrictionsMutation = useMutation({
    mutationFn: async (payload: SetRestrictionsDto) => {
      const res = await fetch(`/api/v1/branches/${activeBranchId}/restrictions`, {
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
        throw new Error(err.detail || err.title || 'Failed to update restrictions');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({ message: 'Restriction rules updated successfully.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['restrictions'] });
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  return (
    <div className="d-flex flex-column gap-4">
      {/* Top Header Card */}
      <div className="card shadow-sm border-0 rounded-3">
        <div className="card-header bg-white border-bottom py-3 px-4 d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div>
            <div className="d-flex align-items-center gap-2">
              <h5 className="fw-bold mb-0 text-dark">Rates Engine &amp; Pricing Calendar</h5>
              <span className="badge bg-light text-muted border">
                {ratePlans?.length || 0} Rate Plans
              </span>
            </div>
            <span className="text-muted small">
              Dynamic pricing, seasonal calendars, minimum/maximum stay restrictions, and stop-sell flags (REQ-RSV-007)
            </span>
          </div>

          <div className="d-flex align-items-center gap-2">
            <div className="btn-group btn-group-sm" role="group">
              <button
                type="button"
                className={`btn ${activeTab === 'plans' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab('plans')}
              >
                <i className="bi bi-tag-fill me-1" />
                Rate Plans
              </button>
              <button
                type="button"
                className={`btn ${activeTab === 'calendar' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab('calendar')}
              >
                <i className="bi bi-calendar3 me-1" />
                Seasonal Overrides
              </button>
              <button
                type="button"
                className={`btn ${activeTab === 'restrictions' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab('restrictions')}
              >
                <i className="bi bi-shield-lock-fill me-1" />
                Restrictions &amp; Stop-Sell
              </button>
            </div>

            {activeTab === 'plans' && (
              <button
                type="button"
                className="btn btn-sm btn-primary d-flex align-items-center gap-1 fw-semibold shadow-sm"
                onClick={() => setIsPlanModalOpen(true)}
              >
                <i className="bi bi-plus-lg" />
                <span>New Rate Plan</span>
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

        {/* Tab 1: Rate Plans List */}
        {activeTab === 'plans' && (
          <div className="card-body p-0">
            {isPlansLoading ? (
              <div className="p-4 text-center text-muted small">Loading rate plans...</div>
            ) : ratePlans?.length === 0 ? (
              <div className="p-4 text-center text-muted small">No rate plans configured for this branch.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light small text-muted text-uppercase">
                    <tr>
                      <th className="ps-4">Plan Code &amp; Name</th>
                      <th>Multiplier / Formula</th>
                      <th>Meal Plan Addon</th>
                      <th>Cancellation Policy</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody className="small">
                    {ratePlans?.map((rp) => (
                      <tr key={rp.id}>
                        <td className="ps-4">
                          <div className="fw-semibold text-dark">{rp.name}</div>
                          <span className="font-monospace text-primary" style={{ fontSize: '0.75rem' }}>
                            {rp.code}
                          </span>
                        </td>
                        <td>
                          <span className="badge bg-light text-dark border">
                            {Number(rp.attrs?.multiplier || 1.0).toFixed(2)}x Base Rate
                          </span>
                        </td>
                        <td>
                          <span className="text-muted text-capitalize">{rp.attrs?.mealPlan || 'Room Only'}</span>
                        </td>
                        <td>
                          <span className="badge bg-secondary-subtle text-secondary">
                            {rp.currency || 'USD'}
                          </span>
                        </td>
                        <td>
                          {rp.isActive ? (
                            <span className="badge bg-success-subtle text-success border border-success-subtle">
                              Active
                            </span>
                          ) : (
                            <span className="badge bg-light text-muted border">Inactive</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Seasonal Calendar Rate Override Form */}
        {activeTab === 'calendar' && (
          <div className="card-body p-4">
            <div className="row g-4">
              <div className="col-lg-6">
                <h6 className="fw-bold text-dark mb-2">Set Daily Rate Calendar Override</h6>
                <p className="text-muted small mb-3">
                  Override default unit-type pricing for peak holidays, weekends, or promotional date ranges.
                </p>

                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedRatePlanId) return;
                  setCalendarMutation.mutate({
                    branchId: activeBranchId,
                    unitTypeId: '55000000-0000-0000-0000-000000000001',
                    ratePlanId: selectedRatePlanId,
                    startDate: calStartDate,
                    endDate: calEndDate,
                    rate: Number(calRate),
                    extraAdultRate: 0,
                    extraChildRate: 0,
                  });
                }} className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Target Rate Plan</label>
                    <select
                      className="form-select form-select-sm"
                      value={selectedRatePlanId}
                      onChange={(e) => setSelectedRatePlanId(e.target.value)}
                    >
                      {ratePlans?.map((rp) => (
                        <option key={rp.id} value={rp.id}>
                          {rp.name} ({rp.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Start Date</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={calStartDate}
                        onChange={(e) => setCalStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">End Date</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={calEndDate}
                        onChange={(e) => setCalEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Overridden Nightly Rate ($)</label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text">$</span>
                      <input
                        type="number"
                        className="form-control"
                        step="0.01"
                        min="1"
                        value={calRate}
                        onChange={(e) => setCalRate(Number(e.target.value))}
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-sm btn-primary fw-semibold mt-2"
                    disabled={setCalendarMutation.isPending}
                  >
                    {setCalendarMutation.isPending ? 'Applying Override...' : 'Apply Seasonal Rate Override'}
                  </button>
                </form>
              </div>

              <div className="col-lg-6">
                <div className="p-3 bg-light rounded-3 border h-100 d-flex flex-column justify-content-between">
                  <div>
                    <h6 className="fw-bold text-dark mb-2">
                      <i className="bi bi-info-circle text-primary me-2" />
                      Dynamic Rate Pricing Rules
                    </h6>
                    <ul className="small text-muted mb-0 ps-3">
                      <li className="mb-2">Calendar overrides supersede standard base rates for all nights within the defined start and end window.</li>
                      <li className="mb-2">Taxes and service charges are calculated transparently upon quote based on whether tax inclusion is configured.</li>
                      <li>OTA Channel Manager outbound feeds sync new calendar rates in real time.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Restrictions & Stop-Sell Form */}
        {activeTab === 'restrictions' && (
          <div className="card-body p-4">
            <div className="row g-4">
              <div className="col-lg-7">
                <h6 className="fw-bold text-dark mb-2">Set Distribution Restrictions (REQ-RSV-007)</h6>
                <p className="text-muted small mb-3">
                  Configure Minimum Length of Stay (min LOS), Maximum Length of Stay, Closed to Arrival/Departure, or Stop-Sell flags.
                </p>

                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedRatePlanId) return;
                  setRestrictionsMutation.mutate({
                    branchId: activeBranchId,
                    ratePlanId: selectedRatePlanId,
                    startDate: calStartDate,
                    endDate: calEndDate,
                    minLos: Number(restMinLos),
                    maxLos: Number(restMaxLos),
                    closedToArrival: restClosedArrival,
                    closedToDeparture: restClosedDeparture,
                    stopSell: restStopSell,
                  });
                }} className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Target Rate Plan</label>
                    <select
                      className="form-select form-select-sm"
                      value={selectedRatePlanId}
                      onChange={(e) => setSelectedRatePlanId(e.target.value)}
                    >
                      {ratePlans?.map((rp) => (
                        <option key={rp.id} value={rp.id}>
                          {rp.name} ({rp.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Start Date</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={calStartDate}
                        onChange={(e) => setCalStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">End Date</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={calEndDate}
                        onChange={(e) => setCalEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Min Length of Stay (Nights)</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="1"
                        value={restMinLos}
                        onChange={(e) => setRestMinLos(Number(e.target.value))}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-muted mb-1">Max Length of Stay (Nights)</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="1"
                        value={restMaxLos}
                        onChange={(e) => setRestMaxLos(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-light rounded border d-flex flex-column gap-2">
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="ctaSwitch"
                        checked={restClosedArrival}
                        onChange={(e) => setRestClosedArrival(e.target.checked)}
                      />
                      <label className="form-check-label small fw-semibold" htmlFor="ctaSwitch">
                        Closed to Arrival (CTA) — Guests cannot check in on these dates
                      </label>
                    </div>

                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="ctdSwitch"
                        checked={restClosedDeparture}
                        onChange={(e) => setRestClosedDeparture(e.target.checked)}
                      />
                      <label className="form-check-label small fw-semibold" htmlFor="ctdSwitch">
                        Closed to Departure (CTD) — Guests cannot check out on these dates
                      </label>
                    </div>

                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="stopSellSwitch"
                        checked={restStopSell}
                        onChange={(e) => setRestStopSell(e.target.checked)}
                      />
                      <label className="form-check-label small fw-semibold text-danger" htmlFor="stopSellSwitch">
                        Stop-Sell Active — Instantly halts all direct and OTA bookings for this rate plan
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-sm btn-primary fw-semibold"
                    disabled={setRestrictionsMutation.isPending}
                  >
                    {setRestrictionsMutation.isPending ? 'Updating...' : 'Save Restriction Rules'}
                  </button>
                </form>
              </div>

              <div className="col-lg-5">
                <div className="p-3 bg-light rounded-3 border h-100">
                  <h6 className="fw-bold text-dark mb-2">Policy Compliance Guarantee</h6>
                  <p className="small text-muted mb-0">
                    When Stop-Sell or Minimum LOS rules are active, the Real-time Availability Engine immediately removes matching room inventory from both the Reservation Wizard and 2-way OTA distribution channels.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Rate Plan Modal */}
      {isPlanModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 480 }}>
            <div className="modal-content shadow-lg border-0 rounded-3">
              <form onSubmit={(e) => {
                e.preventDefault();
                createPlanMutation.mutate({
                  branchId: activeBranchId,
                  code: planCode.trim().toUpperCase(),
                  name: planName.trim(),
                  currency: 'USD',
                  isActive: true,
                  policyCancellation: {},
                  policyDeposit: {},
                  policyNoShow: {},
                  attrs: { multiplier: Number(planMultiplier), mealPlan: planMealPlan },
                });
              }}>
                <div className="modal-header bg-light border-bottom py-3 px-4">
                  <h6 className="fw-bold mb-0 text-dark">Create New Rate Plan</h6>
                  <button type="button" className="btn-close" onClick={() => setIsPlanModalOpen(false)} />
                </div>
                <div className="modal-body p-4 d-flex flex-column gap-3">
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Plan Code *</label>
                    <input
                      type="text"
                      className="form-control form-control-sm font-monospace"
                      placeholder="e.g. BAR, PROMO-SUMMER"
                      value={planCode}
                      onChange={(e) => setPlanCode(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Plan Display Name *</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="e.g. Best Available Rate with Breakfast"
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Base Rate Multiplier</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.5"
                      max="3.0"
                      className="form-control form-control-sm"
                      value={planMultiplier}
                      onChange={(e) => setPlanMultiplier(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Meal Plan Inclusions</label>
                    <select
                      className="form-select form-select-sm"
                      value={planMealPlan}
                      onChange={(e) => setPlanMealPlan(e.target.value)}
                    >
                      <option value="room_only">Room Only (European Plan)</option>
                      <option value="breakfast">Bed &amp; Breakfast</option>
                      <option value="half_board">Half Board (Breakfast + Dinner)</option>
                      <option value="full_board">Full Board (All Meals)</option>
                    </select>
                  </div>
                </div>
                <div className="modal-footer bg-light border-top px-4 py-2.5 d-flex justify-content-between">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setIsPlanModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm btn-primary fw-semibold" disabled={createPlanMutation.isPending}>
                    {createPlanMutation.isPending ? 'Saving...' : 'Create Rate Plan'}
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
