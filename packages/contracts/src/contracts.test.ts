import { describe, it, expect } from 'vitest';
import {
  ProblemErrorSchema,
  TenantSchema,
  BranchSchema,
  BoardResponseSchema,
  GuestSchema,
  ReservationDtoSchema,
  StayDtoSchema,
  FolioDtoSchema,
  PostFolioLineDtoSchema,
  RecordPaymentDtoSchema,
  NightAuditDtoSchema,
  HkTaskDtoSchema,
} from './index.js';

describe('Contracts & DTOs Validation', () => {
  it('validates RFC 7807 ProblemError structure', () => {
    const err = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      code: 'ROOM_NOT_AVAILABLE',
      correlationId: '01a12bcf-13ec-7665-b2cb-9987acf9c707',
      detail: 'Unit is occupied',
    };
    expect(() => ProblemErrorSchema.parse(err)).not.toThrow();
  });

  it('validates Tenant DTO', () => {
    const tenant = {
      id: 'a0000000-0000-0000-0000-000000000001',
      slug: 'acme-hotel',
      name: 'Acme Grand Hotel',
      plan: 'enterprise',
      active: true,
      createdAt: new Date().toISOString(),
    };
    expect(() => TenantSchema.parse(tenant)).not.toThrow();
  });

  it('validates Branch DTO with business date', () => {
    const branch = {
      id: 'b0000000-0000-0000-0000-000000000001',
      tenantId: 'a0000000-0000-0000-0000-000000000001',
      code: 'MNL-MAIN',
      name: 'Manila Main Hotel',
      timezone: 'Asia/Manila',
      baseCurrency: 'PHP',
      businessDate: '2026-10-12',
      active: true,
    };
    expect(() => BranchSchema.parse(branch)).not.toThrow();
  });

  it('validates BoardResponseSchema structure', () => {
    const board = {
      branchId: 'b0000000-0000-0000-0000-000000000001',
      branchName: 'Manila Main Hotel',
      businessDate: '2026-10-12',
      counters: {
        total: 20,
        vacantClean: 8,
        vacantDirty: 4,
        inspected: 2,
        occupied: 4,
        dueIn: 1,
        dueOut: 1,
        reserved: 1,
        outOfOrder: 1,
        occupancyRate: 20,
      },
      floors: [
        {
          floor: '1',
          floorName: '1st Floor',
          building: 'Main Tower A',
          units: [
            {
              id: '56000000-0000-0000-0000-000000000101',
              number: '101',
              floor: '1',
              building: 'Main Tower A',
              unitTypeId: '55000000-0000-0000-0000-000000000001',
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
            },
          ],
        },
      ],
      generatedAt: new Date().toISOString(),
      etag: '"board-v1"',
    };
    expect(() => BoardResponseSchema.parse(board)).not.toThrow();
  });

  it('validates Phase 3 Guest and Reservation contracts', () => {
    const guest = {
      id: '30000000-0000-0000-0000-000000000001',
      tenantId: 'a0000000-0000-0000-0000-000000000001',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      vipStatus: 'standard' as const,
      isPseudonymized: false,
      attrs: {},
      version: 1,
      createdAt: new Date().toISOString(),
    };
    expect(() => GuestSchema.parse(guest)).not.toThrow();

    const reservation = {
      id: '36000000-0000-0000-0000-000000000001',
      tenantId: 'a0000000-0000-0000-0000-000000000001',
      branchId: 'b0000000-0000-0000-0000-000000000001',
      reservationNo: 'RSV-2026-0001',
      status: 'confirmed' as const,
      guestId: '30000000-0000-0000-0000-000000000001',
      guestName: 'John Doe',
      source: 'direct',
      policySnapshot: { ratePlan: 'BAR' },
      attrs: {},
      version: 1,
      totalAmount: 360,
      totalNights: 3,
      units: [
        {
          id: '37000000-0000-0000-0000-000000000001',
          reservationId: '36000000-0000-0000-0000-000000000001',
          unitTypeId: '55000000-0000-0000-0000-000000000001',
          unitTypeCode: 'STD',
          unitTypeName: 'Standard Room',
          unitNumber: '101',
          ratePlanId: '35000000-0000-0000-0000-000000000001',
          ratePlanCode: 'BAR',
          ratePlanName: 'Best Available Rate',
          checkIn: '2026-10-12',
          checkOut: '2026-10-15',
          adults: 2,
          children: 0,
          status: 'confirmed',
          totalRate: 360,
          nights: [
            { stayDate: '2026-10-12', rate: 120, taxSnapshot: [] },
            { stayDate: '2026-10-13', rate: 120, taxSnapshot: [] },
            { stayDate: '2026-10-14', rate: 120, taxSnapshot: [] },
          ],
        },
      ],
      createdAt: new Date().toISOString(),
    };
    expect(() => ReservationDtoSchema.parse(reservation)).not.toThrow();
  });

  it('validates Phase 4 Front Desk, Folio, Payment, Night Audit and HK contracts', () => {
    const stay = {
      id: '70000000-0000-0000-0000-000000000001',
      tenantId: 'a0000000-0000-0000-0000-000000000001',
      branchId: 'b0000000-0000-0000-0000-000000000001',
      reservationId: '36000000-0000-0000-0000-000000000001',
      reservationUnitId: '37000000-0000-0000-0000-000000000001',
      unitId: '56000000-0000-0000-0000-000000000101',
      guestId: '30000000-0000-0000-0000-000000000001',
      actualCheckIn: new Date().toISOString(),
      expectedCheckOut: '2026-10-15',
      status: 'in_house' as const,
      registrationCardSigned: true,
      version: 1,
      createdAt: new Date().toISOString(),
    };
    expect(() => StayDtoSchema.parse(stay)).not.toThrow();

    const postLine = {
      windowNo: 1,
      lineType: 'charge' as const,
      chargeType: 'fnb' as const,
      description: 'Breakfast Buffet',
      qty: 2,
      unitAmount: 25,
      taxAmount: 5,
    };
    expect(() => PostFolioLineDtoSchema.parse(postLine)).not.toThrow();

    const payment = {
      windowNo: 1,
      amount: 150,
      paymentMethod: 'card' as const,
      cardToken: 'tok_visa_4242',
      lastFour: '4242',
    };
    expect(() => RecordPaymentDtoSchema.parse(payment)).not.toThrow();

    const nightAudit = {
      id: '99000000-0000-0000-0000-000000000001',
      tenantId: 'a0000000-0000-0000-0000-000000000001',
      branchId: 'b0000000-0000-0000-0000-000000000001',
      businessDate: '2026-10-12',
      status: 'completed' as const,
      startedAt: new Date().toISOString(),
      steps: [
        {
          stepKey: 'room_tax_posting' as const,
          status: 'completed' as const,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        },
      ],
    };
    expect(() => NightAuditDtoSchema.parse(nightAudit)).not.toThrow();

    const hkTask = {
      id: '85000000-0000-0000-0000-000000000001',
      tenantId: 'a0000000-0000-0000-0000-000000000001',
      branchId: 'b0000000-0000-0000-0000-000000000001',
      unitId: '56000000-0000-0000-0000-000000000102',
      taskType: 'checkout_clean' as const,
      priority: 'high' as const,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };
    expect(() => HkTaskDtoSchema.parse(hkTask)).not.toThrow();
  });
});

