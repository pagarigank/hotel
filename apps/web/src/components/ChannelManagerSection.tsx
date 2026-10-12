import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import type { ChannelMappingDto, ChannelSyncLogDto, CreateChannelMappingDto } from '@innkeeper/contracts';

export const ChannelManagerSection: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();

  const [isNewMappingModalOpen, setIsNewMappingModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  // New Mapping Form State
  const [channelName, setChannelName] = useState('booking_com');
  const [channelRoomCode, setChannelRoomCode] = useState('BK_STD_01');
  const [channelRateCode, setChannelRateCode] = useState('BK_BAR_FLEX');

  // 1. Fetch Mappings
  const { data: mappings = [], isLoading: isMappingsLoading } = useQuery<ChannelMappingDto[]>({
    queryKey: ['channel-mappings', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/channel-manager/mappings?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // 2. Fetch Sync Logs
  const { data: logs = [], isLoading: isLogsLoading } = useQuery<ChannelSyncLogDto[]>({
    queryKey: ['channel-sync-logs', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/channel-manager/logs?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 15000,
  });

  // 3. Outbound ARI Push Mutation
  const syncAriMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/channel-manager/sync/ari', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          branchId: activeBranchId,
          channelName: 'all',
        }),
      });
      if (!res.ok) throw new Error('Outbound ARI push failed');
      return res.json();
    },
    onSuccess: (data) => {
      setFeedback({
        message: `ARI Pushed: Sent ${data.pushedRecordsCount} real-time updates to OTAs compliant with OpenTravel 2-Way specification!`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['channel-sync-logs'] });
      setTimeout(() => setFeedback(null), 5000);
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  // 4. Create Mapping Mutation
  const createMappingMutation = useMutation({
    mutationFn: async (dto: CreateChannelMappingDto) => {
      const res = await fetch('/api/v1/channel-manager/mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify(dto),
      });
      if (!res.ok) throw new Error('Failed to create mapping');
      return res.json();
    },
    onSuccess: (data: ChannelMappingDto) => {
      setFeedback({ message: `Mapping for ${data.channelName} (${data.channelRoomCode}) registered!`, type: 'success' });
      setIsNewMappingModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['channel-mappings'] });
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
            <h6 className="fw-bold mb-0 text-dark">Channel Manager 2-Way ARI Adapter</h6>
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
              REQ-RSV-015
            </span>
          </div>
          <span className="text-muted small">
            OpenTravel / HTNG compliant outbound ARI push & inbound booking webhook ingestion with rate-parity guard
          </span>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-primary d-flex align-items-center gap-2"
            onClick={() => setIsNewMappingModalOpen(true)}
          >
            <i className="bi bi-diagram-3-fill" />
            <span>Map Channel</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary fw-semibold d-flex align-items-center gap-2 shadow-sm"
            onClick={() => syncAriMutation.mutate()}
            disabled={syncAriMutation.isPending}
          >
            <i className="bi bi-cloud-arrow-up-fill" />
            <span>{syncAriMutation.isPending ? 'Syncing ARI...' : 'Push Real-Time ARI'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} py-2 px-4 mb-0 rounded-0 border-0 border-bottom small d-flex justify-content-between align-items-center`}>
          <span>{feedback.message}</span>
          <button type="button" className="btn-close" onClick={() => setFeedback(null)} />
        </div>
      )}

      {/* Grid: Mappings on top, Sync Logs on bottom */}
      <div className="card-body p-4 d-flex flex-column gap-4">
        {/* 1. Channel Mappings Table */}
        <div>
          <h6 className="fw-bold text-dark mb-2 d-flex align-items-center gap-2">
            <i className="bi bi-link-45deg text-primary" />
            <span>Active Channel Mappings</span>
            <span className="badge bg-light text-muted border">{mappings.length} Active</span>
          </h6>
          <div className="table-responsive border rounded-3">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th className="px-3 py-2 small text-muted text-uppercase">Channel</th>
                  <th className="py-2 small text-muted text-uppercase">OTA Room Code</th>
                  <th className="py-2 small text-muted text-uppercase">OTA Rate Code</th>
                  <th className="py-2 small text-muted text-uppercase">Local Unit Type ID</th>
                  <th className="py-2 small text-muted text-uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {isMappingsLoading ? (
                  <tr><td colSpan={5} className="text-center py-3 text-muted small">Loading mappings...</td></tr>
                ) : mappings.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-4 text-muted small">No channel mappings configured. Click "Map Channel" to link an OTA.</td></tr>
                ) : (
                  mappings.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 fw-bold text-dark text-capitalize">
                        <i className="bi bi-globe me-1 text-primary" />
                        {m.channelName.replace('_', '.')}
                      </td>
                      <td className="font-monospace text-primary">{m.channelRoomCode}</td>
                      <td className="font-monospace text-secondary">{m.channelRateCode}</td>
                      <td className="font-monospace small text-muted">{m.localUnitTypeId.slice(0, 8)}...</td>
                      <td>
                        <span className="badge bg-success-subtle text-success border border-success-subtle">Connected</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Recent Sync Logs */}
        <div>
          <h6 className="fw-bold text-dark mb-2 d-flex align-items-center gap-2">
            <i className="bi bi-clock-history text-primary" />
            <span>2-Way Channel Synchronization Logs</span>
          </h6>
          <div className="table-responsive border rounded-3" style={{ maxHeight: '280px' }}>
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light sticky-top">
                <tr>
                  <th className="px-3 py-2 small text-muted text-uppercase">Timestamp</th>
                  <th className="py-2 small text-muted text-uppercase">Channel</th>
                  <th className="py-2 small text-muted text-uppercase">Type</th>
                  <th className="py-2 small text-muted text-uppercase">Status</th>
                  <th className="py-2 small text-muted text-uppercase">Summary</th>
                </tr>
              </thead>
              <tbody>
                {isLogsLoading ? (
                  <tr><td colSpan={5} className="text-center py-3 text-muted small">Loading logs...</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-4 text-muted small">No sync events recorded yet. Push ARI above to trigger one.</td></tr>
                ) : (
                  logs.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 small text-muted">{new Date(l.createdAt).toLocaleTimeString()}</td>
                      <td className="fw-semibold text-dark text-capitalize">{l.channelName}</td>
                      <td>
                        <span className={`badge ${l.syncType === 'outbound_ari' ? 'bg-info-subtle text-info-emphasis' : 'bg-primary-subtle text-primary'}`}>
                          {l.syncType === 'outbound_ari' ? 'ARI Outbound' : 'Booking Inbound'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${l.status === 'success' ? 'bg-success-subtle text-success' : l.status === 'warning' ? 'bg-warning-subtle text-warning-emphasis' : 'bg-danger-subtle text-danger'}`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="small text-muted font-monospace text-truncate" style={{ maxWidth: 360 }}>
                        {JSON.stringify(l.payloadSummary)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Mapping Modal */}
      {isNewMappingModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg border-0 rounded-3">
              <form onSubmit={(e) => {
                e.preventDefault();
                createMappingMutation.mutate({
                  branchId: activeBranchId,
                  channelName,
                  localUnitTypeId: '55000000-0000-0000-0000-000000000001',
                  localRatePlanId: '35000000-0000-0000-0000-000000000001',
                  channelRoomCode,
                  channelRateCode,
                  isActive: true,
                });
              }}>
                <div className="modal-header bg-light border-bottom py-3 px-4">
                  <h6 className="fw-bold mb-0 text-dark">Register OTA Channel Mapping</h6>
                  <button type="button" className="btn-close" onClick={() => setIsNewMappingModalOpen(false)} />
                </div>
                <div className="modal-body p-4 d-flex flex-column gap-3">
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Target OTA Channel</label>
                    <select className="form-select form-select-sm" value={channelName} onChange={(e) => setChannelName(e.target.value)}>
                      <option value="booking_com">Booking.com</option>
                      <option value="expedia">Expedia Partner Central</option>
                      <option value="agoda">Agoda YCS</option>
                      <option value="channex">Channex Global Switch</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Channel Room Code (OTA Inventory Identifier)</label>
                    <input type="text" className="form-control form-control-sm font-monospace" value={channelRoomCode} onChange={(e) => setChannelRoomCode(e.target.value)} required />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-muted mb-1">Channel Rate Code (OTA Rate Plan Identifier)</label>
                    <input type="text" className="form-control form-control-sm font-monospace" value={channelRateCode} onChange={(e) => setChannelRateCode(e.target.value)} required />
                  </div>
                </div>
                <div className="modal-footer bg-light border-top py-2 px-4">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setIsNewMappingModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm btn-primary fw-semibold" disabled={createMappingMutation.isPending}>
                    {createMappingMutation.isPending ? 'Saving...' : 'Save Channel Mapping'}
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
