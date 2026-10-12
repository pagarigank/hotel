import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type { AvailabilityResponseDto, AvailabilityUnitTypeResultDto } from '@innkeeper/contracts';

interface AvailabilitySearchBarProps {
  onSelectResult?: (result: AvailabilityUnitTypeResultDto, dates: { checkIn: string; checkOut: string; adults: number; children: number }) => void;
}

export const AvailabilitySearchBar: React.FC<AvailabilitySearchBarProps> = ({ onSelectResult }) => {
  const { activeTenantId, activeBranchId, businessDate } = useAppStore();

  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const [checkIn, setCheckIn] = useState<string>(businessDate || new Date().toISOString().split('T')[0]);
  const [checkOut, setCheckOut] = useState<string>(tomorrow);
  const [adults, setAdults] = useState<number>(2);
  const [children, setChildren] = useState<number>(0);
  const [hasSearched, setHasSearched] = useState<boolean>(true);

  const { data, isLoading, isError, refetch } = useQuery<AvailabilityResponseDto>({
    queryKey: ['availability-search', activeTenantId, activeBranchId, checkIn, checkOut, adults, children],
    queryFn: async () => {
      const params = new URLSearchParams({
        branchId: activeBranchId,
        checkIn,
        checkOut,
        adults: String(adults),
        children: String(children),
      });
      const res = await fetch(`/api/v1/availability?${params.toString()}`, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) throw new Error('Failed to query availability');
      return res.json();
    },
    enabled: hasSearched && !!checkIn && !!checkOut && checkOut > checkIn,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
    refetch();
  };

  return (
    <div className="card shadow-sm border-0 mb-4 rounded-3 overflow-hidden">
      <div className="card-header bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center gap-2">
          <div className="rounded-circle bg-primary-subtle text-primary p-2 d-flex align-items-center justify-content-center" style={{ width: 36, height: 36 }}>
            <i className="bi bi-search fs-6" />
          </div>
          <div>
            <h6 className="fw-bold mb-0 text-dark">Real-Time Availability & Rate Finder</h6>
            <span className="text-muted small">Live inventory checking across room types & rate plans</span>
          </div>
        </div>

        {data && (
          <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-2 fw-semibold">
            {data.nightsCount} Night{data.nightsCount > 1 ? 's' : ''} Stay
          </span>
        )}
      </div>

      <div className="card-body p-4 bg-light-subtle">
        <form onSubmit={handleSearch} className="row g-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label small fw-bold text-muted mb-1">Check-In Date</label>
            <div className="input-group input-group-sm shadow-sm">
              <span className="input-group-text bg-white border-end-0">
                <i className="bi bi-calendar-check text-primary" />
              </span>
              <input
                type="date"
                className="form-control border-start-0"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="col-md-3">
            <label className="form-label small fw-bold text-muted mb-1">Check-Out Date</label>
            <div className="input-group input-group-sm shadow-sm">
              <span className="input-group-text bg-white border-end-0">
                <i className="bi bi-calendar-x text-primary" />
              </span>
              <input
                type="date"
                className="form-control border-start-0"
                min={checkIn}
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="col-md-2">
            <label className="form-label small fw-bold text-muted mb-1">Adults</label>
            <div className="input-group input-group-sm shadow-sm">
              <span className="input-group-text bg-white border-end-0">
                <i className="bi bi-people text-secondary" />
              </span>
              <select
                className="form-select border-start-0"
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value))}
              >
                <option value={1}>1 Adult</option>
                <option value={2}>2 Adults</option>
                <option value={3}>3 Adults</option>
                <option value={4}>4 Adults</option>
              </select>
            </div>
          </div>

          <div className="col-md-2">
            <label className="form-label small fw-bold text-muted mb-1">Children</label>
            <div className="input-group input-group-sm shadow-sm">
              <span className="input-group-text bg-white border-end-0">
                <i className="bi bi-person text-secondary" />
              </span>
              <select
                className="form-select border-start-0"
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

          <div className="col-md-2">
            <button
              type="submit"
              className="btn btn-sm btn-primary w-100 fw-semibold d-flex align-items-center justify-content-center gap-2 shadow-sm"
              disabled={isLoading || checkOut <= checkIn}
            >
              {isLoading ? (
                <span className="spinner-border spinner-border-sm" role="status" />
              ) : (
                <>
                  <i className="bi bi-lightning-charge-fill" />
                  <span>Search Rates</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Results Grid */}
        {isLoading && (
          <div className="text-center py-4 text-muted small">
            <div className="spinner-border text-primary spinner-border-sm me-2" role="status" />
            Calculating live inventory and tax rules...
          </div>
        )}

        {isError && (
          <div className="alert alert-danger py-2 mt-3 small">
            Unable to check room availability. Please verify dates and network status.
          </div>
        )}

        {data && data.results && (
          <div className="mt-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span className="fw-bold small text-dark">
                {data.results.length} Room Types Available for Selected Dates
              </span>
              <span className="text-muted small">
                Currency: <strong className="text-dark">USD</strong>
              </span>
            </div>

            <div className="row g-3">
              {data.results.map((room) => {
                const isAvail = room.availableUnitsCount > 0;
                const bestPlan = room.ratePlans && room.ratePlans.length > 0 ? room.ratePlans[0] : null;
                return (
                  <div key={room.unitTypeId} className="col-md-6 col-lg-4">
                    <div
                      className={`card h-100 border shadow-sm rounded-3 transition-all ${
                        isAvail ? 'border-primary-subtle' : 'opacity-75 bg-light'
                      }`}
                    >
                      <div className="card-body p-3 d-flex flex-column justify-content-between">
                        <div>
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <span className="badge bg-light text-primary border fw-bold">
                              {room.code}
                            </span>
                            <span
                              className={`badge px-2 py-1 ${
                                isAvail
                                  ? 'bg-success-subtle text-success border border-success-subtle'
                                  : 'bg-danger-subtle text-danger border border-danger-subtle'
                              }`}
                            >
                              {isAvail ? `${room.availableUnitsCount} Available` : 'Sold Out'}
                            </span>
                          </div>

                          <h6 className="fw-bold text-dark mb-1">{room.name}</h6>
                          <span className="text-muted small d-block mb-3">
                            Max {room.maxAdults} Adults • Max {room.maxOccupancy} Guests
                          </span>

                          {bestPlan && (
                            <div className="p-2 bg-light rounded-2 border mb-3">
                              <div className="d-flex justify-content-between align-items-center mb-1">
                                <span className="small text-muted">{bestPlan.name}</span>
                                <span className="fw-bold text-dark">
                                  ${bestPlan.averageNightlyRate.toFixed(2)}/nt
                                </span>
                              </div>
                              <div className="d-flex justify-content-between align-items-center small text-muted">
                                <span>Total (incl. taxes):</span>
                                <span className="fw-bold text-primary">
                                  ${bestPlan.totalAmount.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          className={`btn btn-sm w-100 fw-semibold d-flex align-items-center justify-content-center gap-2 ${
                            isAvail ? 'btn-outline-primary' : 'btn-light disabled text-muted'
                          }`}
                          disabled={!isAvail}
                          onClick={() => onSelectResult && onSelectResult(room, { checkIn, checkOut, adults, children })}
                        >
                          <i className="bi bi-calendar-plus" />
                          <span>Book {room.code}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
