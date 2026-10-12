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
import { RatesService } from '../rates/rates.service.js';
import { GuestsService } from '../guests/guests.service.js';
import { EventsService } from '../properties/events.service.js';
import { UiService } from '../config/ui.service.js';
import type {
  CreateReservationDto,
  WalkInBookingDto,
  ModifyReservationDto,
  ReservationDto,
  ReservationUnitItemDto,
} from '@innkeeper/contracts';

@Injectable()
export class ReservationsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RatesService) private readonly ratesService: RatesService,
    @Inject(GuestsService) private readonly guestsService: GuestsService,
    @Inject(EventsService) private readonly eventsService: EventsService,
    @Inject(UiService) private readonly ui: UiService,
  ) {}

  /**
   * Create Reservation (REQ-RSV-002 / REQ-RSV-003 / REQ-RSV-004)
   * Enforces atomic inventory decrements under row lock & anti-double-booking exclusion constraints
   */
  async createReservation(
    tenantId: string,
    dto: CreateReservationDto,
    userId?: string,
    existingClient?: pg.PoolClient,
  ): Promise<ReservationDto> {
    if (dto.attrs && Object.keys(dto.attrs).length > 0) {
      const validation = await this.ui.validateEntityAttrs(tenantId, 'reservation', dto.attrs);
      if (!validation.success) {
        throw new BadRequestException({
          error: 'invalid_custom_fields',
          message: 'Reservation attributes failed validation',
          details: validation.issues,
        });
      }
    }

    const runInClient = async (client: pg.PoolClient) => {
      // 1. Resolve or Create Guest
      let guestId = dto.guestId;
      if (!guestId) {
        if (!dto.guest?.firstName || !dto.guest?.lastName) {
          throw new BadRequestException('Either guestId or guest details must be provided');
        }
        const guestResult = await this.guestsService.createGuest(
          tenantId,
          {
            firstName: dto.guest.firstName,
            lastName: dto.guest.lastName,
            email: dto.guest.email,
            phone: dto.guest.phone,
          },
          userId,
          client,
        );
        guestId = guestResult.guest.id;
      }

      // Verify guest
      const guestRes = await client.query(
        `SELECT id, first_name, last_name, email, phone FROM guests WHERE tenant_id = $1 AND id = $2`,
        [tenantId, guestId],
      );
      if (guestRes.rows.length === 0) {
        throw new NotFoundException(`Guest with ID ${guestId} not found`);
      }
      const guest = guestRes.rows[0];

      // 2. Validate dates, lock inventory, and calculate quotes for all requested units
      let totalAmount = 0;
      let totalNights = 0;
      let policySnapshot: Record<string, any> = {};
      const preparedUnits: Array<{
        item: (typeof dto.units)[0];
        quote: any;
      }> = [];

      for (const item of dto.units) {
        const checkInDate = new Date(item.checkIn);
        const checkOutDate = new Date(item.checkOut);

        if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime()) || checkOutDate <= checkInDate) {
          throw new BadRequestException('checkOut must be strictly after checkIn');
        }

        // Generate stay dates
        const stayDates: string[] = [];
        const curr = new Date(checkInDate);
        while (curr < checkOutDate) {
          stayDates.push(curr.toISOString().slice(0, 10));
          curr.setDate(curr.getDate() + 1);
        }
        totalNights += stayDates.length;

        // Atomic row locking on inventory capacity (REQ-RSV-004)
        const invLockRes = await client.query(
          `SELECT stay_date::text AS stay_date, capacity, sold, overbook_allowance, stop_sell
           FROM room_type_inventory
           WHERE tenant_id = $1 AND branch_id = $2 AND unit_type_id = $3
             AND stay_date >= $4 AND stay_date < $5
           ORDER BY stay_date ASC
           FOR UPDATE`,
          [tenantId, dto.branchId, item.unitTypeId, item.checkIn, item.checkOut],
        );

        if (invLockRes.rows.length > 0) {
          for (const invRow of invLockRes.rows) {
            if (invRow.stop_sell) {
              throw new ConflictException(`ROOM_NOT_AVAILABLE: Stop-sell active on ${invRow.stay_date}`);
            }
            if (Number(invRow.sold) >= Number(invRow.capacity) + Number(invRow.overbook_allowance)) {
              throw new ConflictException(`ROOM_NOT_AVAILABLE: No remaining capacity on ${invRow.stay_date}`);
            }
          }

          // Atomically increment sold count (guarded by DB CHECK sold <= capacity + overbook_allowance)
          try {
            await client.query(
              `UPDATE room_type_inventory
               SET sold = sold + 1
               WHERE tenant_id = $1 AND branch_id = $2 AND unit_type_id = $3
                 AND stay_date >= $4 AND stay_date < $5`,
              [tenantId, dto.branchId, item.unitTypeId, item.checkIn, item.checkOut],
            );
          } catch (dbErr: any) {
            if (dbErr.code === '23514') {
              throw new ConflictException('ROOM_NOT_AVAILABLE: No remaining capacity on selected dates');
            }
            throw dbErr;
          }
        } else {
          // If no pre-seeded inventory rows, initialize capacity and set sold = 1
          const totalUnitsCountRes = await client.query(
            `SELECT count(*)::int AS count FROM units WHERE tenant_id = $1 AND branch_id = $2 AND unit_type_id = $3 AND deleted_at IS NULL`,
            [tenantId, dto.branchId, item.unitTypeId],
          );
          const capacity = Math.max(1, totalUnitsCountRes.rows[0]?.count || 1);

          for (const sDate of stayDates) {
            try {
              await client.query(
                `INSERT INTO room_type_inventory (tenant_id, branch_id, unit_type_id, stay_date, capacity, sold, overbook_allowance)
                 VALUES ($1, $2, $3, $4, $5, 1, 0)
                 ON CONFLICT (tenant_id, branch_id, unit_type_id, stay_date)
                 DO UPDATE SET sold = room_type_inventory.sold + 1`,
                [tenantId, dto.branchId, item.unitTypeId, sDate, capacity],
              );
            } catch (dbErr: any) {
              if (dbErr.code === '23514') {
                throw new ConflictException('ROOM_NOT_AVAILABLE: No remaining capacity on selected dates');
              }
              throw dbErr;
            }
          }
        }

        // Calculate pricing quote using the same client
        const quote = await this.ratesService.calculatePriceQuote(
          tenantId,
          {
            branchId: dto.branchId,
            unitTypeId: item.unitTypeId,
            ratePlanId: item.ratePlanId,
            checkIn: item.checkIn,
            checkOut: item.checkOut,
            adults: item.adults,
            children: item.children,
          },
          client,
        );

        totalAmount += quote.totalAmount;
        policySnapshot = { ...policySnapshot, ...quote.policySnapshot };
        preparedUnits.push({ item, quote });
      }

      // 3. Generate Unique Sequential Reservation Number
      const randomSuffix = `${Date.now().toString().slice(-5)}${crypto.randomInt(1000, 9999)}`;
      const currentYear = new Date().getFullYear();
      const reservationNo = `RSV-${currentYear}-${randomSuffix}`;
      const reservationId = crypto.randomUUID();

      // 4. Insert Reservation master record
      await client.query(
        `INSERT INTO reservations (id, tenant_id, branch_id, reservation_no, status, guest_id, company_id, source, channel_ref, policy_snapshot, notes, attrs, version, created_by)
         VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, $7, $8, $9, $10, $11, 1, $12)`,
        [
          reservationId,
          tenantId,
          dto.branchId,
          reservationNo,
          guestId,
          dto.companyId || null,
          dto.source || 'direct',
          dto.channelRef || null,
          JSON.stringify(policySnapshot),
          dto.notes || null,
          JSON.stringify(dto.attrs || {}),
          userId || null,
        ],
      );

      // 5. Insert reservation_units and reservation_nights
      const unitItems: ReservationUnitItemDto[] = [];
      for (const { item, quote } of preparedUnits) {
        const reservationUnitId = crypto.randomUUID();
        try {
          await client.query(
            `INSERT INTO reservation_units (id, tenant_id, branch_id, reservation_id, unit_type_id, unit_id, rate_plan_id, check_in, check_out, adults, children, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'confirmed')`,
            [
              reservationUnitId,
              tenantId,
              dto.branchId,
              reservationId,
              item.unitTypeId,
              item.unitId || null,
              item.ratePlanId,
              item.checkIn,
              item.checkOut,
              item.adults,
              item.children,
            ],
          );
        } catch (dbErr: any) {
          if (dbErr.code === '23P01') {
            // Exclusion constraint violation: anti-double-booking
            throw new ConflictException('ROOM_NOT_AVAILABLE: Assigned unit is already reserved for overlapping dates');
          }
          throw dbErr;
        }

        const nightsData: any[] = [];
        for (const nb of quote.nightlyBreakdown) {
          await client.query(
            `INSERT INTO reservation_nights (tenant_id, reservation_unit_id, stay_date, rate, tax_snapshot)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (tenant_id, reservation_unit_id, stay_date) DO NOTHING`,
            [tenantId, reservationUnitId, nb.stayDate, nb.roomRate, JSON.stringify(nb.taxes)],
          );
          nightsData.push({
            stayDate: nb.stayDate,
            rate: nb.roomRate,
            taxSnapshot: nb.taxes,
          });
        }

        let unitNumber: string | null = null;
        if (item.unitId) {
          const uRes = await client.query(`SELECT number FROM units WHERE id = $1`, [item.unitId]);
          unitNumber = uRes.rows[0]?.number || null;
        }

        unitItems.push({
          id: reservationUnitId,
          reservationId,
          unitTypeId: item.unitTypeId,
          unitTypeCode: quote.unitTypeName.slice(0, 3).toUpperCase(),
          unitTypeName: quote.unitTypeName,
          unitId: item.unitId || null,
          unitNumber,
          ratePlanId: item.ratePlanId,
          ratePlanCode: quote.policySnapshot?.ratePlanCode || 'BAR',
          ratePlanName: quote.ratePlanName,
          checkIn: item.checkIn,
          checkOut: item.checkOut,
          adults: item.adults,
          children: item.children,
          status: 'confirmed' as const,
          totalRate: quote.totalAmount,
          nights: nightsData,
        });
      }

      // 5. Emit Transactional Outbox Event
      await client.query(
        `INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES (gen_random_uuid(), $1, 'reservation', $2, 'reservation.created', $3, 'pending')`,
        [
          tenantId,
          reservationId,
          JSON.stringify({
            reservationId,
            reservationNo,
            guestId,
            guestName: `${guest.first_name} ${guest.last_name}`,
            totalAmount,
            totalNights,
            unitsCount: dto.units.length,
          }),
        ],
      );

      // 6. Broadcast Real-time SSE
      this.eventsService.broadcast(
        tenantId,
        'reservation.created',
        {
          reservationId,
          reservationNo,
          branchId: dto.branchId,
        },
        dto.branchId,
      );

      return {
        id: reservationId,
        tenantId,
        branchId: dto.branchId,
        reservationNo,
        status: 'confirmed' as const,
        guestId,
        guestName: `${guest.first_name} ${guest.last_name}`,
        guestEmail: guest.email,
        guestPhone: guest.phone,
        companyId: dto.companyId || null,
        companyName: null,
        source: dto.source || 'direct',
        channelRef: dto.channelRef || null,
        holdExpiresAt: null,
        policySnapshot,
        notes: dto.notes || null,
        attrs: dto.attrs || {},
        version: 1,
        totalAmount: Number(totalAmount.toFixed(2)),
        totalNights,
        units: unitItems,
        createdAt: new Date().toISOString(),
      };
    };

    if (existingClient) {
      return runInClient(existingClient);
    }
    return this.db.transaction(tenantId, runInClient);
  }

  /**
   * Walk-In Quick Booking in <= 3 clicks (REQ-RSV-014)
   */
  async walkInBooking(
    tenantId: string,
    dto: WalkInBookingDto,
    userId?: string,
  ): Promise<ReservationDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      // 1. Get Unit info & Unit Type
      const uRes = await client.query(
        `SELECT u.id, u.number, u.unit_type_id, u.status_code, u.is_sellable,
                ut.id AS "unitTypeId", ut.base_rate::float AS "baseRate"
         FROM units u
         JOIN unit_types ut ON ut.id = u.unit_type_id
         WHERE u.tenant_id = $1 AND u.branch_id = $2 AND u.id = $3`,
        [tenantId, dto.branchId, dto.unitId],
      );
      if (uRes.rows.length === 0) {
        throw new NotFoundException(`Room with ID ${dto.unitId} not found`);
      }
      const unit = uRes.rows[0];

      if (!unit.is_sellable) {
        throw new BadRequestException(`Room ${unit.number} is marked stop-sell or out of order`);
      }

      // 2. Resolve Rate Plan (default to Best Available Rate if not specified)
      let ratePlanId = dto.ratePlanId;
      if (!ratePlanId) {
        const rpRes = await client.query(
          `SELECT id FROM rate_plans WHERE tenant_id = $1 AND branch_id = $2 AND code = 'BAR' LIMIT 1`,
          [tenantId, dto.branchId],
        );
        ratePlanId = rpRes.rows[0]?.id;
      }
      if (!ratePlanId) {
        const rpFallback = await client.query(
          `SELECT id FROM rate_plans WHERE tenant_id = $1 AND branch_id = $2 AND is_active = true LIMIT 1`,
          [tenantId, dto.branchId],
        );
        ratePlanId = rpFallback.rows[0]?.id;
      }
      if (!ratePlanId) {
        throw new BadRequestException('No active rate plan found for branch');
      }

      // 3. Create Reservation
      const reservation = await this.createReservation(
        tenantId,
        {
          branchId: dto.branchId,
          guest: dto.guest,
          source: 'walk_in',
          notes: dto.notes || `Walk-in booking for Room ${unit.number}`,
          attrs: {},
          units: [
            {
              unitTypeId: unit.unitTypeId,
              unitId: unit.id,
              ratePlanId,
              checkIn: dto.checkIn,
              checkOut: dto.checkOut,
              adults: dto.adults || 1,
              children: dto.children || 0,
            },
          ],
        },
        userId,
        client,
      );

      // 4. Update room status to occupied or due_in
      await client.query(
        `UPDATE units SET status_code = 'due_in', status_changed_at = now() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, dto.unitId],
      );

      return reservation;
    });
  }

  /**
   * Temporary Booking Hold with Automated Expiration (REQ-RSV-005)
   */
  async holdReservation(
    tenantId: string,
    dto: {
      branchId: string;
      unitTypeId: string;
      ratePlanId: string;
      checkIn: string;
      checkOut: string;
      adults: number;
      children?: number;
      ttlMinutes?: number;
      guest?: { firstName: string; lastName: string; email?: string; phone?: string };
    },
    sessionId: string,
  ): Promise<{ holdId: string; reservationId: string; expiresAt: string }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const ttl = dto.ttlMinutes || 15;
      const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

      const reservation = await this.createReservation(tenantId, {
        branchId: dto.branchId,
        source: 'hold',
        guest: dto.guest || { firstName: 'Hold', lastName: 'Guest' },
        attrs: {},
        units: [
          {
            unitTypeId: dto.unitTypeId,
            ratePlanId: dto.ratePlanId,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            adults: dto.adults,
            children: dto.children || 0,
          },
        ],
      });

      // Update status to 'hold'
      await client.query(
        `UPDATE reservations SET status = 'hold', hold_expires_at = $1 WHERE id = $2`,
        [expiresAt, reservation.id],
      );
      await client.query(
        `UPDATE reservation_units SET status = 'hold' WHERE reservation_id = $1`,
        [reservation.id],
      );

      const holdId = crypto.randomUUID();
      await client.query(
        `INSERT INTO holds (id, tenant_id, branch_id, reservation_unit_id, session_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [holdId, tenantId, dto.branchId, reservation.units[0].id, sessionId, expiresAt],
      );

      return {
        holdId,
        reservationId: reservation.id,
        expiresAt,
      };
    });
  }

  /**
   * Cancel Reservation with Atomic Inventory Restoration (REQ-RSV-006)
   */
  async cancelReservation(
    tenantId: string,
    id: string,
    reason?: string,
  ): Promise<{ cancelled: boolean; reservationNo: string }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, branch_id, reservation_no, status FROM reservations WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, id],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException(`Reservation with ID ${id} not found`);
      }
      const reservation = res.rows[0];

      if (reservation.status === 'cancelled') {
        return { cancelled: true, reservationNo: reservation.reservation_no };
      }

      // Fetch booked nights to decrement inventory sold counters
      const ruRes = await client.query(
        `SELECT ru.id, ru.unit_type_id, ru.check_in, ru.check_out, ru.branch_id
         FROM reservation_units ru
         WHERE ru.tenant_id = $1 AND ru.reservation_id = $2`,
        [tenantId, id],
      );

      for (const ru of ruRes.rows) {
        await client.query(
          `UPDATE room_type_inventory
           SET sold = GREATEST(0, sold - 1)
           WHERE tenant_id = $1 AND branch_id = $2 AND unit_type_id = $3
             AND stay_date >= $4 AND stay_date < $5`,
          [tenantId, ru.branch_id, ru.unit_type_id, ru.check_in, ru.check_out],
        );
      }

      // Update statuses
      await client.query(
        `UPDATE reservations SET status = 'cancelled', updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id],
      );
      await client.query(
        `UPDATE reservation_units SET status = 'cancelled' WHERE tenant_id = $1 AND reservation_id = $2`,
        [tenantId, id],
      );

      // Emit outbox
      await client.query(
        `INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES (gen_random_uuid(), $1, 'reservation', $2, 'reservation.cancelled', $3, 'pending')`,
        [
          tenantId,
          id,
          JSON.stringify({ reservationId: id, reservationNo: reservation.reservation_no, reason }),
        ],
      );

      return { cancelled: true, reservationNo: reservation.reservation_no };
    });
  }

  /**
   * Mark Reservation as No-Show with Atomic Inventory Restoration (REQ-RSV-006)
   */
  async noShowReservation(
    tenantId: string,
    id: string,
    notes?: string,
  ): Promise<{ noShow: boolean; reservationNo: string }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, branch_id, reservation_no, status FROM reservations WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, id],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException(`Reservation with ID ${id} not found`);
      }
      const reservation = res.rows[0];

      if (reservation.status === 'no_show') {
        return { noShow: true, reservationNo: reservation.reservation_no };
      }

      // Fetch booked nights to decrement inventory sold counters
      const ruRes = await client.query(
        `SELECT ru.id, ru.unit_type_id, ru.check_in, ru.check_out, ru.branch_id
         FROM reservation_units ru
         WHERE ru.tenant_id = $1 AND ru.reservation_id = $2`,
        [tenantId, id],
      );

      for (const ru of ruRes.rows) {
        await client.query(
          `UPDATE room_type_inventory
           SET sold = GREATEST(0, sold - 1)
           WHERE tenant_id = $1 AND branch_id = $2 AND unit_type_id = $3
             AND stay_date >= $4 AND stay_date < $5`,
          [tenantId, ru.branch_id, ru.unit_type_id, ru.check_in, ru.check_out],
        );
      }

      // Update statuses
      await client.query(
        `UPDATE reservations SET status = 'no_show', notes = COALESCE($3, notes), updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, notes ? `No-show: ${notes}` : 'No-show marked by front desk'],
      );
      await client.query(
        `UPDATE reservation_units SET status = 'no_show' WHERE tenant_id = $1 AND reservation_id = $2`,
        [tenantId, id],
      );

      // Emit outbox
      await client.query(
        `INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES (gen_random_uuid(), $1, 'reservation', $2, 'reservation.no_show', $3, 'pending')`,
        [
          tenantId,
          id,
          JSON.stringify({ reservationId: id, reservationNo: reservation.reservation_no, notes }),
        ],
      );

      return { noShow: true, reservationNo: reservation.reservation_no };
    });
  }

  /**
   * Modify Reservation (REQ-RSV-006)
   */
  async modifyReservation(
    tenantId: string,
    id: string,
    dto: ModifyReservationDto,
  ): Promise<ReservationDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `UPDATE reservations
         SET status = COALESCE($3, status),
             notes = COALESCE($4, notes),
             guest_id = COALESCE($5, guest_id),
             version = version + 1,
             updated_at = now()
         WHERE tenant_id = $1 AND id = $2
         RETURNING branch_id`,
        [tenantId, id, dto.status, dto.notes, dto.guestId],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException(`Reservation ${id} not found`);
      }
      return this.getReservationById(tenantId, id);
    });
  }

  /**
   * List Reservations
   */
  async getReservations(
    tenantId: string,
    branchId: string,
    status?: string,
    search?: string,
  ): Promise<ReservationDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      let query = `
        SELECT r.id, r.tenant_id AS "tenantId", r.branch_id AS "branchId", r.reservation_no AS "reservationNo",
               r.status, r.guest_id AS "guestId", r.company_id AS "companyId", r.source, r.channel_ref AS "channelRef",
               r.hold_expires_at AS "holdExpiresAt", r.policy_snapshot AS "policySnapshot", r.notes, r.attrs,
               r.version, r.created_at AS "createdAt",
               g.first_name, g.last_name, g.email AS guest_email, g.phone AS guest_phone,
               c.name AS company_name
        FROM reservations r
        JOIN guests g ON g.id = r.guest_id
        LEFT JOIN companies c ON c.id = r.company_id
        WHERE r.tenant_id = $1 AND r.branch_id = $2
      `;
      const params: any[] = [tenantId, branchId];

      if (status) {
        params.push(status);
        query += ` AND r.status = $${params.length}`;
      }

      if (search && search.trim()) {
        params.push(`%${search.trim().toLowerCase()}%`);
        query += ` AND (LOWER(r.reservation_no) LIKE $${params.length} OR LOWER(g.first_name) LIKE $${params.length} OR LOWER(g.last_name) LIKE $${params.length})`;
      }

      query += ` ORDER BY r.created_at DESC LIMIT 100`;
      const res = await client.query(query, params);

      const reservations: ReservationDto[] = [];
      for (const row of res.rows) {
        // Query units
        const unitsRes = await client.query(
          `SELECT ru.id, ru.unit_type_id AS "unitTypeId", ut.code AS "unitTypeCode", ut.name AS "unitTypeName",
                  ru.unit_id AS "unitId", u.number AS "unitNumber", ru.rate_plan_id AS "ratePlanId",
                  rp.code AS "ratePlanCode", rp.name AS "ratePlanName",
                  ru.check_in::text AS "checkIn", ru.check_out::text AS "checkOut",
                  ru.adults, ru.children, ru.status,
                  COALESCE((SELECT sum(rn.rate) FROM reservation_nights rn WHERE rn.reservation_unit_id = ru.id), 0)::float AS "totalRate"
           FROM reservation_units ru
           JOIN unit_types ut ON ut.id = ru.unit_type_id
           JOIN rate_plans rp ON rp.id = ru.rate_plan_id
           LEFT JOIN units u ON u.id = ru.unit_id
           WHERE ru.reservation_id = $1`,
          [row.id],
        );

        let totalAmount = 0;
        let totalNights = 0;
        const units = unitsRes.rows.map((uRow: any) => {
          totalAmount += Number(uRow.totalRate);
          const nights = Math.max(1, Math.round((new Date(uRow.checkOut).getTime() - new Date(uRow.checkIn).getTime()) / 86400000));
          totalNights += nights;
          return {
            ...uRow,
            nights: [],
          };
        });

        reservations.push({
          id: row.id,
          tenantId: row.tenantId,
          branchId: row.branchId,
          reservationNo: row.reservationNo,
          status: row.status,
          guestId: row.guestId,
          guestName: `${row.first_name} ${row.last_name}`,
          guestEmail: row.guest_email,
          guestPhone: row.guest_phone,
          companyId: row.companyId,
          companyName: row.company_name,
          source: row.source,
          channelRef: row.channelRef,
          holdExpiresAt: row.holdExpiresAt ? new Date(row.holdExpiresAt).toISOString() : null,
          policySnapshot: row.policySnapshot,
          notes: row.notes,
          attrs: row.attrs,
          version: row.version,
          totalAmount: Number(totalAmount.toFixed(2)),
          totalNights,
          units,
          createdAt: new Date(row.createdAt).toISOString(),
        });
      }

      return reservations;
    });
  }

  /**
   * Get Single Reservation by ID
   */
  async getReservationById(tenantId: string, id: string): Promise<ReservationDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT r.id, r.tenant_id AS "tenantId", r.branch_id AS "branchId", r.reservation_no AS "reservationNo",
                r.status, r.guest_id AS "guestId", r.company_id AS "companyId", r.source, r.channel_ref AS "channelRef",
                r.hold_expires_at AS "holdExpiresAt", r.policy_snapshot AS "policySnapshot", r.notes, r.attrs,
                r.version, r.created_at AS "createdAt",
                g.first_name, g.last_name, g.email AS guest_email, g.phone AS guest_phone,
                c.name AS company_name
         FROM reservations r
         JOIN guests g ON g.id = r.guest_id
         LEFT JOIN companies c ON c.id = r.company_id
         WHERE r.tenant_id = $1 AND r.id = $2`,
        [tenantId, id],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException(`Reservation with ID ${id} not found`);
      }
      const row = res.rows[0];

      const unitsRes = await client.query(
        `SELECT ru.id, ru.unit_type_id AS "unitTypeId", ut.code AS "unitTypeCode", ut.name AS "unitTypeName",
                ru.unit_id AS "unitId", u.number AS "unitNumber", ru.rate_plan_id AS "ratePlanId",
                rp.code AS "ratePlanCode", rp.name AS "ratePlanName",
                ru.check_in::text AS "checkIn", ru.check_out::text AS "checkOut",
                ru.adults, ru.children, ru.status,
                COALESCE((SELECT sum(rn.rate) FROM reservation_nights rn WHERE rn.reservation_unit_id = ru.id), 0)::float AS "totalRate"
         FROM reservation_units ru
         JOIN unit_types ut ON ut.id = ru.unit_type_id
         JOIN rate_plans rp ON rp.id = ru.rate_plan_id
         LEFT JOIN units u ON u.id = ru.unit_id
         WHERE ru.reservation_id = $1`,
        [row.id],
      );

      let totalAmount = 0;
      let totalNights = 0;
      const units: ReservationUnitItemDto[] = [];

      for (const uRow of unitsRes.rows) {
        totalAmount += Number(uRow.totalRate);
        const nights = Math.max(1, Math.round((new Date(uRow.checkOut).getTime() - new Date(uRow.checkIn).getTime()) / 86400000));
        totalNights += nights;

        // Fetch nights breakdown
        const nightsRes = await client.query(
          `SELECT stay_date::text AS "stayDate", rate::float AS rate, tax_snapshot AS "taxSnapshot"
           FROM reservation_nights
           WHERE reservation_unit_id = $1
           ORDER BY stay_date ASC`,
          [uRow.id],
        );

        units.push({
          ...uRow,
          nights: nightsRes.rows,
        });
      }

      return {
        id: row.id,
        tenantId: row.tenantId,
        branchId: row.branchId,
        reservationNo: row.reservationNo,
        status: row.status,
        guestId: row.guestId,
        guestName: `${row.first_name} ${row.last_name}`,
        guestEmail: row.guest_email,
        guestPhone: row.guest_phone,
        companyId: row.companyId,
        companyName: row.company_name,
        source: row.source,
        channelRef: row.channelRef,
        holdExpiresAt: row.holdExpiresAt ? new Date(row.holdExpiresAt).toISOString() : null,
        policySnapshot: row.policySnapshot,
        notes: row.notes,
        attrs: row.attrs,
        version: row.version,
        totalAmount: Number(totalAmount.toFixed(2)),
        totalNights,
        units,
        createdAt: new Date(row.createdAt).toISOString(),
      };
    });
  }

  /**
   * Release Expired Holds Background Job (REQ-RSV-005)
   */
  async releaseExpiredHolds(tenantId: string): Promise<{ releasedCount: number }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const expiredRes = await client.query(
        `SELECT h.id AS hold_id, h.reservation_unit_id, ru.reservation_id, ru.branch_id, ru.unit_type_id, ru.check_in, ru.check_out
         FROM holds h
         JOIN reservation_units ru ON ru.id = h.reservation_unit_id
         WHERE h.tenant_id = $1 AND h.expires_at < now()`,
        [tenantId],
      );

      for (const row of expiredRes.rows) {
        // Revert sold inventory
        await client.query(
          `UPDATE room_type_inventory
           SET sold = GREATEST(0, sold - 1)
           WHERE tenant_id = $1 AND branch_id = $2 AND unit_type_id = $3
             AND stay_date >= $4 AND stay_date < $5`,
          [tenantId, row.branch_id, row.unit_type_id, row.check_in, row.check_out],
        );

        // Cancel reservation
        await client.query(
          `UPDATE reservations SET status = 'cancelled' WHERE id = $1`,
          [row.reservation_id],
        );
        await client.query(
          `UPDATE reservation_units SET status = 'cancelled' WHERE id = $1`,
          [row.reservation_unit_id],
        );

        // Remove hold
        await client.query(`DELETE FROM holds WHERE id = $1`, [row.hold_id]);
      }

      return { releasedCount: expiredRes.rows.length };
    });
  }
}
