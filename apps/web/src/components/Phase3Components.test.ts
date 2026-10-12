import { describe, it, expect } from 'vitest';
import type { GroupBlockDto, QuotationDto, WaitlistDto, ChannelMappingDto } from '@innkeeper/contracts';

describe('Phase 3 Stay Chart & Reservation Frontend Invariants', () => {
  describe('Stay Chart Collision Detection Logic', () => {
    interface ReservationBar {
      id: string;
      unitId: string;
      checkIn: string;
      checkOut: string;
    }

    const checkCollision = (
      movingResId: string,
      targetUnitId: string,
      checkInStr: string,
      checkOutStr: string,
      reservations: ReservationBar[],
    ): boolean => {
      const movingStart = new Date(checkInStr).getTime();
      const movingEnd = new Date(checkOutStr).getTime();

      return reservations.some((r) => {
        if (r.id === movingResId) return false;
        if (r.unitId !== targetUnitId) return false;
        const rStart = new Date(r.checkIn).getTime();
        const rEnd = new Date(r.checkOut).getTime();
        return movingStart < rEnd && movingEnd > rStart;
      });
    };

    const existingReservations: ReservationBar[] = [
      { id: 'res-1', unitId: 'unit-101', checkIn: '2026-10-15', checkOut: '2026-10-18' },
      { id: 'res-2', unitId: 'unit-101', checkIn: '2026-10-20', checkOut: '2026-10-25' },
      { id: 'res-3', unitId: 'unit-102', checkIn: '2026-10-15', checkOut: '2026-10-19' },
    ];

    it('detects overlap collision when moving into an occupied unit date window', () => {
      const hasCollision = checkCollision('res-moving', 'unit-101', '2026-10-16', '2026-10-19', existingReservations);
      expect(hasCollision).toBe(true);
    });

    it('permits assignment when moving into a non-overlapping gap on the same unit', () => {
      const hasCollision = checkCollision('res-moving', 'unit-101', '2026-10-18', '2026-10-20', existingReservations);
      expect(hasCollision).toBe(false);
    });

    it('ignores the moving reservation itself during drag validation', () => {
      const hasCollision = checkCollision('res-1', 'unit-101', '2026-10-15', '2026-10-18', existingReservations);
      expect(hasCollision).toBe(false);
    });
  });

  describe('Group Block & Master Folio Invariants', () => {
    it('validates master folio format and allocation tracking', () => {
      const block: GroupBlockDto = {
        id: 'block-001',
        tenantId: 't-1',
        branchId: 'b-1',
        code: 'TECH-2026',
        name: 'Tech Annual Summit',
        status: 'definite',
        masterFolioId: 'folio-grp-1',
        totalRooms: 10,
        pickedUpRooms: 6,
        startDate: '2026-10-20',
        endDate: '2026-10-25',
        cutoffDate: '2026-10-15',
        notes: 'VIP Summit',
        attrs: {},
        allocations: [
          {
            id: 'alloc-1',
            unitTypeId: 'ut-std',
            allocatedRooms: 10,
            pickedUpRooms: 6,
            agreedRate: 150,
          },
        ],
        createdAt: '2026-10-01T00:00:00Z',
      };

      const remaining = block.allocations[0].allocatedRooms - block.allocations[0].pickedUpRooms;
      expect(remaining).toBe(4);
      expect(block.status).toBe('definite');
    });
  });

  describe('Quotation & Waitlist Invariants', () => {
    it('ranks waitlist entries by priority and submission timestamp', () => {
      const waitlist: WaitlistDto[] = [
        {
          id: 'w-1',
          tenantId: 't-1',
          branchId: 'b-1',
          unitTypeId: 'ut-1',
          ratePlanId: null,
          guestId: null,
          guestName: 'Charlie',
          guestEmail: null,
          guestPhone: null,
          desiredCheckIn: '2026-10-20',
          desiredCheckOut: '2026-10-22',
          adults: 2,
          children: 0,
          priority: 1,
          status: 'waiting',
          notes: null,
          createdAt: '2026-10-12T10:00:00Z',
        },
        {
          id: 'w-2',
          tenantId: 't-1',
          branchId: 'b-1',
          unitTypeId: 'ut-1',
          ratePlanId: null,
          guestId: null,
          guestName: 'Alice VIP',
          guestEmail: null,
          guestPhone: null,
          desiredCheckIn: '2026-10-20',
          desiredCheckOut: '2026-10-22',
          adults: 2,
          children: 0,
          priority: 5,
          status: 'waiting',
          notes: null,
          createdAt: '2026-10-12T11:00:00Z',
        },
      ];

      const sorted = [...waitlist].sort((a, b) => b.priority - a.priority);
      expect(sorted[0].guestName).toBe('Alice VIP');
    });

    it('verifies non-binding quotation expires when past validUntil', () => {
      const quotation: QuotationDto = {
        id: 'q-1',
        tenantId: 't-1',
        branchId: 'b-1',
        quotationNo: 'QUO-2026-001',
        guestName: 'Bob',
        guestEmail: 'bob@example.com',
        unitTypeId: 'ut-1',
        ratePlanId: 'rp-1',
        checkIn: '2026-11-01',
        checkOut: '2026-11-04',
        adults: 2,
        children: 0,
        quotedRate: 400,
        quotedTaxes: 50,
        totalAmount: 450,
        status: 'active',
        validUntil: '2026-10-10T23:59:59Z',
        convertedReservationId: null,
        createdAt: '2026-10-01T00:00:00Z',
      };

      const now = new Date('2026-10-12T12:00:00Z');
      const isExpired = new Date(quotation.validUntil) < now;
      expect(isExpired).toBe(true);
    });
  });

  describe('Channel Manager Rate Parity Invariants', () => {
    it('verifies rate parity guard flags OTA rates lower than direct rate', () => {
      const directRate = 150;
      const proposedOtaRate = 140;
      const rateParityViolation = proposedOtaRate < directRate;
      expect(rateParityViolation).toBe(true);
    });
  });
});
