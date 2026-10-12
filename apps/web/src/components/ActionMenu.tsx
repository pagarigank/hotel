import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BoardUnitDto } from '@innkeeper/contracts';
import { useAppStore } from '../stores/useAppStore';

interface ActionDef {
  id: string;
  code: string;
  label: string;
  icon?: string;
  groupCode?: string;
  permission: string;
  visibleWhen: any;
  target: any;
  sort: number;
}

interface ActionMenuProps {
  unit: BoardUnitDto | null;
  onClose: () => void;
  onStatusTransition: (unit: BoardUnitDto, toStatus: string) => void;
  onOpenBlockModal: (unit: BoardUnitDto) => void;
  onOpenReleaseBlock: (unit: BoardUnitDto) => void;
  onOpenWalkIn?: (unit: BoardUnitDto) => void;
}

export const ActionMenu: React.FC<ActionMenuProps> = ({
  unit,
  onClose,
  onStatusTransition,
  onOpenBlockModal,
  onOpenReleaseBlock,
  onOpenWalkIn,
}) => {
  const { activeTenantId, activeBranchId } = useAppStore();

  const { data: actions, isLoading } = useQuery<ActionDef[]>({
    queryKey: ['unit-actions', activeTenantId, unit?.statusCode],
    queryFn: async () => {
      if (!unit) return [];
      const res = await fetch(
        `/api/v1/ui/actions?entity=unit&status=${unit.statusCode}&branchId=${activeBranchId}`,
        {
          headers: {
            'X-Tenant-Id': activeTenantId,
            'X-Branch-Id': activeBranchId,
            'X-Permissions': '*',
          },
        },
      );
      if (!res.ok) throw new Error('Failed to load actions');
      return res.json();
    },
    enabled: !!unit,
  });

  if (!unit) return null;

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)' }}
      tabIndex={-1}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        style={{ maxWidth: '440px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content shadow-lg border-0 rounded-3">
          {/* Header */}
          <div className="modal-header border-bottom bg-light px-4 py-3">
            <div className="d-flex align-items-center gap-2">
              <div
                className="rounded-3 d-flex align-items-center justify-content-center fw-bold font-monospace"
                style={{
                  width: '42px',
                  height: '42px',
                  backgroundColor: `var(--${unit.colorToken}-bg, #e2e8f0)`,
                  color: `var(--${unit.colorToken}-accent, #2f6fed)`,
                  border: `2px solid var(--${unit.colorToken}-accent, #2f6fed)`,
                  fontSize: '1.2rem',
                }}
              >
                {unit.number}
              </div>
              <div>
                <div className="d-flex align-items-center gap-2">
                  <h6 className="modal-title fw-bold mb-0">Room {unit.number}</h6>
                  <span className="badge bg-white text-secondary border">{unit.unitTypeCode}</span>
                </div>
                <span className="text-muted small">
                  {unit.floorName || `Floor ${unit.floor}`} • {unit.unitTypeName}
                </span>
              </div>
            </div>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>

          {/* Body */}
          <div className="modal-body p-4 d-flex flex-column gap-3">
            {/* Status Strip */}
            <div
              className="p-3 rounded-3 border d-flex justify-content-between align-items-center"
              style={{
                backgroundColor: `var(--${unit.colorToken}-bg, #f8f9fa)`,
                borderLeft: `4px solid var(--${unit.colorToken}-accent, #2f6fed)`,
              }}
            >
              <div>
                <span className="text-muted small d-block">Current Status</span>
                <span className="fw-bold d-flex align-items-center gap-2" style={{ color: `var(--${unit.colorToken}-fg, #1e293b)` }}>
                  <i className={`bi ${unit.icon || 'bi-circle-fill'}`} />
                  {unit.statusLabel}
                </span>
              </div>

              {/* Context Pill */}
              {unit.guestName && (
                <div className="text-end">
                  <span className="text-muted small d-block">In-House Guest</span>
                  <span className="fw-semibold text-dark small">{unit.guestName}</span>
                </div>
              )}
            </div>

            {/* Quick Walk-In Arrival (Phase 3 3-Click Fast Action) */}
            {onOpenWalkIn && (unit.isSellable || unit.statusCode.startsWith('vacant')) && (
              <button
                type="button"
                className="btn btn-warning text-dark fw-bold d-flex align-items-center justify-content-between p-2 rounded-2 shadow-sm border-0"
                onClick={() => {
                  onClose();
                  onOpenWalkIn(unit);
                }}
              >
                <span className="d-flex align-items-center gap-2">
                  <i className="bi bi-lightning-charge-fill text-dark fs-5" />
                  <span>Quick Walk-In Arrival (3-Click)</span>
                </span>
                <span className="badge bg-dark text-warning">Walk-In</span>
              </button>
            )}

            {/* Server-Driven Actions Section */}
            <div>
              <span className="text-uppercase text-muted fw-bold small d-block mb-2" style={{ fontSize: '0.72rem', letterSpacing: '0.05em' }}>
                Server-Driven Context Actions
              </span>

              {isLoading ? (
                <div className="text-muted small p-2">Loading actions...</div>
              ) : actions && actions.length > 0 ? (
                <div className="d-flex flex-column gap-2">
                  {actions.map((act) => (
                    <button
                      key={act.id}
                      type="button"
                      className="btn btn-outline-primary text-start d-flex align-items-center justify-content-between p-2 rounded-2 fw-semibold"
                      onClick={() => {
                        if (act.code === 'mark_clean') onStatusTransition(unit, 'vacant_clean');
                        else if (act.code === 'block_unit') onOpenBlockModal(unit);
                        else onClose();
                      }}
                    >
                      <span className="d-flex align-items-center gap-2">
                        <i className={`bi ${act.icon || 'bi-lightning-charge'} fs-5`} />
                        <span>{act.label}</span>
                      </span>
                      <span className="badge bg-light text-muted border" style={{ fontSize: '0.65rem' }}>
                        {act.groupCode || 'action'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-muted small p-2">No context actions configured for this state.</div>
              )}
            </div>

            {/* Quick State Transitions */}
            <div className="pt-2 border-top">
              <span className="text-uppercase text-muted fw-bold small d-block mb-2" style={{ fontSize: '0.72rem', letterSpacing: '0.05em' }}>
                Quick Status Transitions
              </span>

              <div className="d-flex flex-wrap gap-2">
                {unit.statusCode === 'vacant_dirty' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-success d-flex align-items-center gap-1 fw-semibold"
                    onClick={() => onStatusTransition(unit, 'vacant_clean')}
                  >
                    <i className="bi bi-check2-circle" /> Mark Clean
                  </button>
                )}

                {unit.statusCode === 'vacant_clean' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-info text-white d-flex align-items-center gap-1 fw-semibold"
                    onClick={() => onStatusTransition(unit, 'inspected')}
                  >
                    <i className="bi bi-patch-check" /> Inspect Room
                  </button>
                )}

                {unit.statusCode !== 'out_of_order' ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1 fw-semibold"
                    onClick={() => onOpenBlockModal(unit)}
                  >
                    <i className="bi bi-slash-circle" /> Block (OOO)
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-success d-flex align-items-center gap-1 fw-semibold"
                    onClick={() => onOpenReleaseBlock(unit)}
                  >
                    <i className="bi bi-check-circle" /> Release OOO Block
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer bg-light px-4 py-2">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
