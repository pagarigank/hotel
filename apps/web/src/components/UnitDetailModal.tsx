import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardUnitDto, UnitStatusLogDto } from '@innkeeper/contracts';
import { useAppStore } from '../stores/useAppStore';

interface UnitDetailModalProps {
  unit: BoardUnitDto | null;
  isOpen: boolean;
  onClose: () => void;
  onChangeStatus: (unit: BoardUnitDto) => void;
  onOpenBlock: (unit: BoardUnitDto) => void;
  onReleaseBlock: (unit: BoardUnitDto) => void;
}

export const UnitDetailModal: React.FC<UnitDetailModalProps> = ({
  unit,
  isOpen,
  onClose,
  onChangeStatus,
  onOpenBlock,
  onReleaseBlock,
}) => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();
  const [activeTab, setActiveTab] = useState<'specs' | 'photos' | 'maintenance' | 'notes'>('specs');
  const [operationalNotes, setOperationalNotes] = useState('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 1. Fetch unit status log
  const { data: statusLog, isLoading: isLogLoading } = useQuery<UnitStatusLogDto[]>({
    queryKey: ['unit-status-log', activeTenantId, unit?.id],
    queryFn: async () => {
      if (!unit?.id) return [];
      const res = await fetch(`/api/v1/properties/units/${unit.id}/status-log`, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isOpen && !!unit?.id,
  });

  // 2. Fetch full unit details (including inherited type attributes and attrs)
  const { data: unitDetail, refetch: refetchUnit } = useQuery({
    queryKey: ['unit-detail', activeTenantId, unit?.id],
    queryFn: async () => {
      if (!unit?.id) return null;
      const res = await fetch(`/api/v1/properties/units/${unit.id}`, {
        headers: {
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isOpen && !!unit?.id,
  });

  // Sync notes when unitDetail loads
  useEffect(() => {
    if (unitDetail?.attrs?.operationalNotes) {
      setOperationalNotes(unitDetail.attrs.operationalNotes);
    } else {
      setOperationalNotes('');
    }
    setSaveSuccess(false);
  }, [unitDetail]);

  // 3. Save operational notes mutation
  const saveNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      if (!unit?.id) return;
      const currentAttrs = unitDetail?.attrs || {};
      const res = await fetch(`/api/v1/properties/units/${unit.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          attrs: {
            ...currentAttrs,
            operationalNotes: notes,
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to save operational notes');
      return res.json();
    },
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      refetchUnit();
      queryClient.invalidateQueries({ queryKey: ['board', activeTenantId, activeBranchId] });
    },
  });

  if (!isOpen || !unit) return null;

  const inherited = unitDetail?.attrs?.inherited || {};
  const maxOccupancy = inherited.maxOccupancy ?? 2;
  const maxAdults = inherited.maxAdults ?? 2;
  const maxChildren = inherited.maxChildren ?? 0;
  const baseRate = inherited.baseRate ?? 0;

  // Sample photo gallery curated for room types
  const defaultPhotos = [
    {
      title: 'Main Bedroom View',
      caption: `Contemporary interior setup for ${unit.unitTypeName}`,
      url: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80',
    },
    {
      title: 'Bathroom & Vanity',
      caption: 'Marble vanity with premium amenities',
      url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80',
    },
    {
      title: 'Work Desk & Seating',
      caption: 'Ergonomic workstation and high-speed Wi-Fi',
      url: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=800&q=80',
    },
  ];

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)', zIndex: 1060 }}
      tabIndex={-1}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content shadow-lg border-0 rounded-3">
          {/* Header */}
          <div className="modal-header border-bottom bg-light px-4 py-3">
            <div className="d-flex align-items-center gap-3">
              <div
                className="rounded-3 d-flex align-items-center justify-content-center fw-bold font-monospace"
                style={{
                  width: '48px',
                  height: '48px',
                  backgroundColor: `var(--${unit.colorToken}-bg, #e2e8f0)`,
                  color: `var(--${unit.colorToken}-accent, #2f6fed)`,
                  border: `2px solid var(--${unit.colorToken}-accent, #2f6fed)`,
                  fontSize: '1.35rem',
                }}
              >
                {unit.number}
              </div>
              <div>
                <div className="d-flex align-items-center gap-2">
                  <h5 className="modal-title fw-bold mb-0">Room {unit.number}</h5>
                  <span className="badge bg-white text-secondary border px-2 py-1">
                    {unit.unitTypeCode}
                  </span>
                  <span
                    className="badge d-flex align-items-center gap-1 border"
                    style={{
                      backgroundColor: `var(--${unit.colorToken}-bg, #f8f9fa)`,
                      color: `var(--${unit.colorToken}-fg, #1e293b)`,
                      borderColor: `var(--${unit.colorToken}-accent, #cbd5e1)`,
                    }}
                  >
                    <i className={`bi ${unit.icon || 'bi-circle-fill'}`} />
                    {unit.statusLabel}
                  </span>
                </div>
                <span className="text-muted small">
                  {unit.floorName || `Floor ${unit.floor || '1'}`} {unit.building ? `• ${unit.building}` : ''} • {unit.unitTypeName}
                </span>
              </div>
            </div>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>

          {/* Navigation Tabs */}
          <div className="px-4 pt-2 border-bottom bg-light">
            <ul className="nav nav-tabs border-0" role="tablist">
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link fw-semibold border-0 py-2 px-3 ${
                    activeTab === 'specs' ? 'active bg-white border-bottom border-primary text-primary' : 'text-muted'
                  }`}
                  onClick={() => setActiveTab('specs')}
                >
                  <i className="bi bi-sliders me-1" />
                  Specifications
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link fw-semibold border-0 py-2 px-3 ${
                    activeTab === 'photos' ? 'active bg-white border-bottom border-primary text-primary' : 'text-muted'
                  }`}
                  onClick={() => setActiveTab('photos')}
                >
                  <i className="bi bi-images me-1" />
                  Photos Gallery
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link fw-semibold border-0 py-2 px-3 ${
                    activeTab === 'maintenance' ? 'active bg-white border-bottom border-primary text-primary' : 'text-muted'
                  }`}
                  onClick={() => setActiveTab('maintenance')}
                >
                  <i className="bi bi-tools me-1" />
                  Maintenance & Status History
                  {statusLog && statusLog.length > 0 && (
                    <span className="badge rounded-pill bg-light text-dark border ms-1 py-0 px-1">
                      {statusLog.length}
                    </span>
                  )}
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link fw-semibold border-0 py-2 px-3 ${
                    activeTab === 'notes' ? 'active bg-white border-bottom border-primary text-primary' : 'text-muted'
                  }`}
                  onClick={() => setActiveTab('notes')}
                >
                  <i className="bi bi-journal-text me-1" />
                  Operational Notes
                </button>
              </li>
            </ul>
          </div>

          {/* Body */}
          <div className="modal-body p-4 d-flex flex-column gap-4" style={{ minHeight: '380px' }}>
            {/* Active Block Warning Banner */}
            {unit.activeBlock && (
              <div className="p-3 bg-danger-subtle border border-danger-subtle rounded-3 d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-3">
                  <div
                    className="rounded-circle bg-danger text-white d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: '38px', height: '38px' }}
                  >
                    <i className="bi bi-slash-circle fs-5" />
                  </div>
                  <div>
                    <h6 className="fw-bold mb-0 text-danger-emphasis">
                      Active {unit.activeBlock.blockType === 'out_of_order' ? 'Out-of-Order (OOO)' : 'Out-of-Service (OOS)'} Block
                    </h6>
                    <span className="small text-danger">
                      Reason: <strong>{unit.activeBlock.reason}</strong> • Range: {unit.activeBlock.fromDate} to {unit.activeBlock.toDate}
                    </span>
                    {unit.activeBlock.notes && (
                      <div className="small text-muted mt-1 fst-italic">"{unit.activeBlock.notes}"</div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger fw-semibold"
                  onClick={() => onReleaseBlock(unit)}
                >
                  <i className="bi bi-check-circle me-1" />
                  Release Block
                </button>
              </div>
            )}

            {/* TAB 1: Specifications */}
            {activeTab === 'specs' && (
              <div className="d-flex flex-column gap-4">
                {/* Specs Grid */}
                <div>
                  <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
                    <i className="bi bi-sliders text-primary" />
                    Room Specifications & Setup
                  </h6>
                  <div className="row g-3">
                    <div className="col-md-3 col-6">
                      <div className="p-3 bg-light rounded-3 border">
                        <span className="text-muted small d-block">Room Number</span>
                        <span className="fw-bold font-monospace fs-5">{unit.number}</span>
                      </div>
                    </div>
                    <div className="col-md-3 col-6">
                      <div className="p-3 bg-light rounded-3 border">
                        <span className="text-muted small d-block">Category</span>
                        <span className="fw-semibold text-dark">{unit.unitTypeName}</span>
                      </div>
                    </div>
                    <div className="col-md-3 col-6">
                      <div className="p-3 bg-light rounded-3 border">
                        <span className="text-muted small d-block">Location</span>
                        <span className="fw-semibold text-dark">{unit.floorName || `Floor ${unit.floor || '1'}`}</span>
                      </div>
                    </div>
                    <div className="col-md-3 col-6">
                      <div className="p-3 bg-light rounded-3 border">
                        <span className="text-muted small d-block">Building</span>
                        <span className="fw-semibold text-dark">{unit.building || 'Main Wing'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inherited Attributes from Unit Type */}
                <div>
                  <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
                    <i className="bi bi-diagram-3 text-primary" />
                    Type Attributes & Inherited Capacity (REQ-PRP-007)
                  </h6>
                  <div className="row g-3">
                    <div className="col-md-3 col-6">
                      <div className="p-3 bg-light rounded-3 border">
                        <span className="text-muted small d-block">Max Adults</span>
                        <span className="fw-bold text-dark">{maxAdults} Adults</span>
                      </div>
                    </div>
                    <div className="col-md-3 col-6">
                      <div className="p-3 bg-light rounded-3 border">
                        <span className="text-muted small d-block">Max Children</span>
                        <span className="fw-bold text-dark">{maxChildren} Children</span>
                      </div>
                    </div>
                    <div className="col-md-3 col-6">
                      <div className="p-3 bg-light rounded-3 border">
                        <span className="text-muted small d-block">Total Max Occupancy</span>
                        <span className="fw-bold text-primary">{maxOccupancy} Guests</span>
                      </div>
                    </div>
                    <div className="col-md-3 col-6">
                      <div className="p-3 bg-light rounded-3 border">
                        <span className="text-muted small d-block">Base Nightly Rate</span>
                        <span className="fw-bold text-success font-monospace">₱{baseRate.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Operational Status Flags */}
                <div>
                  <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
                    <i className="bi bi-check2-square text-primary" />
                    Operational Status Flags
                  </h6>
                  <div className="d-flex flex-wrap gap-2">
                    <span className={`badge px-3 py-2 border ${unit.isSellable ? 'bg-success-subtle text-success border-success-subtle' : 'bg-secondary-subtle text-muted'}`}>
                      <i className={`bi ${unit.isSellable ? 'bi-check2' : 'bi-x'} me-1`} />
                      {unit.isSellable ? 'Sellable / Bookable' : 'Stop Sell'}
                    </span>
                    <span className={`badge px-3 py-2 border ${unit.isOccupied ? 'bg-primary-subtle text-primary border-primary-subtle' : 'bg-light text-muted'}`}>
                      <i className={`bi ${unit.isOccupied ? 'bi-person-fill' : 'bi-door-closed'} me-1`} />
                      {unit.isOccupied ? 'Physically Occupied' : 'Vacant'}
                    </span>
                    <span className={`badge px-3 py-2 border ${unit.isDirty ? 'bg-warning-subtle text-warning-emphasis border-warning-subtle' : 'bg-light text-muted'}`}>
                      <i className={`bi ${unit.isDirty ? 'bi-brush' : 'bi-check2-circle'} me-1`} />
                      {unit.isDirty ? 'Dirty / Needs HK' : 'Clean'}
                    </span>
                    {unit.connectingUnitNumber && (
                      <span className="badge bg-info-subtle text-info border border-info-subtle px-3 py-2">
                        <i className="bi bi-link-45deg me-1" />
                        Connecting to Room {unit.connectingUnitNumber}
                      </span>
                    )}
                    {unit.vipStatus && (
                      <span className="badge bg-warning text-dark px-3 py-2 fw-bold">
                        <i className="bi bi-star-fill me-1" />
                        VIP {unit.vipStatus}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stay & Guest Information if active */}
                {unit.guestName && (
                  <div className="p-3 bg-light rounded-3 border">
                    <h6 className="fw-bold text-dark mb-2 d-flex align-items-center gap-2">
                      <i className="bi bi-person-badge text-primary" />
                      Current Guest Details
                    </h6>
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <span className="fw-semibold text-dark fs-6 d-block">{unit.guestName}</span>
                        <span className="text-muted small">
                          {unit.eta ? `Arrived: ${unit.eta}` : ''} {unit.etd ? `• Departure: ${unit.etd}` : ''}
                        </span>
                      </div>
                      {unit.vipStatus && (
                        <span className="badge bg-warning text-dark px-2 py-1 fw-bold">
                          VIP Level {unit.vipStatus}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Photos Gallery */}
            {activeTab === 'photos' && (
              <div className="d-flex flex-column gap-3">
                <div className="d-flex justify-content-between align-items-center">
                  <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                    <i className="bi bi-images text-primary" />
                    Room & Suite Gallery ({defaultPhotos.length} Images)
                  </h6>
                  <span className="badge bg-light text-muted border">
                    {defaultPhotos[selectedPhotoIndex].title}
                  </span>
                </div>

                {/* Active Photo Display */}
                <div
                  className="rounded-3 border overflow-hidden position-relative bg-dark"
                  style={{ height: '300px' }}
                >
                  <img
                    src={defaultPhotos[selectedPhotoIndex].url}
                    alt={defaultPhotos[selectedPhotoIndex].title}
                    className="w-100 h-100 object-fit-cover"
                  />
                  <div
                    className="position-absolute bottom-0 start-0 end-0 p-3"
                    style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.75))' }}
                  >
                    <h6 className="text-white fw-bold mb-0">
                      {defaultPhotos[selectedPhotoIndex].title}
                    </h6>
                    <small className="text-white-50">
                      {defaultPhotos[selectedPhotoIndex].caption}
                    </small>
                  </div>
                </div>

                {/* Thumbnail Strip */}
                <div className="d-flex gap-2 overflow-x-auto pb-2">
                  {defaultPhotos.map((photo, idx) => (
                    <div
                      key={idx}
                      className={`rounded-2 border overflow-hidden cursor-pointer flex-shrink-0 transition-all ${
                        selectedPhotoIndex === idx ? 'ring-2 ring-primary border-primary' : 'opacity-75'
                      }`}
                      style={{ width: '100px', height: '65px' }}
                      onClick={() => setSelectedPhotoIndex(idx)}
                    >
                      <img
                        src={photo.url}
                        alt={photo.title}
                        className="w-100 h-100 object-fit-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: Maintenance & Status History */}
            {activeTab === 'maintenance' && (
              <div className="d-flex flex-column gap-3">
                <div className="d-flex justify-content-between align-items-center">
                  <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                    <i className="bi bi-tools text-primary" />
                    Status Transition & Maintenance Audit Log
                  </h6>
                  <span className="text-muted small">
                    Directly fetched from <code className="text-primary">unit_status_log</code>
                  </span>
                </div>

                {isLogLoading ? (
                  <div className="p-4 text-center">
                    <div className="spinner-border spinner-border-sm text-primary mb-2" role="status" />
                    <div className="text-muted small">Loading status history...</div>
                  </div>
                ) : !statusLog || statusLog.length === 0 ? (
                  <div className="p-4 text-center bg-light rounded-3 border text-muted">
                    <i className="bi bi-clock-history fs-3 d-block mb-1" />
                    <span>No recorded status changes or maintenance events for Room {unit.number}.</span>
                  </div>
                ) : (
                  <div className="table-responsive border rounded-3">
                    <table className="table table-sm table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th className="small text-muted">Timestamp</th>
                          <th className="small text-muted">From</th>
                          <th className="small text-muted">To</th>
                          <th className="small text-muted">Reason / Order</th>
                          <th className="small text-muted">Changed By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statusLog.map((log) => (
                          <tr key={log.id}>
                            <td className="small font-monospace text-muted">
                              {new Date(log.createdAt).toLocaleString()}
                            </td>
                            <td>
                              <span className="badge bg-light text-secondary border font-monospace small">
                                {log.fromStatus}
                              </span>
                            </td>
                            <td>
                              <span className="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace small">
                                {log.toStatus}
                              </span>
                            </td>
                            <td className="small">
                              {log.reason ? (
                                <span className="fw-semibold text-dark">{log.reason}</span>
                              ) : (
                                <span className="text-muted italic">—</span>
                              )}
                            </td>
                            <td className="small text-muted">
                              {log.changedByName || 'System'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: Operational Notes */}
            {activeTab === 'notes' && (
              <div className="d-flex flex-column gap-3">
                <div className="d-flex justify-content-between align-items-center">
                  <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                    <i className="bi bi-journal-text text-primary" />
                    Operational & Housekeeping Notes
                  </h6>
                  {saveSuccess && (
                    <span className="badge bg-success-subtle text-success border border-success-subtle">
                      <i className="bi bi-check2 me-1" />
                      Notes saved successfully
                    </span>
                  )}
                </div>

                <p className="text-muted small mb-0">
                  Record room-specific operational observations, guest preferences, deep cleaning schedules, or maintenance notes. These are persisted onto the unit record.
                </p>

                <div>
                  <textarea
                    className="form-control"
                    rows={6}
                    placeholder="e.g. Feather pillow replacement requested by frequent guest; AC filter replaced during week 41 maintenance; balcony door lock latch lubricated."
                    value={operationalNotes}
                    onChange={(e) => setOperationalNotes(e.target.value)}
                  />
                </div>

                <div className="d-flex justify-content-end">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary d-flex align-items-center gap-1 fw-semibold"
                    disabled={saveNotesMutation.isPending}
                    onClick={() => saveNotesMutation.mutate(operationalNotes)}
                  >
                    {saveNotesMutation.isPending ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <i className="bi bi-save" />
                        <span>Save Notes</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="modal-footer bg-light px-4 py-3 d-flex justify-content-between">
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary fw-semibold"
                onClick={() => onChangeStatus(unit)}
              >
                <i className="bi bi-arrow-repeat me-1" />
                Transition Status
              </button>

              {!unit.activeBlock ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger fw-semibold"
                  onClick={() => onOpenBlock(unit)}
                >
                  <i className="bi bi-slash-circle me-1" />
                  Place OOO Block
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success fw-semibold"
                  onClick={() => onReleaseBlock(unit)}
                >
                  <i className="bi bi-check-circle me-1" />
                  Release Block
                </button>
              )}
            </div>

            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
