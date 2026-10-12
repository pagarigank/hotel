import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardResponseDto, BoardUnitDto } from '@innkeeper/contracts';
import { useAppStore } from '../stores/useAppStore';
import { getAuthSnapshot } from '../lib/http.js';
import { UnitTile } from './UnitTile';
import { ActionMenu } from './ActionMenu';
import { StatusTransitionModal } from './StatusTransitionModal';
import { UnitBlockModal } from './UnitBlockModal';
import { BulkUnitModal } from './BulkUnitModal';
import { UnitDetailModal } from './UnitDetailModal';
import { WalkInModal } from './WalkInModal';
import { TimelineStayChart } from './TimelineStayChart';
import { UnitFormModal } from './UnitFormModal';

export const BoardGrid: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, activeBranchName, businessDate } = useAppStore();

  // State
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'large'>('comfortable');
  const [viewMode, setViewMode] = useState<'grid' | 'timeline' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [floorFilter, setFloorFilter] = useState<string>('all');
  const [presetFilter, setPresetFilter] = useState<'all' | 'clean' | 'dirty' | 'occupied' | 'blocked' | 'connecting'>('all');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    number: true,
    type: true,
    floor: true,
    building: true,
    status: true,
    guest: true,
    block: true,
    connecting: true,
    actions: true,
  });
  const [isColumnChooserOpen, setIsColumnChooserOpen] = useState(false);
  const [sortField, setSortField] = useState<'number' | 'floor' | 'type' | 'status'>('number');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [sseConnected, setSseConnected] = useState(false);

  // Modals state
  const [selectedUnit, setSelectedUnit] = useState<BoardUnitDto | null>(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState('vacant_clean');
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isUnitFormModalOpen, setIsUnitFormModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<BoardUnitDto | null>(null);

  // Keyboard navigation roving tabindex
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Compact Rooms Board Read Model
  const boardQueryKey = ['board', activeTenantId, activeBranchId] as const;
  const {
    data: boardData,
    isLoading,
    isError,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery<BoardResponseDto>({
    queryKey: boardQueryKey,
    queryFn: async () => {
      const cached = queryClient.getQueryData<BoardResponseDto>(boardQueryKey);
      const headers: Record<string, string> = {
        'X-Tenant-Id': activeTenantId,
        'X-Branch-Id': activeBranchId,
      };
      // Conditional request: reuse the last ETag so an unchanged board returns 304
      // instead of re-sending the whole payload every 30s.
      if (cached?.etag) headers['If-None-Match'] = cached.etag;

      const res = await fetch(`/api/v1/branches/${activeBranchId}/board`, { headers });
      if (res.status === 304) {
        if (cached) return cached;
        // Cached entry was evicted; retry once without the validator.
        const retry = await fetch(`/api/v1/branches/${activeBranchId}/board`, {
          headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
        });
        if (!retry.ok) throw new Error(`Failed to load Rooms Board: ${retry.statusText}`);
        return retry.json();
      }
      if (!res.ok) {
        throw new Error(`Failed to load Rooms Board: ${res.statusText}`);
      }
      return res.json();
    },
    refetchInterval: 30000,
  });

  // 2. Real-time SSE Connection
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      try {
        const token = getAuthSnapshot().accessToken;
        const sseUrl = token
          ? `/api/v1/events?access_token=${encodeURIComponent(token)}`
          : '/api/v1/events';
        eventSource = new EventSource(sseUrl);

        eventSource.onopen = () => {
          setSseConnected(true);
        };

        eventSource.addEventListener('unit.status_changed', (_e) => {
          queryClient.invalidateQueries({ queryKey: ['board', activeTenantId, activeBranchId] });
        });

        eventSource.addEventListener('unit.blocked', (_e) => {
          queryClient.invalidateQueries({ queryKey: ['board', activeTenantId, activeBranchId] });
        });

        eventSource.addEventListener('unit.released', (_e) => {
          queryClient.invalidateQueries({ queryKey: ['board', activeTenantId, activeBranchId] });
        });

        eventSource.addEventListener('config.changed', (_e) => {
          queryClient.invalidateQueries({ queryKey: ['board', activeTenantId, activeBranchId] });
        });

        eventSource.onerror = () => {
          setSseConnected(false);
          eventSource?.close();
          reconnectTimeout = setTimeout(connectSSE, 5000);
        };
      } catch (_err) {
        setSseConnected(false);
      }
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [activeTenantId, activeBranchId, queryClient]);

  // 3. Release Block Mutation
  const releaseBlockMutation = useMutation({
    mutationFn: async (blockId: string) => {
      const res = await fetch(`/api/v1/properties/blocks/${blockId}/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || data.title || 'Failed to release block');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', activeTenantId, activeBranchId] });
      setIsActionMenuOpen(false);
      setIsDetailModalOpen(false);
    },
  });

  // Flattened all units for search, filter & navigation
  const allUnits = useMemo(() => {
    if (!boardData?.floors) return [];
    return boardData.floors.flatMap((f) => f.units);
  }, [boardData]);

  // Filtered units list
  const filteredUnits = useMemo(() => {
    return allUnits.filter((u) => {
      // Floor filter
      if (floorFilter !== 'all' && u.floor !== floorFilter) {
        return false;
      }
      // Status filter
      if (statusFilter && u.statusCode !== statusFilter) {
        return false;
      }
      // Saved Preset filters
      if (presetFilter === 'clean' && u.statusCode !== 'vacant_clean' && u.statusCode !== 'inspected') {
        return false;
      }
      if (presetFilter === 'dirty' && u.statusCode !== 'vacant_dirty') {
        return false;
      }
      if (presetFilter === 'occupied' && u.statusCode !== 'occupied' && u.statusCode !== 'due_out') {
        return false;
      }
      if (presetFilter === 'blocked' && !u.activeBlock && u.statusCode !== 'out_of_order') {
        return false;
      }
      if (presetFilter === 'connecting' && !u.connectingUnitNumber) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchNum = u.number.toLowerCase().includes(q);
        const matchType = u.unitTypeCode.toLowerCase().includes(q) || u.unitTypeName.toLowerCase().includes(q);
        const matchGuest = u.guestName ? u.guestName.toLowerCase().includes(q) : false;
        if (!matchNum && !matchType && !matchGuest) return false;
      }
      return true;
    });
  }, [allUnits, floorFilter, statusFilter, presetFilter, searchQuery]);

  // Index map to keep tile→focus-index lookups O(1) at 500 units.
  const unitIndexById = useMemo(() => {
    const map = new Map<string, number>();
    filteredUnits.forEach((u, i) => map.set(u.id, i));
    return map;
  }, [filteredUnits]);

  // Group filtered units by floor
  const displayedFloors = useMemo(() => {
    if (!boardData?.floors) return [];
    const keptIds = new Set(filteredUnits.map((u) => u.id));
    return boardData.floors
      .map((floorGroup) => {
        const floorUnits = floorGroup.units.filter((u) => keptIds.has(u.id));
        return {
          ...floorGroup,
          units: floorUnits,
        };
      })
      .filter((fg) => fg.units.length > 0);
  }, [boardData, filteredUnits]);

  // Sorted units for table list view
  const sortedUnits = useMemo(() => {
    const list = [...filteredUnits];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'number') {
        cmp = a.number.localeCompare(b.number, undefined, { numeric: true });
      } else if (sortField === 'floor') {
        cmp = (a.floor || '').localeCompare(b.floor || '', undefined, { numeric: true });
      } else if (sortField === 'type') {
        cmp = a.unitTypeCode.localeCompare(b.unitTypeCode);
      } else if (sortField === 'status') {
        cmp = a.statusLabel.localeCompare(b.statusLabel);
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredUnits, sortField, sortDirection]);

  // Keyboard shortcut listener (/ for search, Esc to clear)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (isActionMenuOpen) setIsActionMenuOpen(false);
        else if (isDetailModalOpen) setIsDetailModalOpen(false);
        else if (searchQuery) setSearchQuery('');
        else if (statusFilter) setStatusFilter(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isActionMenuOpen, isDetailModalOpen, searchQuery, statusFilter]);

  // Keyboard roving tabindex for grid tiles
  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    if (viewMode !== 'grid' || filteredUnits.length === 0) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, filteredUnits.length - 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 6, filteredUnits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 6, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const unit = filteredUnits[focusedIndex];
      if (unit) {
        setSelectedUnit(unit);
        setIsActionMenuOpen(true);
      }
    }
  };

  // CSV Export
  const handleExportCsv = () => {
    const headers = ['Number', 'Type', 'TypeName', 'Floor', 'Building', 'Status', 'Sellable', 'Occupied', 'Guest', 'Block'];
    const rows = sortedUnits.map((u) => [
      `"${u.number}"`,
      `"${u.unitTypeCode}"`,
      `"${u.unitTypeName}"`,
      `"${u.floor || ''}"`,
      `"${u.building || ''}"`,
      `"${u.statusLabel}"`,
      u.isSellable ? 'YES' : 'NO',
      u.isOccupied ? 'YES' : 'NO',
      `"${u.guestName || ''}"`,
      `"${u.activeBlock?.reason || ''}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rooms_board_${activeBranchName}_${businessDate || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Legend definitions
  const legendItems = [
    { code: 'vacant_clean', label: 'Vacant Clean', icon: 'bi-check-circle', colorToken: 'status-vacant-clean', count: boardData?.counters.vacantClean || 0 },
    { code: 'vacant_dirty', label: 'Vacant Dirty', icon: 'bi-brush', colorToken: 'status-vacant-dirty', count: boardData?.counters.vacantDirty || 0 },
    { code: 'inspected', label: 'Inspected', icon: 'bi-patch-check', colorToken: 'status-inspected', count: boardData?.counters.inspected || 0 },
    { code: 'occupied', label: 'Occupied', icon: 'bi-person-fill', colorToken: 'status-occupied', count: boardData?.counters.occupied || 0 },
    { code: 'due_out', label: 'Due Out', icon: 'bi-box-arrow-right', colorToken: 'status-due-out', count: boardData?.counters.dueOut || 0 },
    { code: 'due_in', label: 'Due In', icon: 'bi-box-arrow-in-right', colorToken: 'status-due-in', count: boardData?.counters.dueIn || 0 },
    { code: 'reserved', label: 'Reserved', icon: 'bi-bookmark-fill', colorToken: 'status-reserved', count: boardData?.counters.reserved || 0 },
    { code: 'out_of_order', label: 'Out of Order', icon: 'bi-slash-circle', colorToken: 'status-ooo', count: boardData?.counters.outOfOrder || 0 },
  ];

  return (
    <div className="board-container p-4 max-w-7xl mx-auto d-flex flex-column gap-4">
      {/* 1. Header & Live Indicator */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <h4 className="fw-bold text-dark mb-0">Rooms Board</h4>
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1">
              {activeBranchName}
            </span>
            <span className="badge bg-light text-muted border">
              Business Date: {boardData?.businessDate || businessDate || 'Today'}
            </span>
          </div>
          <span className="text-muted small">
            Real-time multi-floor operational room inventory & housekeeping state
          </span>
        </div>

        <div className="d-flex align-items-center gap-2">
          {/* SSE Live Status Pill */}
          <div
            className={`badge d-flex align-items-center gap-2 px-3 py-2 border ${
              sseConnected
                ? 'bg-success-subtle text-success border-success-subtle'
                : 'bg-warning-subtle text-warning-emphasis border-warning-subtle'
            }`}
            title={sseConnected ? 'Server-Sent Events active' : 'Connecting to real-time events...'}
          >
            <span
              className="rounded-circle"
              style={{
                width: '8px',
                height: '8px',
                backgroundColor: sseConnected ? '#198754' : '#ffc107',
                display: 'inline-block',
                boxShadow: sseConnected ? '0 0 6px #198754' : 'none',
              }}
            />
            <span className="fw-semibold small">{sseConnected ? 'Live SSE Sync' : 'Reconnecting...'}</span>
          </div>

          {/* Add Single Unit Button */}
          <button
            type="button"
            className="btn btn-sm btn-primary d-flex align-items-center gap-1 fw-semibold shadow-sm"
            onClick={() => {
              setEditingUnit(null);
              setIsUnitFormModalOpen(true);
            }}
          >
            <i className="bi bi-plus-lg" />
            <span>Add Room</span>
          </button>

          {/* Bulk Pattern Generator Button */}
          <button
            type="button"
            className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1 fw-semibold"
            onClick={() => setIsBulkModalOpen(true)}
          >
            <i className="bi bi-grid-plus" />
            <span>Bulk Add Units</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            className="btn btn-sm btn-light border d-flex align-items-center gap-1"
            onClick={() => refetch()}
            title="Refresh Board"
          >
            <i className="bi bi-arrow-clockwise" />
          </button>
        </div>
      </div>

      {/* 2. Summary Counters Strip */}
      {boardData && (
        <div className="row g-2">
          {/* Total Units */}
          <div className="col">
            <div
              className={`p-2 p-md-3 bg-white rounded-3 border text-start cursor-pointer transition-all ${
                statusFilter === null ? 'border-primary shadow-sm' : ''
              }`}
              onClick={() => setStatusFilter(null)}
              role="button"
              tabIndex={0}
            >
              <span className="text-muted small d-block">Total Rooms</span>
              <span className="fs-5 fw-bold text-dark">{boardData.counters.total}</span>
            </div>
          </div>

          {/* Vacant Clean */}
          <div className="col">
            <div
              className={`p-2 p-md-3 rounded-3 border text-start cursor-pointer transition-all ${
                statusFilter === 'vacant_clean' ? 'ring-2 border-success shadow-sm' : ''
              }`}
              style={{
                backgroundColor: 'var(--status-vacant-clean-bg, #e8f6ee)',
                borderLeft: '4px solid var(--status-vacant-clean-accent, #1f9d55)',
              }}
              onClick={() => setStatusFilter(statusFilter === 'vacant_clean' ? null : 'vacant_clean')}
              role="button"
              tabIndex={0}
            >
              <span className="small d-block fw-semibold" style={{ color: 'var(--status-vacant-clean-fg, #14532d)' }}>
                Clean
              </span>
              <span className="fs-5 fw-bold" style={{ color: 'var(--status-vacant-clean-fg, #14532d)' }}>
                {boardData.counters.vacantClean}
              </span>
            </div>
          </div>

          {/* Vacant Dirty */}
          <div className="col">
            <div
              className={`p-2 p-md-3 rounded-3 border text-start cursor-pointer transition-all ${
                statusFilter === 'vacant_dirty' ? 'ring-2 border-warning shadow-sm' : ''
              }`}
              style={{
                backgroundColor: 'var(--status-vacant-dirty-bg, #fff4e0)',
                borderLeft: '4px solid var(--status-vacant-dirty-accent, #f59e0b)',
              }}
              onClick={() => setStatusFilter(statusFilter === 'vacant_dirty' ? null : 'vacant_dirty')}
              role="button"
              tabIndex={0}
            >
              <span className="small d-block fw-semibold" style={{ color: 'var(--status-vacant-dirty-fg, #7a4a00)' }}>
                Dirty
              </span>
              <span className="fs-5 fw-bold" style={{ color: 'var(--status-vacant-dirty-fg, #7a4a00)' }}>
                {boardData.counters.vacantDirty}
              </span>
            </div>
          </div>

          {/* Inspected */}
          <div className="col">
            <div
              className={`p-2 p-md-3 rounded-3 border text-start cursor-pointer transition-all ${
                statusFilter === 'inspected' ? 'ring-2 border-info shadow-sm' : ''
              }`}
              style={{
                backgroundColor: 'var(--status-inspected-bg, #e0f2fe)',
                borderLeft: '4px solid var(--status-inspected-accent, #0ea5e9)',
              }}
              onClick={() => setStatusFilter(statusFilter === 'inspected' ? null : 'inspected')}
              role="button"
              tabIndex={0}
            >
              <span className="small d-block fw-semibold" style={{ color: 'var(--status-inspected-fg, #0c4a6e)' }}>
                Inspected
              </span>
              <span className="fs-5 fw-bold" style={{ color: 'var(--status-inspected-fg, #0c4a6e)' }}>
                {boardData.counters.inspected}
              </span>
            </div>
          </div>

          {/* Occupied */}
          <div className="col">
            <div
              className={`p-2 p-md-3 rounded-3 border text-start cursor-pointer transition-all ${
                statusFilter === 'occupied' ? 'ring-2 border-primary shadow-sm' : ''
              }`}
              style={{
                backgroundColor: 'var(--status-occupied-bg, #e8edff)',
                borderLeft: '4px solid var(--status-occupied-accent, #3b5bdb)',
              }}
              onClick={() => setStatusFilter(statusFilter === 'occupied' ? null : 'occupied')}
              role="button"
              tabIndex={0}
            >
              <span className="small d-block fw-semibold" style={{ color: 'var(--status-occupied-fg, #1e2a78)' }}>
                Occupied
              </span>
              <span className="fs-5 fw-bold" style={{ color: 'var(--status-occupied-fg, #1e2a78)' }}>
                {boardData.counters.occupied}
              </span>
            </div>
          </div>

          {/* Due In / Due Out */}
          <div className="col">
            <div
              className={`p-2 p-md-3 rounded-3 border text-start cursor-pointer transition-all ${
                statusFilter === 'due_in' ? 'ring-2 border-purple shadow-sm' : ''
              }`}
              style={{
                backgroundColor: 'var(--status-due-in-bg, #f1e8ff)',
                borderLeft: '4px solid var(--status-due-in-accent, #7c3aed)',
              }}
              onClick={() => setStatusFilter(statusFilter === 'due_in' ? null : 'due_in')}
              role="button"
              tabIndex={0}
            >
              <span className="small d-block fw-semibold" style={{ color: 'var(--status-due-in-fg, #4c1d95)' }}>
                Due In
              </span>
              <span className="fs-5 fw-bold" style={{ color: 'var(--status-due-in-fg, #4c1d95)' }}>
                {boardData.counters.dueIn}
              </span>
            </div>
          </div>

          {/* Out of Order */}
          <div className="col">
            <div
              className={`p-2 p-md-3 rounded-3 border text-start cursor-pointer transition-all ${
                statusFilter === 'out_of_order' ? 'ring-2 border-danger shadow-sm' : ''
              }`}
              style={{
                backgroundColor: 'var(--status-ooo-bg, #eceff3)',
                borderLeft: '4px solid var(--status-ooo-accent, #6b7280)',
              }}
              onClick={() => setStatusFilter(statusFilter === 'out_of_order' ? null : 'out_of_order')}
              role="button"
              tabIndex={0}
            >
              <span className="small d-block fw-semibold" style={{ color: 'var(--status-ooo-fg, #374151)' }}>
                Out of Order
              </span>
              <span className="fs-5 fw-bold" style={{ color: 'var(--status-ooo-fg, #374151)' }}>
                {boardData.counters.outOfOrder}
              </span>
            </div>
          </div>

          {/* Occupancy Rate */}
          <div className="col">
            <div className="p-2 p-md-3 bg-white rounded-3 border text-start">
              <span className="text-muted small d-block">Occupancy</span>
              <span className="fs-5 fw-bold text-primary">{boardData.counters.occupancyRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Toolbar: Search, Filters, Density & View Mode */}
      <div className="p-3 bg-white rounded-3 border shadow-sm d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">
        {/* Search bar with / keyboard shortcut */}
        <div className="position-relative flex-grow-1" style={{ maxWidth: '420px' }}>
          <i className="bi bi-search position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            className="form-control form-control-sm ps-5 pe-5 py-2 rounded-2"
            placeholder="Search room #, guest name, unit type... (Press /)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery ? (
            <button
              type="button"
              className="btn btn-sm btn-link position-absolute top-50 end-0 translate-middle-y text-muted text-decoration-none me-2"
              onClick={() => setSearchQuery('')}
            >
              <i className="bi bi-x-circle-fill" />
            </button>
          ) : (
            <kbd
              className="position-absolute top-50 end-0 translate-middle-y me-3 bg-light text-muted border px-1"
              style={{ fontSize: '0.7rem' }}
            >
              /
            </kbd>
          )}
        </div>

        {/* Filters and Controls */}
        <div className="d-flex flex-wrap align-items-center gap-2">
          {/* Floor selector */}
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto' }}
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value)}
          >
            <option value="all">All Floors</option>
            {boardData?.floors.map((f) => (
              <option key={f.floor} value={f.floor}>
                {f.floorName || `Floor ${f.floor}`}
              </option>
            ))}
          </select>

          {/* Density toggle */}
          <div className="btn-group btn-group-sm" role="group" aria-label="Density">
            <button
              type="button"
              className={`btn ${density === 'compact' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setDensity('compact')}
              title="Compact tiles"
            >
              <i className="bi bi-grid-3x3" />
            </button>
            <button
              type="button"
              className={`btn ${density === 'comfortable' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setDensity('comfortable')}
              title="Comfortable tiles"
            >
              <i className="bi bi-grid-fill" />
            </button>
            <button
              type="button"
              className={`btn ${density === 'large' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setDensity('large')}
              title="Large detailed tiles"
            >
              <i className="bi bi-square-fill" />
            </button>
          </div>

          {/* View toggle (Grid vs Timeline vs List) */}
          <div className="btn-group btn-group-sm" role="group" aria-label="View Mode">
            <button
              type="button"
              className={`btn ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline-secondary'} d-flex align-items-center gap-1`}
              onClick={() => setViewMode('grid')}
            >
              <i className="bi bi-grid" />
              <span>Grid</span>
            </button>
            <button
              type="button"
              className={`btn ${viewMode === 'timeline' ? 'btn-primary' : 'btn-outline-secondary'} d-flex align-items-center gap-1`}
              onClick={() => setViewMode('timeline')}
            >
              <i className="bi bi-calendar-range" />
              <span>Timeline</span>
            </button>
            <button
              type="button"
              className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'} d-flex align-items-center gap-1`}
              onClick={() => setViewMode('list')}
            >
              <i className="bi bi-list-ul" />
              <span>List</span>
            </button>
          </div>

          {/* CSV Export & Column Chooser in list view */}
          {viewMode === 'list' && (
            <div className="d-flex align-items-center gap-2">
              {/* Column Chooser Dropdown */}
              <div className="position-relative">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                  onClick={() => setIsColumnChooserOpen(!isColumnChooserOpen)}
                >
                  <i className="bi bi-layout-three-columns" />
                  <span>Columns</span>
                </button>
                {isColumnChooserOpen && (
                  <div
                    className="dropdown-menu show p-2 shadow-lg border rounded-3 position-absolute end-0 mt-1"
                    style={{ zIndex: 1050, minWidth: '190px' }}
                  >
                    <div className="small fw-bold px-2 py-1 text-muted border-bottom mb-1">
                      Column Chooser
                    </div>
                    {[
                      { key: 'number', label: 'Room #' },
                      { key: 'type', label: 'Room Type' },
                      { key: 'floor', label: 'Floor' },
                      { key: 'building', label: 'Building' },
                      { key: 'status', label: 'Status' },
                      { key: 'guest', label: 'In-House Guest' },
                      { key: 'block', label: 'Active Block' },
                      { key: 'connecting', label: 'Connecting Room' },
                      { key: 'actions', label: 'Actions' },
                    ].map(({ key, label }) => (
                      <div key={key} className="form-check px-4 py-1">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id={`col-${key}`}
                          checked={visibleColumns[key] ?? true}
                          onChange={(e) =>
                            setVisibleColumns((prev) => ({
                              ...prev,
                              [key]: e.target.checked,
                            }))
                          }
                        />
                        <label className="form-check-label small" htmlFor={`col-${key}`}>
                          {label}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                className="btn btn-sm btn-outline-success d-flex align-items-center gap-1 fw-semibold"
                onClick={handleExportCsv}
              >
                <i className="bi bi-file-earmark-spreadsheet" />
                <span>Export CSV</span>
              </button>
            </div>
          )}

          {/* Clear status filter badge if active */}
          {(statusFilter || presetFilter !== 'all') && (
            <button
              type="button"
              className="btn btn-sm btn-light border text-danger d-flex align-items-center gap-1"
              onClick={() => {
                setStatusFilter(null);
                setPresetFilter('all');
              }}
            >
              <i className="bi bi-funnel-fill" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Saved Filter Presets Strip */}
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className="text-muted small fw-semibold me-1 d-flex align-items-center gap-1">
          <i className="bi bi-bookmark-star text-primary" />
          Filter Presets:
        </span>
        {[
          { id: 'all', label: 'All Rooms', icon: 'bi-grid-all' },
          { id: 'clean', label: 'Ready for Sale (Clean / Inspected)', icon: 'bi-check2-circle' },
          { id: 'dirty', label: 'Needs Cleaning (Vacant Dirty)', icon: 'bi-brush' },
          { id: 'occupied', label: 'In-House (Occupied / Due Out)', icon: 'bi-person-fill' },
          { id: 'blocked', label: 'Blocked (OOO / OOS)', icon: 'bi-slash-circle' },
          { id: 'connecting', label: 'Connecting Rooms', icon: 'bi-link-45deg' },
        ].map((preset) => {
          const isSelected = presetFilter === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={`btn btn-sm rounded-pill d-flex align-items-center gap-1 border transition-all ${
                isSelected
                  ? 'btn-primary text-white shadow-sm fw-semibold'
                  : 'btn-light text-secondary border'
              }`}
              style={{ fontSize: '0.78rem' }}
              onClick={() => {
                setPresetFilter(preset.id as any);
                if (preset.id !== 'all') setStatusFilter(null);
              }}
            >
              <i className={`bi ${preset.icon}`} />
              <span>{preset.label}</span>
            </button>
          );
        })}
      </div>

      {/* 5. Interactive Legend-as-Filter */}
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className="text-muted small fw-semibold me-1">Legend Filter:</span>
        {legendItems.map((item) => {
          const isSelected = statusFilter === item.code;
          return (
            <button
              key={item.code}
              type="button"
              className={`btn btn-sm rounded-pill d-flex align-items-center gap-1 border transition-all ${
                isSelected ? 'shadow-sm ring-2' : ''
              }`}
              style={{
                backgroundColor: `var(--${item.colorToken}-bg, #f8f9fa)`,
                color: `var(--${item.colorToken}-fg, #1f2937)`,
                borderColor: isSelected ? `var(--${item.colorToken}-accent, #000)` : '#e2e8f0',
                fontSize: '0.78rem',
                fontWeight: isSelected ? 700 : 500,
              }}
              onClick={() => setStatusFilter(isSelected ? null : item.code)}
            >
              <i className={`bi ${item.icon}`} />
              <span>{item.label}</span>
              <span className="badge rounded-pill bg-white text-dark border ms-1 py-0 px-1" style={{ fontSize: '0.68rem' }}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 5. Main Content: Grid vs List View */}
      {isLoading ? (
        <div className="p-5 text-center bg-white rounded-3 border">
          <div className="spinner-border text-primary mb-2" role="status" />
          <div className="text-muted">Loading Rooms Board...</div>
        </div>
      ) : isError ? (
        <div className="alert alert-danger py-3">
          <i className="bi bi-exclamation-triangle-fill me-2" />
          {(error as Error).message}
        </div>
      ) : filteredUnits.length === 0 ? (
        <div className="p-5 text-center bg-white rounded-3 border">
          <i className="bi bi-door-closed text-muted fs-1 mb-2 d-block" />
          <h6 className="fw-bold text-dark">No rooms match the current filter criteria</h6>
          <span className="text-muted small">
            Try adjusting your search query, status filters, or selected floor.
          </span>
          <div className="mt-3">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter(null);
                setFloorFilter('all');
              }}
            >
              Clear All Filters
            </button>
          </div>
        </div>
      ) : viewMode === 'timeline' ? (
        <TimelineStayChart
          units={filteredUnits}
          onSelectUnit={(u) => {
            setSelectedUnit(u);
            setIsDetailModalOpen(true);
          }}
        />
      ) : viewMode === 'grid' ? (
        /* Grid Board by Floor with Keyboard Navigation */
        <div
          ref={gridContainerRef}
          className="d-flex flex-column gap-4"
          tabIndex={0}
          onKeyDown={handleGridKeyDown}
          style={{ outline: 'none' }}
        >
          {displayedFloors.map((floorGroup) => (
            <div key={floorGroup.floor} className="card border shadow-sm">
              {/* Floor Header */}
              <div className="card-header bg-white border-bottom py-2 px-3 d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2">
                  <i className="bi bi-layers text-primary" />
                  <span className="fw-bold text-dark">
                    {floorGroup.floorName || `Floor ${floorGroup.floor}`}
                  </span>
                  {floorGroup.building && (
                    <span className="badge bg-light text-muted border">{floorGroup.building}</span>
                  )}
                </div>
                <span className="badge bg-light text-dark border">
                  {floorGroup.units.length} {floorGroup.units.length === 1 ? 'Room' : 'Rooms'}
                </span>
              </div>

              {/* Units Grid */}
              <div className="card-body p-3">
                <div
                  className="d-grid gap-2"
                  style={{
                    gridTemplateColumns:
                      density === 'compact'
                        ? 'repeat(auto-fill, minmax(130px, 1fr))'
                        : density === 'large'
                        ? 'repeat(auto-fill, minmax(210px, 1fr))'
                        : 'repeat(auto-fill, minmax(165px, 1fr))',
                  }}
                >
                  {floorGroup.units.map((unit) => {
                    const globalIdx = filteredUnits.findIndex((fu) => fu.id === unit.id);
                    const isFocused = globalIdx === focusedIndex;

                    return (
                      <div
                        key={unit.id}
                        className={isFocused ? 'ring-2 ring-primary rounded-3' : ''}
                      >
                        <UnitTile
                          unit={unit}
                          density={density}
                          tabIndex={isFocused ? 0 : -1}
                          onClick={(u) => {
                            setSelectedUnit(u);
                            setIsActionMenuOpen(true);
                          }}
                          onActionClick={(u, e) => {
                            e.stopPropagation();
                            setSelectedUnit(u);
                            setIsDetailModalOpen(true);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Unit List View Table */
        <div className="card border shadow-sm">
          <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
            <span className="fw-bold text-dark d-flex align-items-center gap-2">
              <i className="bi bi-table text-primary" />
              Units Directory ({sortedUnits.length} Units)
            </span>
            <span className="text-muted small">Click columns to sort</span>
          </div>

          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  {visibleColumns.number && (
                    <th
                      className="small text-muted cursor-pointer"
                      onClick={() => {
                        if (sortField === 'number') setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        else { setSortField('number'); setSortDirection('asc'); }
                      }}
                    >
                      Room # {sortField === 'number' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  )}
                  {visibleColumns.type && (
                    <th
                      className="small text-muted cursor-pointer"
                      onClick={() => {
                        if (sortField === 'type') setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        else { setSortField('type'); setSortDirection('asc'); }
                      }}
                    >
                      Type {sortField === 'type' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  )}
                  {visibleColumns.floor && (
                    <th
                      className="small text-muted cursor-pointer"
                      onClick={() => {
                        if (sortField === 'floor') setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        else { setSortField('floor'); setSortDirection('asc'); }
                      }}
                    >
                      Floor {sortField === 'floor' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  )}
                  {visibleColumns.building && <th className="small text-muted">Building</th>}
                  {visibleColumns.status && (
                    <th
                      className="small text-muted cursor-pointer"
                      onClick={() => {
                        if (sortField === 'status') setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        else { setSortField('status'); setSortDirection('asc'); }
                      }}
                    >
                      Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  )}
                  {visibleColumns.guest && <th className="small text-muted">In-House Guest</th>}
                  {visibleColumns.block && <th className="small text-muted">Active Block</th>}
                  {visibleColumns.connecting && <th className="small text-muted">Connecting Room</th>}
                  {visibleColumns.actions && <th className="small text-muted text-end">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sortedUnits.map((unit) => (
                  <tr key={unit.id}>
                    {visibleColumns.number && <td className="fw-bold font-monospace">{unit.number}</td>}
                    {visibleColumns.type && (
                      <td>
                        <span className="badge bg-light text-secondary border me-1">{unit.unitTypeCode}</span>
                        <span className="small text-muted">{unit.unitTypeName}</span>
                      </td>
                    )}
                    {visibleColumns.floor && (
                      <td className="small text-muted">{unit.floorName || `Floor ${unit.floor || '1'}`}</td>
                    )}
                    {visibleColumns.building && (
                      <td className="small text-muted">{unit.building || '—'}</td>
                    )}
                    {visibleColumns.status && (
                      <td>
                        <span
                          className="badge d-inline-flex align-items-center gap-1 border"
                          style={{
                            backgroundColor: `var(--${unit.colorToken}-bg, #f8f9fa)`,
                            color: `var(--${unit.colorToken}-fg, #1e293b)`,
                            borderColor: `var(--${unit.colorToken}-accent, #cbd5e1)`,
                          }}
                        >
                          <i className={`bi ${unit.icon || 'bi-circle-fill'}`} />
                          <span>{unit.statusLabel}</span>
                        </span>
                      </td>
                    )}
                    {visibleColumns.guest && (
                      <td className="small text-muted">
                        {unit.guestName ? (
                          <span className="fw-semibold text-dark">{unit.guestName}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    {visibleColumns.block && (
                      <td className="small">
                        {unit.activeBlock ? (
                          <span className="badge bg-danger-subtle text-danger border border-danger-subtle">
                            {unit.activeBlock.reason}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.connecting && (
                      <td className="small text-muted">
                        {unit.connectingUnitNumber ? (
                          <span className="badge bg-info-subtle text-info border border-info-subtle">
                            <i className="bi bi-link-45deg me-1" />
                            Room {unit.connectingUnitNumber}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    {visibleColumns.actions && (
                      <td className="text-end">
                        <div className="btn-group btn-group-sm">
                          <button
                            type="button"
                            className="btn btn-outline-primary"
                            onClick={() => {
                              setSelectedUnit(unit);
                              setIsActionMenuOpen(true);
                            }}
                            title="Actions Menu"
                          >
                            <i className="bi bi-three-dots" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() => {
                              setSelectedUnit(unit);
                              setIsDetailModalOpen(true);
                            }}
                            title="View Details"
                          >
                            <i className="bi bi-info-circle" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() => {
                              setEditingUnit(unit);
                              setIsUnitFormModalOpen(true);
                            }}
                            title="Edit Room"
                          >
                            <i className="bi bi-pencil" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Context Modals */}
      {/* Action Menu Modal */}
      <ActionMenu
        unit={selectedUnit}
        onClose={() => setIsActionMenuOpen(false)}
        onStatusTransition={(unit, to) => {
          setSelectedUnit(unit);
          setTargetStatus(to);
          setIsActionMenuOpen(false);
          setIsStatusModalOpen(true);
        }}
        onOpenBlockModal={(unit) => {
          setSelectedUnit(unit);
          setIsActionMenuOpen(false);
          setIsBlockModalOpen(true);
        }}
        onOpenReleaseBlock={(unit) => {
          if (unit.activeBlock) {
            releaseBlockMutation.mutate(unit.activeBlock.id);
          }
        }}
        onOpenWalkIn={(unit) => {
          setSelectedUnit(unit);
          setIsActionMenuOpen(false);
          setIsWalkInModalOpen(true);
        }}
      />

      {/* Quick Walk-In Modal */}
      <WalkInModal
        unit={selectedUnit}
        isOpen={isWalkInModalOpen}
        onClose={() => setIsWalkInModalOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['board', activeTenantId, activeBranchId] });
        }}
      />

      {/* Status Transition Modal */}
      <StatusTransitionModal
        unit={selectedUnit}
        targetStatus={targetStatus}
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['board', activeTenantId, activeBranchId] });
        }}
      />

      {/* Unit Block Modal */}
      <UnitBlockModal
        unit={selectedUnit}
        isOpen={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['board', activeTenantId, activeBranchId] });
        }}
      />

      {/* Unit Detail Drawer / Modal */}
      <UnitDetailModal
        unit={selectedUnit}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onChangeStatus={(unit) => {
          setSelectedUnit(unit);
          setTargetStatus(unit.statusCode === 'vacant_dirty' ? 'vacant_clean' : 'inspected');
          setIsDetailModalOpen(false);
          setIsStatusModalOpen(true);
        }}
        onOpenBlock={(unit) => {
          setSelectedUnit(unit);
          setIsDetailModalOpen(false);
          setIsBlockModalOpen(true);
        }}
        onReleaseBlock={(unit) => {
          if (unit.activeBlock) {
            releaseBlockMutation.mutate(unit.activeBlock.id);
          }
        }}
      />

      {/* Bulk Unit Modal */}
      <BulkUnitModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['board', activeTenantId, activeBranchId] });
        }}
      />

      {/* Single Unit Create / Edit Modal */}
      <UnitFormModal
        isOpen={isUnitFormModalOpen}
        unit={editingUnit}
        onClose={() => {
          setIsUnitFormModalOpen(false);
          setEditingUnit(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['board', activeTenantId, activeBranchId] });
        }}
      />
    </div>
  );
};
