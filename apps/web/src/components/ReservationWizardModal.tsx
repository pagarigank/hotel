import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type {
  AvailabilityUnitTypeResultDto,
  PriceQuoteResponseDto,
  ReservationDto,
  RatePlanDto,
} from '@innkeeper/contracts';

interface ReservationWizardModalProps {
  isOpen: boolean;
  initialRoom?: AvailabilityUnitTypeResultDto | null;
  initialDates?: { checkIn: string; checkOut: string; adults: number; children: number } | null;
  onClose: () => void;
  onSuccess?: (reservation: ReservationDto) => void;
}

export const ReservationWizardModal: React.FC<ReservationWizardModalProps> = ({
  isOpen,
  initialRoom,
  initialDates,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, businessDate } = useAppStore();

  const [step, setStep] = useState<number>(1);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // Form State
  const [checkIn, setCheckIn] = useState<string>(initialDates?.checkIn || businessDate || new Date().toISOString().split('T')[0]);
  const [checkOut, setCheckOut] = useState<string>(initialDates?.checkOut || tomorrow);
  const [adults, setAdults] = useState<number>(initialDates?.adults || 2);
  const [children, setChildren] = useState<number>(initialDates?.children || 0);

  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState<string>(initialRoom?.unitTypeId || '55000000-0000-0000-0000-000000000001');
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string>('35000000-0000-0000-0000-000000000001');

  // Guest State
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [vipStatus, setVipStatus] = useState<string>('standard');
  const [notes, setNotes] = useState<string>('');

  // Result state
  const [createdReservation, setCreatedReservation] = useState<ReservationDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Fetch Active Rate Plans
  const { data: ratePlans } = useQuery<RatePlanDto[]>({
    queryKey: ['rate-plans', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/branches/${activeBranchId}/rate-plans`, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isOpen,
  });

  // 2. Fetch Live Price Quote
  const { data: quote, isLoading: isQuoteLoading } = useQuery<PriceQuoteResponseDto>({
    queryKey: ['price-quote', activeTenantId, activeBranchId, selectedUnitTypeId, selectedRatePlanId, checkIn, checkOut, adults, children],
    queryFn: async () => {
      const res = await fetch('/api/v1/rates/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          branchId: activeBranchId,
          unitTypeId: selectedUnitTypeId,
          ratePlanId: selectedRatePlanId,
          checkIn,
          checkOut,
          adults,
          children,
        }),
      });
      if (!res.ok) throw new Error('Quote calculation failed');
      return res.json();
    },
    enabled: isOpen && !!selectedUnitTypeId && !!selectedRatePlanId && checkOut > checkIn,
  });

  // 3. Create Reservation Mutation
  const createReservationMutation = useMutation({
    mutationFn: async () => {
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        branchId: activeBranchId,
        guest: {
          firstName,
          lastName,
          email: email || undefined,
          phone: phone || undefined,
          vipStatus,
        },
        units: [
          {
            unitTypeId: selectedUnitTypeId,
            ratePlanId: selectedRatePlanId,
            checkIn,
            checkOut,
            adults,
            children,
          },
        ],
        notes,
      };

      const res = await fetch('/api/v1/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.title || 'Reservation creation failed');
      }

      return res.json() as Promise<ReservationDto>;
    },
    onSuccess: (data) => {
      setCreatedReservation(data);
      setStep(5);
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['board-units'] });
      queryClient.invalidateQueries({ queryKey: ['availability-search'] });
      if (onSuccess) onSuccess(data);
    },
    onError: (err: Error) => {
      setErrorMessage(err.message);
    },
  });

  if (!isOpen) return null;

  const handleNext = () => {
    setErrorMessage(null);
    if (step === 1) {
      if (checkOut <= checkIn) {
        setErrorMessage('Check-out date must be strictly after check-in date');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!quote?.isAvailable) {
        setErrorMessage('Selected room type is not available for requested dates');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (!firstName.trim() || !lastName.trim()) {
        setErrorMessage('Guest first and last name are required');
        return;
      }
      setStep(4);
    } else if (step === 4) {
      createReservationMutation.mutate();
    }
  };

  const handlePrev = () => {
    setErrorMessage(null);
    if (step > 1 && step < 5) setStep(step - 1);
  };

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
      tabIndex={-1}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content shadow-lg border-0 rounded-3">
          {/* Header */}
          <div className="modal-header border-bottom bg-light px-4 py-3">
            <div className="d-flex align-items-center gap-2">
              <div
                className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center"
                style={{ width: 36, height: 36 }}
              >
                <i className="bi bi-calendar-plus-fill fs-6" />
              </div>
              <div>
                <h6 className="modal-title fw-bold mb-0 text-dark">Reservation Booking Wizard</h6>
                <span className="text-muted small">
                  Step {step} of 5 — {step === 1 ? 'Stay Dates' : step === 2 ? 'Room & Rates' : step === 3 ? 'Guest Profile' : step === 4 ? 'Policies & Deposit' : 'Booking Confirmation'}
                </span>
              </div>
            </div>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>

          {/* Stepper Progress Bar */}
          <div className="progress" style={{ height: '4px', borderRadius: 0 }}>
            <div
              className="progress-bar bg-primary"
              role="progressbar"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>

          {/* Body */}
          <div className="modal-body p-4">
            {errorMessage && (
              <div className="alert alert-danger py-2 mb-3 small d-flex align-items-center gap-2">
                <i className="bi bi-exclamation-triangle-fill" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Step 1: Dates & Occupancy */}
            {step === 1 && (
              <div className="d-flex flex-column gap-3">
                <div className="p-3 bg-light rounded-3 border">
                  <h6 className="fw-bold text-dark mb-1">1. Select Travel Dates & Guests</h6>
                  <p className="text-muted small mb-0">Specify the stay duration and number of occupants.</p>
                </div>

                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Check-In Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Check-Out Date</label>
                    <input
                      type="date"
                      className="form-control"
                      min={checkIn}
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Adults</label>
                    <select
                      className="form-select"
                      value={adults}
                      onChange={(e) => setAdults(Number(e.target.value))}
                    >
                      <option value={1}>1 Adult</option>
                      <option value={2}>2 Adults</option>
                      <option value={3}>3 Adults</option>
                      <option value={4}>4 Adults</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Children</label>
                    <select
                      className="form-select"
                      value={children}
                      onChange={(e) => setChildren(Number(e.target.value))}
                    >
                      <option value={0}>0 Children</option>
                      <option value={1}>1 Child</option>
                      <option value={2}>2 Children</option>
                      <option value={3}>3 Children</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Room Type & Rate Plan */}
            {step === 2 && (
              <div className="d-flex flex-column gap-3">
                <div className="p-3 bg-light rounded-3 border">
                  <h6 className="fw-bold text-dark mb-1">2. Select Room Type & Rate Plan</h6>
                  <p className="text-muted small mb-0">Dynamic pricing with automated tax breakdown and policy snapshot.</p>
                </div>

                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Room Type</label>
                    <select
                      className="form-select"
                      value={selectedUnitTypeId}
                      onChange={(e) => setSelectedUnitTypeId(e.target.value)}
                    >
                      <option value="55000000-0000-0000-0000-000000000001">Standard Room (STD)</option>
                      <option value="55000000-0000-0000-0000-000000000002">Deluxe Room (DLX)</option>
                      <option value="55000000-0000-0000-0000-000000000003">Executive Suite (STE)</option>
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Rate Plan</label>
                    <select
                      className="form-select"
                      value={selectedRatePlanId}
                      onChange={(e) => setSelectedRatePlanId(e.target.value)}
                    >
                      {ratePlans?.map((rp) => (
                        <option key={rp.id} value={rp.id}>
                          {rp.code} — {rp.name}
                        </option>
                      )) || <option value="35000000-0000-0000-0000-000000000001">BAR (Best Available Rate)</option>}
                    </select>
                  </div>
                </div>

                {/* Live Rate Quote Breakdown */}
                {isQuoteLoading ? (
                  <div className="text-center py-3 text-muted small">
                    <span className="spinner-border spinner-border-sm me-2" role="status" />
                    Calculating price breakdown...
                  </div>
                ) : quote ? (
                  <div className="card border-primary-subtle bg-primary-subtle bg-opacity-10 rounded-3 p-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="fw-bold text-dark">{quote.unitTypeName} ({quote.nightsCount} Nights)</span>
                      <span className="badge bg-success text-white">
                        {quote.isAvailable ? `${quote.availableUnitsCount} Rooms Available` : 'Sold Out'}
                      </span>
                    </div>

                    <div className="table-responsive">
                      <table className="table table-sm table-borderless small mb-0">
                        <tbody>
                          <tr>
                            <td className="text-muted">Room Subtotal:</td>
                            <td className="text-end fw-semibold text-dark">${quote.subtotal.toFixed(2)}</td>
                          </tr>
                          <tr>
                            <td className="text-muted">Taxes & Surcharges (VAT + Service + City):</td>
                            <td className="text-end fw-semibold text-dark">${quote.totalTaxes.toFixed(2)}</td>
                          </tr>
                          <tr className="border-top">
                            <td className="fw-bold text-dark fs-6 pt-2">Total Amount:</td>
                            <td className="text-end fw-bold text-primary fs-6 pt-2">${quote.totalAmount.toFixed(2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Step 3: Guest Profile & Deduplication */}
            {step === 3 && (
              <div className="d-flex flex-column gap-3">
                <div className="p-3 bg-light rounded-3 border">
                  <h6 className="fw-bold text-dark mb-1">3. Guest Information</h6>
                  <p className="text-muted small mb-0">Enter guest details. Duplicate email/phone will automatically match existing profiles.</p>
                </div>

                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">First Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Jane"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Last Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Email Address</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="jane.doe@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Phone Number</label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="+1-555-0199"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">VIP Status</label>
                    <select
                      className="form-select"
                      value={vipStatus}
                      onChange={(e) => setVipStatus(e.target.value)}
                    >
                      <option value="standard">Standard Guest</option>
                      <option value="silver">Silver Tier</option>
                      <option value="gold">Gold Tier</option>
                      <option value="platinum">Platinum VIP</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Special Requests / Notes</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="High floor, extra pillows..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Review Policies & Deposit */}
            {step === 4 && (
              <div className="d-flex flex-column gap-3">
                <div className="p-3 bg-light rounded-3 border">
                  <h6 className="fw-bold text-dark mb-1">4. Review Guarantee & Deposit Policies</h6>
                  <p className="text-muted small mb-0">Confirm rate rules, cancellation deadlines, and deposit requirements.</p>
                </div>

                <div className="card border p-3 rounded-3 bg-white">
                  <h6 className="fw-bold text-dark mb-2">Booking Summary</h6>
                  <div className="row g-2 small text-muted mb-3">
                    <div className="col-6"><strong>Guest:</strong> {firstName} {lastName}</div>
                    <div className="col-6"><strong>Contact:</strong> {email || phone || 'None provided'}</div>
                    <div className="col-6"><strong>Dates:</strong> {checkIn} to {checkOut} ({quote?.nightsCount} nights)</div>
                    <div className="col-6"><strong>Room Type:</strong> {quote?.unitTypeName}</div>
                    <div className="col-6"><strong>Rate Plan:</strong> {quote?.ratePlanName}</div>
                    <div className="col-6"><strong>Total Price:</strong> <span className="text-primary fw-bold">${quote?.totalAmount.toFixed(2)}</span></div>
                  </div>

                  <div className="p-3 bg-warning-subtle text-dark rounded-2 border border-warning-subtle small">
                    <div className="fw-bold mb-1 d-flex align-items-center gap-1">
                      <i className="bi bi-shield-check" />
                      <span>Policy Snapshot</span>
                    </div>
                    <div>• Cancellation: Free cancellation up to 48 hours prior to 14:00 check-in.</div>
                    <div>• Deposit: Credit card guarantee required upon arrival.</div>
                    <div>• No-show: 1 night room charge plus applicable taxes.</div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Confirmation */}
            {step === 5 && createdReservation && (
              <div className="text-center py-4">
                <div
                  className="rounded-circle bg-success text-white d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ width: 64, height: 64 }}
                >
                  <i className="bi bi-check-lg fs-1" />
                </div>
                <h5 className="fw-bold text-dark mb-1">Reservation Confirmed!</h5>
                <p className="text-muted small mb-3">The booking was processed with atomic anti-double-booking locks.</p>

                <div className="p-3 bg-light rounded-3 border d-inline-block text-start mb-4" style={{ minWidth: 320 }}>
                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-muted small">Reservation Number:</span>
                    <strong className="text-primary font-monospace">{createdReservation.reservationNo}</strong>
                  </div>
                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-muted small">Status:</span>
                    <span className="badge bg-success">{createdReservation.status}</span>
                  </div>
                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-muted small">Guest:</span>
                    <span className="fw-semibold text-dark">{createdReservation.guestName}</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span className="text-muted small">Total Confirmed:</span>
                    <span className="fw-bold text-dark">${createdReservation.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="modal-footer border-top bg-light px-4 py-3 d-flex justify-content-between">
            {step > 1 && step < 5 ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handlePrev}
                disabled={createReservationMutation.isPending}
              >
                Back
              </button>
            ) : <div />}

            <div className="d-flex gap-2">
              {step < 5 ? (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={onClose}
                    disabled={createReservationMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary fw-semibold d-flex align-items-center gap-1 shadow-sm"
                    onClick={handleNext}
                    disabled={createReservationMutation.isPending}
                  >
                    {createReservationMutation.isPending ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status" />
                        <span>Confirming...</span>
                      </>
                    ) : (
                      <>
                        <span>{step === 4 ? 'Confirm & Book' : 'Continue'}</span>
                        <i className="bi bi-arrow-right" />
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-success fw-semibold px-4"
                  onClick={onClose}
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
