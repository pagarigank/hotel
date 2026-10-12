import React from 'react';
import type { BoardUnitDto } from '@innkeeper/contracts';

interface UnitTileProps {
  unit: BoardUnitDto;
  density?: 'compact' | 'comfortable' | 'large';
  onClick: (unit: BoardUnitDto) => void;
  onActionClick?: (unit: BoardUnitDto, e: React.MouseEvent) => void;
  tabIndex?: number;
}

export const UnitTile: React.FC<UnitTileProps> = ({
  unit,
  density = 'comfortable',
  onClick,
  onActionClick,
  tabIndex = 0,
}) => {
  const isCompact = density === 'compact';
  const isLarge = density === 'large';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(unit);
    }
  };

  return (
    <div
      role="button"
      tabIndex={tabIndex}
      aria-label={`Room ${unit.number}, Type ${unit.unitTypeCode}, Status ${unit.statusLabel}`}
      className="unit-tile position-relative rounded-3 border transition-all text-start cursor-pointer select-none"
      onClick={() => onClick(unit)}
      onKeyDown={handleKeyDown}
      style={{
        backgroundColor: `var(--${unit.colorToken}-bg, #f8f9fa)`,
        borderLeft: `4px solid var(--${unit.colorToken}-accent, #2f6fed)`,
        color: `var(--${unit.colorToken}-fg, #1f2937)`,
        padding: isCompact ? '0.45rem 0.6rem' : isLarge ? '0.85rem 1rem' : '0.65rem 0.8rem',
        minHeight: isCompact ? '70px' : isLarge ? '125px' : '98px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        outlineOffset: '2px',
      }}
    >
      {/* Top Row: Unit Number, Type Badge & Action Trigger */}
      <div className="d-flex justify-content-between align-items-center mb-1">
        <div className="d-flex align-items-center gap-1">
          <span
            className="fw-bold font-monospace"
            style={{ fontSize: isCompact ? '1.05rem' : isLarge ? '1.4rem' : '1.2rem', lineHeight: 1.1 }}
          >
            {unit.number}
          </span>
          <span
            className="badge bg-white text-secondary border px-1 py-0 fw-semibold"
            style={{ fontSize: '0.65rem', verticalAlign: 'middle' }}
          >
            {unit.unitTypeCode}
          </span>
        </div>

        <button
          type="button"
          className="btn btn-sm btn-link text-muted p-0 opacity-75 hover-opacity-100"
          title="Open Actions"
          aria-label={`Open actions for room ${unit.number}`}
          onClick={(e) => {
            e.stopPropagation();
            if (onActionClick) onActionClick(unit, e);
            else onClick(unit);
          }}
        >
          <i className="bi bi-three-dots-vertical fs-6" />
        </button>
      </div>

      {/* Middle Row: Status Badge (Icon + Label, WCAG 2.2 compliant) */}
      <div className="d-flex align-items-center gap-1 mb-1">
        <span
          className="badge d-inline-flex align-items-center gap-1 py-1 px-2 border"
          style={{
            backgroundColor: '#ffffff',
            color: `var(--${unit.colorToken}-accent, #2f6fed)`,
            borderColor: `var(--${unit.colorToken}-accent, #2f6fed)`,
            fontSize: isCompact ? '0.65rem' : '0.72rem',
            fontWeight: 600,
          }}
        >
          <i className={`bi ${unit.icon || 'bi-circle-fill'}`} style={{ fontSize: '0.75rem' }} />
          <span>{unit.statusLabel}</span>
        </span>

        {unit.vipStatus && (
          <span className="badge bg-warning text-dark border px-1 py-0 fw-bold" style={{ fontSize: '0.62rem' }}>
            <i className="bi bi-star-fill me-1" />
            {unit.vipStatus.toUpperCase()}
          </span>
        )}
      </div>

      {/* Bottom Row: Operational Context Line */}
      {!isCompact && (
        <div
          className="text-truncate"
          style={{
            fontSize: '0.74rem',
            color: `var(--${unit.colorToken}-fg, #475569)`,
            fontWeight: 500,
          }}
        >
          {unit.guestName ? (
            <span className="d-flex align-items-center gap-1">
              <i className="bi bi-person-fill text-muted" style={{ fontSize: '0.75rem' }} />
              <span className="text-truncate">{unit.guestName}</span>
            </span>
          ) : unit.activeBlock ? (
            <span className="text-danger d-flex align-items-center gap-1">
              <i className="bi bi-slash-circle-fill" style={{ fontSize: '0.75rem' }} />
              <span className="text-truncate">{unit.activeBlock.reason}</span>
            </span>
          ) : unit.statusCode === 'due_in' && unit.eta ? (
            <span className="d-flex align-items-center gap-1">
              <i className="bi bi-box-arrow-in-right text-muted" style={{ fontSize: '0.75rem' }} />
              <span>ETA {unit.eta}</span>
            </span>
          ) : unit.statusCode === 'due_out' && unit.etd ? (
            <span className="d-flex align-items-center gap-1">
              <i className="bi bi-box-arrow-right text-muted" style={{ fontSize: '0.75rem' }} />
              <span>ETD {unit.etd}</span>
            </span>
          ) : unit.statusCode === 'vacant_clean' || unit.statusCode === 'inspected' ? (
            <span className="text-success d-flex align-items-center gap-1">
              <i className="bi bi-check2 text-success" />
              <span>Ready for arrival</span>
            </span>
          ) : unit.statusCode === 'vacant_dirty' ? (
            <span className="text-warning-emphasis d-flex align-items-center gap-1">
              <i className="bi bi-brush text-warning-emphasis" />
              <span>Needs inspection/clean</span>
            </span>
          ) : (
            <span>{unit.unitTypeName}</span>
          )}
        </div>
      )}
    </div>
  );
};
