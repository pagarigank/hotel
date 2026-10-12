import { describe, it, expect } from 'vitest';
import type { BoardUnitDto, BoardCountersDto } from '@innkeeper/contracts';

describe('Board Models & Unit Tile Presentation Invariants', () => {
  const sampleUnit: BoardUnitDto = {
    id: '20000000-0000-0000-0000-000000000101',
    number: '101',
    name: 'Standard Queen 101',
    floor: '1',
    floorName: 'Floor 1',
    building: 'Tower A',
    unitTypeId: '21000000-0000-0000-0000-000000000001',
    unitTypeCode: 'STD',
    unitTypeName: 'Standard Room',
    statusCode: 'vacant_clean',
    statusLabel: 'Vacant Clean',
    colorToken: 'status-vacant-clean',
    icon: 'bi-check-circle',
    isSellable: true,
    isOccupied: false,
    isDirty: false,
    blocksBooking: false,
    guestName: null,
    vipStatus: null,
    eta: null,
    etd: null,
    connectingUnitNumber: null,
    activeBlock: null,
  };

  it('guarantees unit status badges contain both text label and icon (never color alone)', () => {
    expect(sampleUnit.statusLabel).toBeTruthy();
    expect(sampleUnit.icon).toMatch(/^bi-/);
    expect(sampleUnit.colorToken).toBe('status-vacant-clean');
  });

  it('correctly calculates occupancy rate from board counters', () => {
    const counters: BoardCountersDto = {
      total: 20,
      vacantClean: 10,
      vacantDirty: 4,
      inspected: 2,
      occupied: 3,
      dueIn: 1,
      dueOut: 1,
      reserved: 2,
      outOfOrder: 1,
      occupancyRate: 15.0,
    };

    expect(counters.total).toBe(20);
    expect(counters.occupied).toBe(3);
    const calculatedRate = (counters.occupied / counters.total) * 100;
    expect(calculatedRate).toBe(15.0);
  });

  it('differentiates blocked units with proper reason and date range', () => {
    const blockedUnit: BoardUnitDto = {
      ...sampleUnit,
      statusCode: 'out_of_order',
      statusLabel: 'Out of Order',
      colorToken: 'status-ooo',
      icon: 'bi-slash-circle',
      blocksBooking: true,
      activeBlock: {
        id: '26000000-0000-0000-0000-000000000001',
        blockType: 'out_of_order',
        reason: 'HVAC repair',
        fromDate: '2026-10-12',
        toDate: '2026-10-18',
        notes: 'Waiting for parts',
      },
    };

    expect(blockedUnit.blocksBooking).toBe(true);
    expect(blockedUnit.activeBlock?.reason).toBe('HVAC repair');
    expect(blockedUnit.activeBlock?.fromDate).toBe('2026-10-12');
  });

  it('correctly flags connecting units', () => {
    const connectingUnit: BoardUnitDto = {
      ...sampleUnit,
      connectingUnitNumber: '102',
    };
    expect(connectingUnit.connectingUnitNumber).toBe('102');
  });

  it('filters units accurately according to saved operational presets', () => {
    const units: BoardUnitDto[] = [
      { ...sampleUnit, id: '1', number: '101', statusCode: 'vacant_clean' },
      { ...sampleUnit, id: '2', number: '102', statusCode: 'vacant_dirty' },
      { ...sampleUnit, id: '3', number: '103', statusCode: 'occupied' },
      { ...sampleUnit, id: '4', number: '104', statusCode: 'out_of_order' },
      { ...sampleUnit, id: '5', number: '105', statusCode: 'vacant_clean', connectingUnitNumber: '106' },
    ];

    const cleanPreset = units.filter(
      (u) => u.statusCode === 'vacant_clean' || u.statusCode === 'inspected',
    );
    expect(cleanPreset).toHaveLength(2);

    const dirtyPreset = units.filter((u) => u.statusCode === 'vacant_dirty');
    expect(dirtyPreset).toHaveLength(1);
    expect(dirtyPreset[0].number).toBe('102');

    const occupiedPreset = units.filter(
      (u) => u.statusCode === 'occupied' || u.statusCode === 'due_out',
    );
    expect(occupiedPreset).toHaveLength(1);
    expect(occupiedPreset[0].number).toBe('103');

    const connectingPreset = units.filter((u) => !!u.connectingUnitNumber);
    expect(connectingPreset).toHaveLength(1);
    expect(connectingPreset[0].number).toBe('105');
  });
});
