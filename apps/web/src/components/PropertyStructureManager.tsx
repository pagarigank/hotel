import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';

interface UnitTypeDto {
  id: string;
  code: string;
  name: string;
  kind: string;
  baseRate: number;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
}

interface BuildingDto {
  id: string;
  code: string;
  name: string;
}

interface FloorDto {
  id: string;
  buildingId: string;
  number: string;
  name: string;
}

interface AmenityDto {
  id: string;
  code: string;
  name: string;
  category: string;
}

export const PropertyStructureManager: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();

  const [subTab, setSubTab] = useState<'unit-types' | 'buildings-floors' | 'amenities'>('unit-types');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  // Unit Type Form
  const [utCode, setUtCode] = useState('');
  const [utName, setUtName] = useState('');
  const [utKind, setUtKind] = useState('room');
  const [utBaseRate, setUtBaseRate] = useState<number>(100);
  const [utMaxAdults, setUtMaxAdults] = useState<number>(2);
  const [utMaxChildren, setUtMaxChildren] = useState<number>(1);
  const [utMaxOccupancy, setUtMaxOccupancy] = useState<number>(3);

  // Building & Floor Forms
  const [bCode, setBCode] = useState('');
  const [bName, setBName] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [fNumber, setFNumber] = useState('');
  const [fName, setFName] = useState('');

  // Amenity Form
  const [amCode, setAmCode] = useState('');
  const [amName, setAmName] = useState('');
  const [amCategory, setAmCategory] = useState('room');

  // Queries
  const { data: unitTypes } = useQuery<UnitTypeDto[]>({
    queryKey: ['unit-types', activeTenantId],
    queryFn: async () => {
      const res = await fetch('/api/v1/properties/unit-types', {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: buildings } = useQuery<BuildingDto[]>({
    queryKey: ['buildings', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/properties/buildings?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  React.useEffect(() => {
    if (buildings && buildings.length > 0 && !selectedBuildingId) {
      setSelectedBuildingId(buildings[0].id);
    }
  }, [buildings, selectedBuildingId]);

  const { data: floors } = useQuery<FloorDto[]>({
    queryKey: ['floors', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/properties/floors?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: amenities } = useQuery<AmenityDto[]>({
    queryKey: ['amenities', activeTenantId],
    queryFn: async () => {
      const res = await fetch('/api/v1/properties/amenities', {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Mutations
  const createUnitTypeMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/v1/properties/unit-types', {
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
        throw new Error(err.detail || err.title || 'Failed to create unit type');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({ message: 'Room category created successfully.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['unit-types'] });
      setUtCode('');
      setUtName('');
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  const createBuildingMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/v1/properties/buildings', {
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
        throw new Error(err.detail || err.title || 'Failed to create building');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({ message: 'Building created.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['buildings'] });
      setBCode('');
      setBName('');
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  const createFloorMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/v1/properties/floors', {
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
        throw new Error(err.detail || err.title || 'Failed to create floor');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({ message: 'Floor created.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['floors'] });
      setFNumber('');
      setFName('');
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  const createAmenityMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/v1/properties/amenities', {
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
        throw new Error(err.detail || err.title || 'Failed to create amenity');
      }
      return res.json();
    },
    onSuccess: () => {
      setFeedback({ message: 'Amenity created.', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['amenities'] });
      setAmCode('');
      setAmName('');
    },
    onError: (err: Error) => setFeedback({ message: err.message, type: 'danger' }),
  });

  return (
    <div className="d-flex flex-column gap-3">
      {/* Sub tabs */}
      <div className="d-flex gap-2">
        <button
          type="button"
          className={`btn btn-sm rounded-pill px-3 fw-semibold ${subTab === 'unit-types' ? 'btn-primary' : 'btn-light text-muted'}`}
          onClick={() => setSubTab('unit-types')}
        >
          <i className="bi bi-door-closed me-1" />
          Room Categories / Unit Types
        </button>
        <button
          type="button"
          className={`btn btn-sm rounded-pill px-3 fw-semibold ${subTab === 'buildings-floors' ? 'btn-primary' : 'btn-light text-muted'}`}
          onClick={() => setSubTab('buildings-floors')}
        >
          <i className="bi bi-building me-1" />
          Buildings &amp; Floors
        </button>
        <button
          type="button"
          className={`btn btn-sm rounded-pill px-3 fw-semibold ${subTab === 'amenities' ? 'btn-primary' : 'btn-light text-muted'}`}
          onClick={() => setSubTab('amenities')}
        >
          <i className="bi bi-stars me-1" />
          Amenities
        </button>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} py-2 px-3 small d-flex justify-content-between align-items-center mb-0`}>
          <span>{feedback.message}</span>
          <button type="button" className="btn-close" onClick={() => setFeedback(null)} />
        </div>
      )}

      {/* SubTab 1: Room Categories / Unit Types */}
      {subTab === 'unit-types' && (
        <div className="row g-3">
          <div className="col-lg-5">
            <div className="p-3 bg-light-subtle rounded border">
              <h6 className="fw-bold text-dark small mb-2">Create Room Category</h6>
              <form onSubmit={(e) => {
                e.preventDefault();
                createUnitTypeMutation.mutate({
                  code: utCode.trim().toUpperCase(),
                  name: utName.trim(),
                  kind: utKind,
                  baseRate: Number(utBaseRate),
                  maxAdults: Number(utMaxAdults),
                  maxChildren: Number(utMaxChildren),
                  maxOccupancy: Number(utMaxOccupancy),
                  amenitiesIds: [],
                });
              }} className="d-flex flex-column gap-2 small">
                <div>
                  <label className="form-label text-muted fw-bold mb-1">Code *</label>
                  <input type="text" className="form-control form-control-sm font-monospace" placeholder="e.g. STD, DLX, STE" required value={utCode} onChange={(e) => setUtCode(e.target.value)} />
                </div>
                <div>
                  <label className="form-label text-muted fw-bold mb-1">Name *</label>
                  <input type="text" className="form-control form-control-sm" placeholder="e.g. Deluxe Ocean View Suite" required value={utName} onChange={(e) => setUtName(e.target.value)} />
                </div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label text-muted fw-bold mb-1">Kind</label>
                    <select className="form-select form-select-sm" value={utKind} onChange={(e) => setUtKind(e.target.value)}>
                      <option value="room">Hotel Room</option>
                      <option value="suite">Suite</option>
                      <option value="villa">Villa</option>
                      <option value="dorm">Dorm Bed</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label text-muted fw-bold mb-1">Base Rate ($)</label>
                    <input type="number" step="0.01" min="1" className="form-control form-control-sm" value={utBaseRate} onChange={(e) => setUtBaseRate(Number(e.target.value))} />
                  </div>
                  <div className="col-4">
                    <label className="form-label text-muted fw-bold mb-1">Max Adults</label>
                    <input type="number" min="1" className="form-control form-control-sm" value={utMaxAdults} onChange={(e) => setUtMaxAdults(Number(e.target.value))} />
                  </div>
                  <div className="col-4">
                    <label className="form-label text-muted fw-bold mb-1">Max Child</label>
                    <input type="number" min="0" className="form-control form-control-sm" value={utMaxChildren} onChange={(e) => setUtMaxChildren(Number(e.target.value))} />
                  </div>
                  <div className="col-4">
                    <label className="form-label text-muted fw-bold mb-1">Max Total</label>
                    <input type="number" min="1" className="form-control form-control-sm" value={utMaxOccupancy} onChange={(e) => setUtMaxOccupancy(Number(e.target.value))} />
                  </div>
                </div>
                <button type="submit" className="btn btn-sm btn-primary fw-semibold mt-2" disabled={createUnitTypeMutation.isPending}>
                  {createUnitTypeMutation.isPending ? 'Saving...' : 'Add Room Category'}
                </button>
              </form>
            </div>
          </div>
          <div className="col-lg-7">
            <div className="table-responsive rounded border bg-white">
              <table className="table table-sm table-hover align-middle mb-0 small">
                <thead className="table-light text-muted text-uppercase">
                  <tr>
                    <th className="ps-3">Code</th>
                    <th>Category Name</th>
                    <th>Base Rate</th>
                    <th>Capacity</th>
                  </tr>
                </thead>
                <tbody>
                  {unitTypes?.map((ut) => (
                    <tr key={ut.id}>
                      <td className="ps-3 font-monospace fw-bold text-primary">{ut.code}</td>
                      <td>{ut.name}</td>
                      <td>${Number(ut.baseRate).toFixed(2)}</td>
                      <td>{ut.maxAdults}A + {ut.maxChildren}C (Max {ut.maxOccupancy})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SubTab 2: Buildings & Floors */}
      {subTab === 'buildings-floors' && (
        <div className="row g-3">
          <div className="col-md-6">
            <div className="p-3 bg-light-subtle rounded border d-flex flex-column gap-2 mb-3">
              <h6 className="fw-bold text-dark small mb-1">Add Building</h6>
              <form onSubmit={(e) => {
                e.preventDefault();
                createBuildingMutation.mutate({
                  branchId: activeBranchId,
                  code: bCode.trim().toUpperCase(),
                  name: bName.trim(),
                });
              }} className="d-flex flex-column gap-2 small">
                <div className="row g-2">
                  <div className="col-5">
                    <input type="text" className="form-control form-control-sm font-monospace" placeholder="Code (e.g. BLD-A)" required value={bCode} onChange={(e) => setBCode(e.target.value)} />
                  </div>
                  <div className="col-7">
                    <input type="text" className="form-control form-control-sm" placeholder="Building Name (e.g. Tower A)" required value={bName} onChange={(e) => setBName(e.target.value)} />
                  </div>
                </div>
                <button type="submit" className="btn btn-sm btn-primary fw-semibold" disabled={createBuildingMutation.isPending}>
                  Add Building
                </button>
              </form>
            </div>

            <div className="p-3 bg-light-subtle rounded border d-flex flex-column gap-2">
              <h6 className="fw-bold text-dark small mb-1">Add Floor to Building</h6>
              <form onSubmit={(e) => {
                e.preventDefault();
                if (!selectedBuildingId) return;
                createFloorMutation.mutate({
                  buildingId: selectedBuildingId,
                  number: fNumber.trim(),
                  name: fName.trim() || `Floor ${fNumber.trim()}`,
                  sortOrder: Number(fNumber) || 1,
                });
              }} className="d-flex flex-column gap-2 small">
                <div>
                  <label className="form-label text-muted fw-bold mb-1">Target Building</label>
                  <select className="form-select form-select-sm" value={selectedBuildingId} onChange={(e) => setSelectedBuildingId(e.target.value)}>
                    {buildings?.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
                </div>
                <div className="row g-2">
                  <div className="col-4">
                    <input type="text" className="form-control form-control-sm font-monospace" placeholder="Number (1)" required value={fNumber} onChange={(e) => setFNumber(e.target.value)} />
                  </div>
                  <div className="col-8">
                    <input type="text" className="form-control form-control-sm" placeholder="Name (Floor 1)" value={fName} onChange={(e) => setFName(e.target.value)} />
                  </div>
                </div>
                <button type="submit" className="btn btn-sm btn-primary fw-semibold" disabled={createFloorMutation.isPending}>
                  Add Floor
                </button>
              </form>
            </div>
          </div>

          <div className="col-md-6">
            <div className="table-responsive rounded border bg-white">
              <table className="table table-sm table-hover align-middle mb-0 small">
                <thead className="table-light text-muted text-uppercase">
                  <tr>
                    <th className="ps-3">Floor #</th>
                    <th>Floor Name</th>
                    <th>Building</th>
                  </tr>
                </thead>
                <tbody>
                  {floors?.map((fl) => {
                    const b = buildings?.find((x) => x.id === fl.buildingId);
                    return (
                      <tr key={fl.id}>
                        <td className="ps-3 font-monospace fw-bold">{fl.number}</td>
                        <td>{fl.name}</td>
                        <td>{b ? b.name : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SubTab 3: Amenities */}
      {subTab === 'amenities' && (
        <div className="row g-3">
          <div className="col-md-5">
            <div className="p-3 bg-light-subtle rounded border">
              <h6 className="fw-bold text-dark small mb-2">Create Room Amenity</h6>
              <form onSubmit={(e) => {
                e.preventDefault();
                createAmenityMutation.mutate({
                  code: amCode.trim().toUpperCase(),
                  name: amName.trim(),
                  category: amCategory,
                });
              }} className="d-flex flex-column gap-2 small">
                <div>
                  <label className="form-label text-muted fw-bold mb-1">Amenity Code *</label>
                  <input type="text" className="form-control form-control-sm font-monospace" placeholder="e.g. BALCONY, JACUZZI" required value={amCode} onChange={(e) => setAmCode(e.target.value)} />
                </div>
                <div>
                  <label className="form-label text-muted fw-bold mb-1">Display Name *</label>
                  <input type="text" className="form-control form-control-sm" placeholder="e.g. Private Balcony with Sea View" required value={amName} onChange={(e) => setAmName(e.target.value)} />
                </div>
                <div>
                  <label className="form-label text-muted fw-bold mb-1">Category</label>
                  <select className="form-select form-select-sm" value={amCategory} onChange={(e) => setAmCategory(e.target.value)}>
                    <option value="room">Room Feature</option>
                    <option value="bathroom">Bathroom</option>
                    <option value="media">Media &amp; Technology</option>
                    <option value="view">View &amp; Outdoors</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-sm btn-primary fw-semibold mt-2" disabled={createAmenityMutation.isPending}>
                  Save Amenity
                </button>
              </form>
            </div>
          </div>

          <div className="col-md-7">
            <div className="table-responsive rounded border bg-white">
              <table className="table table-sm table-hover align-middle mb-0 small">
                <thead className="table-light text-muted text-uppercase">
                  <tr>
                    <th className="ps-3">Code</th>
                    <th>Amenity Name</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {amenities?.map((am) => (
                    <tr key={am.id}>
                      <td className="ps-3 font-monospace fw-bold text-primary">{am.code}</td>
                      <td>{am.name}</td>
                      <td><span className="badge bg-light text-dark border text-capitalize">{am.category}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
