import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import pg from 'pg';
import crypto from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { EventsService } from '../properties/events.service.js';
import { FoliosService } from '../folios/folios.service.js';
import type {
  CheckInDto,
  RoomMoveDto,
  StayExtensionDto,
  CheckOutDto,
  StayDto,
} from '@innkeeper/contracts';

function formatDateOnly(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.split('T')[0];
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(val);
}

@Injectable()
export class StaysService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventsService) private readonly eventsService: EventsService,
    @Inject(FoliosService) private readonly foliosService: FoliosService,
  ) {}

  /**
   * Check-in Wizard (REQ-OPS-001)
   * Validates clean unit, sets occupied, generates stay & primary folio, keycard code & reg card
   */
  async checkIn(
    tenantId: string,
    dto: CheckInDto,
    userId?: string,
    existingClient?: pg.PoolClient,
  ): Promise<StayDto> {
    const runInClient = async (c: pg.PoolClient) => {
      // 1. Fetch Reservation & Unit details
      const ruRes = await c.query(
        `SELECT ru.*, r.branch_id, r.guest_id, r.status as res_status
         FROM reservation_units ru
         JOIN reservations r ON r.id = ru.reservation_id
         WHERE ru.id = $1 AND ru.tenant_id = $2
         FOR UPDATE`,
        [dto.reservationUnitId, tenantId],
      );
      if (ruRes.rows.length === 0) {
        throw new NotFoundException(`Reservation unit ${dto.reservationUnitId} not found`);
      }
      const ru = ruRes.rows[0];

      if (ru.status === 'in_house') {
        throw new ConflictException(`Reservation unit is already checked in`);
      }
      if (ru.status === 'cancelled' || ru.status === 'checked_out') {
        throw new BadRequestException(`Cannot check in reservation unit with status ${ru.status}`);
      }

      // 2. Verify target unit cleanliness and status
      const unitRes = await c.query(
        `SELECT u.*, ut.name as unit_type_name, u.number as unit_number
         FROM units u
         JOIN unit_types ut ON ut.id = u.unit_type_id
         WHERE u.id = $1 AND u.tenant_id = $2
         FOR UPDATE`,
        [dto.unitId, tenantId],
      );
      if (unitRes.rows.length === 0) {
        throw new NotFoundException(`Unit ${dto.unitId} not found`);
      }
      const unit = unitRes.rows[0];

      if (unit.status_code !== 'vacant_clean' && unit.status_code !== 'inspected') {
        throw new BadRequestException(
          `Unit ${unit.unit_number} cannot be assigned: unit status is '${unit.status_code}' (must be 'vacant_clean' or 'inspected')`,
        );
      }

      // 3. Create Stay record
      const stayId = crypto.randomUUID();
      const keycardCode = dto.keycardCode || `KEY-${unit.unit_number}-${Math.floor(1000 + Math.random() * 9000)}`;
      const regCardUrl = `/api/v1/stays/${stayId}/registration-card`;

      const insertStayRes = await c.query(
        `INSERT INTO stays (
          id, tenant_id, branch_id, reservation_id, reservation_unit_id,
          unit_id, guest_id, actual_check_in, expected_check_out,
          status, reg_card_pdf_url, keycard_code, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, 'in_house', $9, $10, 1)
        RETURNING *`,
        [
          stayId,
          tenantId,
          ru.branch_id,
          ru.reservation_id,
          ru.id,
          dto.unitId,
          ru.guest_id,
          ru.check_out,
          regCardUrl,
          keycardCode,
        ],
      );

      // 4. Update Unit to occupied
      await c.query(
        `UPDATE units
         SET status_code = 'occupied', updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [dto.unitId, tenantId],
      );

      // 5. Update Reservation Unit & Reservation status
      await c.query(
        `UPDATE reservation_units
         SET status = 'in_house', unit_id = $1
         WHERE id = $2 AND tenant_id = $3`,
        [dto.unitId, ru.id, tenantId],
      );

      await c.query(
        `UPDATE reservations
         SET status = 'in_house', updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [ru.reservation_id, tenantId],
      );

      // 6. Ensure Guest Folio exists for this stay
      const existingFolioRes = await c.query(
        `SELECT id FROM folios WHERE reservation_id = $1 AND tenant_id = $2`,
        [ru.reservation_id, tenantId],
      );
      if (existingFolioRes.rows.length === 0) {
        await this.foliosService.createFolio(
          tenantId,
          ru.branch_id,
          {
            stayId,
            reservationId: ru.reservation_id,
            kind: 'guest',
            currency: 'USD',
          },
          c,
        );
      } else {
        // Link existing folio to stay
        await c.query(
          `UPDATE folios SET stay_id = $1 WHERE id = $2`,
          [stayId, existingFolioRes.rows[0].id],
        );
      }

      // 7. Emit outbox event
      this.eventsService.broadcast(
        tenantId,
        'innkeeper.stays.checked_in',
        {
          stayId,
          reservationId: ru.reservation_id,
          unitId: dto.unitId,
          unitNumber: unit.unit_number,
          guestId: ru.guest_id,
        },
        ru.branch_id,
      );

      return this.mapStayRow(insertStayRes.rows[0], unit.unit_number, unit.unit_type_name);
    };

    if (existingClient) return runInClient(existingClient);
    return this.db.transaction(tenantId, runInClient);
  }

  /**
   * Room Move (REQ-OPS-002)
   * Changes occupied unit, marks old unit vacant_dirty + schedules HK checkout clean, moves to clean unit
   */
  async roomMove(
    tenantId: string,
    stayId: string,
    dto: RoomMoveDto,
    userId?: string,
    existingClient?: pg.PoolClient,
  ): Promise<StayDto> {
    const runInClient = async (c: pg.PoolClient) => {
      // 1. Fetch Stay
      const stayRes = await c.query(
        `SELECT s.*, u.number as old_unit_number, u.number as unit_number
         FROM stays s
         JOIN units u ON u.id = s.unit_id
         WHERE s.id = $1 AND s.tenant_id = $2
         FOR UPDATE`,
        [stayId, tenantId],
      );
      if (stayRes.rows.length === 0) {
        throw new NotFoundException(`Stay ${stayId} not found`);
      }
      const stay = stayRes.rows[0];

      if (stay.status !== 'in_house') {
        throw new BadRequestException(`Cannot move room for stay with status '${stay.status}'`);
      }
      if (stay.unit_id === dto.newUnitId) {
        throw new BadRequestException(`Guest is already assigned to unit ${dto.newUnitId}`);
      }

      // 2. Fetch new unit and verify cleanliness
      const newUnitRes = await c.query(
        `SELECT u.*, ut.name as unit_type_name, u.number as unit_number
         FROM units u
         JOIN unit_types ut ON ut.id = u.unit_type_id
         WHERE u.id = $1 AND u.tenant_id = $2
         FOR UPDATE`,
        [dto.newUnitId, tenantId],
      );
      if (newUnitRes.rows.length === 0) {
        throw new NotFoundException(`Destination unit ${dto.newUnitId} not found`);
      }
      const newUnit = newUnitRes.rows[0];

      if (newUnit.status_code !== 'vacant_clean' && newUnit.status_code !== 'inspected') {
        throw new BadRequestException(
          `Destination unit ${newUnit.unit_number} is not clean (status is '${newUnit.status_code}')`,
        );
      }

      // 3. Mark old unit vacant_dirty and create Housekeeping turnaround task
      await c.query(
        `UPDATE units SET status_code = 'vacant_dirty', updated_at = now() WHERE id = $1`,
        [stay.unit_id],
      );

      const hkTaskId = crypto.randomUUID();
      await c.query(
        `INSERT INTO hk_tasks (
          id, tenant_id, branch_id, unit_id, task_type, priority,
          status, notes
        ) VALUES ($1, $2, $3, $4, 'checkout_clean', 'high', 'pending', $5)`,
        [
          hkTaskId,
          tenantId,
          stay.branch_id,
          stay.unit_id,
          `Room move turnaround from Room ${stay.old_unit_number} to Room ${newUnit.unit_number}: ${dto.reason}`,
        ],
      );

      // 4. Mark new unit occupied
      await c.query(
        `UPDATE units SET status_code = 'occupied', updated_at = now() WHERE id = $1`,
        [dto.newUnitId],
      );

      // 5. Record room move audit
      const moveId = crypto.randomUUID();
      await c.query(
        `INSERT INTO room_moves (
          id, tenant_id, branch_id, stay_id, from_unit_id, to_unit_id,
          reason, moved_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          moveId,
          tenantId,
          stay.branch_id,
          stayId,
          stay.unit_id,
          dto.newUnitId,
          dto.reason,
          userId || '10000000-0000-0000-0000-000000000001',
        ],
      );

      // 6. Update Stay & Reservation Unit
      const updateStayRes = await c.query(
        `UPDATE stays
         SET unit_id = $1, version = version + 1, updated_at = now()
         WHERE id = $2
         RETURNING *`,
        [dto.newUnitId, stayId],
      );

      await c.query(
        `UPDATE reservation_units
         SET unit_id = $1
         WHERE id = $2`,
        [dto.newUnitId, stay.reservation_unit_id],
      );

      // 7. Emit event
      this.eventsService.broadcast(
        tenantId,
        'innkeeper.stays.room_moved',
        {
          stayId,
          fromUnitId: stay.unit_id,
          toUnitId: dto.newUnitId,
          reason: dto.reason,
        },
        stay.branch_id,
      );

      return this.mapStayRow(updateStayRes.rows[0], newUnit.unit_number, newUnit.unit_type_name);
    };

    if (existingClient) return runInClient(existingClient);
    return this.db.transaction(tenantId, runInClient);
  }

  /**
   * Stay Extension
   */
  async extendStay(
    tenantId: string,
    stayId: string,
    dto: StayExtensionDto,
    userId?: string,
    existingClient?: pg.PoolClient,
  ): Promise<StayDto> {
    const runInClient = async (c: pg.PoolClient) => {
      const stayRes = await c.query(
        `SELECT s.*, u.number as unit_number, ut.name as unit_type_name
         FROM stays s
         JOIN units u ON u.id = s.unit_id
         JOIN unit_types ut ON ut.id = u.unit_type_id
         WHERE s.id = $1 AND s.tenant_id = $2
         FOR UPDATE`,
        [stayId, tenantId],
      );
      if (stayRes.rows.length === 0) {
        throw new NotFoundException(`Stay ${stayId} not found`);
      }
      const stay = stayRes.rows[0];

      if (stay.status !== 'in_house') {
        throw new BadRequestException(`Cannot extend stay with status '${stay.status}'`);
      }

      const currentExpected = formatDateOnly(stay.expected_check_out);

      if (dto.newExpectedCheckOut <= currentExpected) {
        throw new BadRequestException(
          `New check out date (${dto.newExpectedCheckOut}) must be after current check out date (${currentExpected})`,
        );
      }

      // Check for conflicting reservations for this unit
      const conflictRes = await c.query(
        `SELECT id FROM reservation_units
         WHERE unit_id = $1 AND tenant_id = $2
           AND id != $3
           AND status IN ('hold', 'confirmed', 'in_house')
           AND daterange(check_in, check_out, '[)') && daterange($4, $5, '[)')`,
        [stay.unit_id, tenantId, stay.reservation_unit_id, currentExpected, dto.newExpectedCheckOut],
      );
      if (conflictRes.rows.length > 0) {
        throw new ConflictException(
          `Cannot extend: Unit ${stay.unit_number} is already booked by another reservation during the extension period`,
        );
      }

      // Update stay & reservation_units
      const updateRes = await c.query(
        `UPDATE stays
         SET expected_check_out = $1, version = version + 1, updated_at = now()
         WHERE id = $2
         RETURNING *`,
        [dto.newExpectedCheckOut, stayId],
      );

      await c.query(
        `UPDATE reservation_units
         SET check_out = $1
         WHERE id = $2`,
        [dto.newExpectedCheckOut, stay.reservation_unit_id],
      );

      this.eventsService.broadcast(
        tenantId,
        'innkeeper.stays.extended',
        {
          stayId,
          oldExpectedCheckOut: currentExpected,
          newExpectedCheckOut: dto.newExpectedCheckOut,
        },
        stay.branch_id,
      );

      return this.mapStayRow(updateRes.rows[0], stay.unit_number, stay.unit_type_name);
    };

    if (existingClient) return runInClient(existingClient);
    return this.db.transaction(tenantId, runInClient);
  }

  /**
   * Check-Out Wizard (REQ-OPS-003)
   * Enforces zero balance, marks vacant_dirty, schedules housekeeping departure turnaround task
   */
  async checkOut(
    tenantId: string,
    stayId: string,
    dto: CheckOutDto,
    userId?: string,
    existingClient?: pg.PoolClient,
  ): Promise<StayDto> {
    const runInClient = async (c: pg.PoolClient) => {
      // 1. Fetch Stay
      const stayRes = await c.query(
        `SELECT s.*, u.number as unit_number, ut.name as unit_type_name
         FROM stays s
         JOIN units u ON u.id = s.unit_id
         JOIN unit_types ut ON ut.id = u.unit_type_id
         WHERE s.id = $1 AND s.tenant_id = $2
         FOR UPDATE`,
        [stayId, tenantId],
      );
      if (stayRes.rows.length === 0) {
        throw new NotFoundException(`Stay ${stayId} not found`);
      }
      const stay = stayRes.rows[0];

      if (stay.status === 'checked_out') {
        throw new ConflictException(`Stay is already checked out`);
      }

      // 2. Folio Balance Verification
      const folioRes = await c.query(
        `SELECT * FROM folios WHERE (stay_id = $1 OR reservation_id = $2) AND tenant_id = $3`,
        [stayId, stay.reservation_id, tenantId],
      );
      if (folioRes.rows.length > 0) {
        const folio = folioRes.rows[0];
        const balance = Number(folio.balance);

        if (dto.settlementType === 'zero_balance' && Math.abs(balance) > 0.009) {
          throw new BadRequestException(
            `Cannot check out: Outstanding balance of ${folio.currency} ${balance.toFixed(2)} must be settled first`,
          );
        }

        // Close/settle folio
        await c.query(
          `UPDATE folios SET status = 'settled', updated_at = now() WHERE id = $1`,
          [folio.id],
        );
      }

      // 3. Mark Stay checked_out
      const updateStayRes = await c.query(
        `UPDATE stays
         SET status = 'checked_out', actual_check_out = now(), version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [stayId],
      );

      // 4. Mark Reservation Unit and Reservation checked_out
      await c.query(
        `UPDATE reservation_units SET status = 'checked_out' WHERE id = $1`,
        [stay.reservation_unit_id],
      );

      const otherUnitsRes = await c.query(
        `SELECT id FROM reservation_units WHERE reservation_id = $1 AND status != 'checked_out'`,
        [stay.reservation_id],
      );
      if (otherUnitsRes.rows.length === 0) {
        await c.query(
          `UPDATE reservations SET status = 'checked_out', updated_at = now() WHERE id = $1`,
          [stay.reservation_id],
        );
      }

      // 5. Update Unit status to vacant_dirty
      await c.query(
        `UPDATE units SET status_code = 'vacant_dirty', updated_at = now() WHERE id = $1`,
        [stay.unit_id],
      );

      // 6. Automatically generate Housekeeping checkout clean task
      const hkTaskId = crypto.randomUUID();
      await c.query(
        `INSERT INTO hk_tasks (
          id, tenant_id, branch_id, unit_id, task_type, priority,
          status, notes
        ) VALUES ($1, $2, $3, $4, 'checkout_clean', 'high', 'pending', $5)`,
        [
          hkTaskId,
          tenantId,
          stay.branch_id,
          stay.unit_id,
          `Departure turnaround following checkout of Room ${stay.unit_number}`,
        ],
      );

      // 7. Emit event
      this.eventsService.broadcast(
        tenantId,
        'innkeeper.stays.checked_out',
        {
          stayId,
          unitId: stay.unit_id,
          unitNumber: stay.unit_number,
        },
        stay.branch_id,
      );

      return this.mapStayRow(updateStayRes.rows[0], stay.unit_number, stay.unit_type_name);
    };

    if (existingClient) return runInClient(existingClient);
    return this.db.transaction(tenantId, runInClient);
  }

  /**
   * List Stays
   */
  async getStays(
    tenantId: string,
    filters?: { branchId?: string; status?: string; unitId?: string },
  ): Promise<StayDto[]> {
    let sql = `
      SELECT s.*, u.number as unit_number, ut.name as unit_type_name,
             g.first_name || ' ' || g.last_name as guest_name,
             r.reservation_no,
             f.id as folio_id, f.balance as folio_balance
      FROM stays s
      JOIN units u ON u.id = s.unit_id
      LEFT JOIN unit_types ut ON ut.id = u.unit_type_id
      JOIN guests g ON g.id = s.guest_id
      LEFT JOIN reservations r ON r.id = s.reservation_id
      LEFT JOIN folios f ON f.stay_id = s.id AND f.kind = 'guest'
      WHERE s.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (filters?.branchId) {
      params.push(filters.branchId);
      sql += ` AND s.branch_id = $${params.length}`;
    }
    if (filters?.status) {
      params.push(filters.status);
      sql += ` AND s.status = $${params.length}`;
    }
    if (filters?.unitId) {
      params.push(filters.unitId);
      sql += ` AND s.unit_id = $${params.length}`;
    }

    sql += ` ORDER BY s.actual_check_in DESC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client: pg.PoolClient) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) =>
      this.mapStayRow(r, r.unit_number, r.unit_type_name, r.guest_name, r.folio_id, r.folio_balance != null ? Number(r.folio_balance) : undefined, r.reservation_no),
    );
  }

  /**
   * Get Stay by ID
   */
  async getStayById(tenantId: string, stayId: string): Promise<StayDto> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client: pg.PoolClient) => {
      return client.query(
        `SELECT s.*, u.number as unit_number, ut.name as unit_type_name,
                g.first_name || ' ' || g.last_name as guest_name,
                r.reservation_no,
                f.id as folio_id, f.balance as folio_balance
         FROM stays s
         JOIN units u ON u.id = s.unit_id
         LEFT JOIN unit_types ut ON ut.id = u.unit_type_id
         JOIN guests g ON g.id = s.guest_id
         LEFT JOIN reservations r ON r.id = s.reservation_id
         LEFT JOIN folios f ON f.stay_id = s.id AND f.kind = 'guest'
         WHERE s.id = $1 AND s.tenant_id = $2`,
        [stayId, tenantId],
      );
    });

    if (res.rows.length === 0) {
      throw new NotFoundException(`Stay ${stayId} not found`);
    }
    const r = res.rows[0];
    return this.mapStayRow(
      r,
      r.unit_number,
      r.unit_type_name,
      r.guest_name,
      r.folio_id,
      r.folio_balance != null ? Number(r.folio_balance) : undefined,
      r.reservation_no,
    );
  }

  private mapStayRow(
    row: any,
    unitNumber?: string,
    unitTypeName?: string,
    guestName?: string,
    folioId?: string,
    folioBalance?: number,
    reservationNo?: string,
  ): StayDto {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      reservationId: row.reservation_id,
      reservationUnitId: row.reservation_unit_id,
      unitId: row.unit_id,
      unitNumber: unitNumber || row.unit_number,
      unitTypeName: unitTypeName || row.unit_type_name,
      guestId: row.guest_id,
      guestName: guestName || row.guest_name,
      actualCheckIn: row.actual_check_in instanceof Date ? row.actual_check_in.toISOString() : String(row.actual_check_in),
      expectedCheckOut: formatDateOnly(row.expected_check_out),
      actualCheckOut: row.actual_check_out ? (row.actual_check_out instanceof Date ? row.actual_check_out.toISOString() : String(row.actual_check_out)) : null,
      status: row.status,
      keycardCode: row.keycard_code,
      registrationCardSigned: !!row.reg_card_pdf_url,
      folioId: folioId || row.folio_id,
      folioBalance: folioBalance !== undefined ? folioBalance : (row.folio_balance != null ? Number(row.folio_balance) : undefined),
      reservationNo: reservationNo || row.reservation_no,
      version: row.version,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    };
  }
}
