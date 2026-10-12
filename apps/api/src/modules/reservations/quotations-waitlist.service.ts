import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import pg from 'pg';
import crypto from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { RatesService } from '../rates/rates.service.js';
import { ReservationsService } from './reservations.service.js';
import type {
  CreateQuotationDto,
  QuotationDto,
  CreateWaitlistDto,
  WaitlistDto,
  ReservationDto,
} from '@innkeeper/contracts';

@Injectable()
export class QuotationsWaitlistService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RatesService) private readonly ratesService: RatesService,
    @Inject(ReservationsService) private readonly reservationsService: ReservationsService,
  ) {}

  /**
   * Create Non-Binding Quotation (REQ-RSV-010)
   */
  async createQuotation(
    tenantId: string,
    dto: CreateQuotationDto,
    userId?: string,
  ): Promise<QuotationDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      // 1. Calculate price quote
      const quote = await this.ratesService.calculatePriceQuote(
        tenantId,
        {
          branchId: dto.branchId,
          unitTypeId: dto.unitTypeId,
          ratePlanId: dto.ratePlanId,
          checkIn: dto.checkIn,
          checkOut: dto.checkOut,
          adults: dto.adults,
          children: dto.children,
        },
        client,
      );

      // 2. Generate sequential quotation number
      const currentYear = new Date().getFullYear();
      const rand = Math.floor(Math.random() * 90000) + 10000;
      const quotationNo = `QTE-${currentYear}-${rand}`;
      const quotationId = uuidv7();

      const validDays = dto.validDays || 7;
      const validUntil = new Date(Date.now() + validDays * 86400000).toISOString();

      const res = await client.query(
        `INSERT INTO quotations (
          id, tenant_id, branch_id, quotation_no, guest_id, guest_name,
          guest_email, guest_phone, unit_type_id, rate_plan_id, check_in, check_out,
          adults, children, quoted_rate, quoted_taxes, total_amount, status,
          valid_until, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'active', $18, $19, $20)
        RETURNING *`,
        [
          quotationId,
          tenantId,
          dto.branchId,
          quotationNo,
          dto.guestId || null,
          dto.guestName,
          dto.guestEmail || null,
          dto.guestPhone || null,
          dto.unitTypeId,
          dto.ratePlanId,
          dto.checkIn,
          dto.checkOut,
          dto.adults,
          dto.children || 0,
          quote.subtotal,
          quote.totalTaxes,
          quote.totalAmount,
          validUntil,
          dto.notes || null,
          userId || null,
        ],
      );

      const row = res.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        quotationNo: row.quotation_no,
        guestId: row.guest_id,
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        guestPhone: row.guest_phone,
        unitTypeId: row.unit_type_id,
        ratePlanId: row.rate_plan_id,
        checkIn: typeof row.check_in === 'string' ? row.check_in : row.check_in.toISOString().slice(0, 10),
        checkOut: typeof row.check_out === 'string' ? row.check_out : row.check_out.toISOString().slice(0, 10),
        adults: Number(row.adults),
        children: Number(row.children),
        quotedRate: Number(row.quoted_rate),
        quotedTaxes: Number(row.quoted_taxes),
        totalAmount: Number(row.total_amount),
        status: row.status,
        validUntil: row.valid_until.toISOString(),
        notes: row.notes,
        convertedReservationId: row.converted_reservation_id,
        createdAt: row.created_at.toISOString(),
      };
    });
  }

  /**
   * List Quotations
   */
  async getQuotations(tenantId: string, branchId: string): Promise<QuotationDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT * FROM quotations WHERE tenant_id = $1 AND branch_id = $2 ORDER BY created_at DESC`,
        [tenantId, branchId],
      );
      return res.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        quotationNo: row.quotation_no,
        guestId: row.guest_id,
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        guestPhone: row.guest_phone,
        unitTypeId: row.unit_type_id,
        ratePlanId: row.rate_plan_id,
        checkIn: typeof row.check_in === 'string' ? row.check_in : row.check_in.toISOString().slice(0, 10),
        checkOut: typeof row.check_out === 'string' ? row.check_out : row.check_out.toISOString().slice(0, 10),
        adults: Number(row.adults),
        children: Number(row.children),
        quotedRate: Number(row.quoted_rate),
        quotedTaxes: Number(row.quoted_taxes),
        totalAmount: Number(row.total_amount),
        status: row.status,
        validUntil: row.valid_until.toISOString(),
        notes: row.notes,
        convertedReservationId: row.converted_reservation_id,
        createdAt: row.created_at.toISOString(),
      }));
    });
  }

  /**
   * One-Click Conversion from Quotation to Confirmed Reservation (REQ-RSV-010)
   */
  async convertQuotation(
    tenantId: string,
    quotationId: string,
    userId?: string,
  ): Promise<{ quotation: QuotationDto; reservation: ReservationDto }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const qRes = await client.query(
        `SELECT * FROM quotations WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, quotationId],
      );
      if (qRes.rows.length === 0) {
        throw new NotFoundException(`Quotation with ID ${quotationId} not found`);
      }
      const q = qRes.rows[0];
      if (q.status !== 'active') {
        throw new BadRequestException(`Quotation is ${q.status}; only active quotations can be converted`);
      }
      if (new Date(q.valid_until).getTime() < Date.now()) {
        throw new BadRequestException('Quotation has expired');
      }

      // Create Reservation
      const checkInStr = typeof q.check_in === 'string' ? q.check_in : q.check_in.toISOString().slice(0, 10);
      const checkOutStr = typeof q.check_out === 'string' ? q.check_out : q.check_out.toISOString().slice(0, 10);

      const reservation = await this.reservationsService.createReservation(
        tenantId,
        {
          branchId: q.branch_id,
          source: 'quotation',
          guestId: q.guest_id || undefined,
          guest: !q.guest_id
            ? {
                firstName: q.guest_name.split(' ')[0] || 'Guest',
                lastName: q.guest_name.split(' ').slice(1).join(' ') || 'Customer',
                email: q.guest_email || undefined,
                phone: q.guest_phone || undefined,
              }
            : undefined,
          units: [
            {
              unitTypeId: q.unit_type_id,
              ratePlanId: q.rate_plan_id,
              checkIn: checkInStr,
              checkOut: checkOutStr,
              adults: Number(q.adults),
              children: Number(q.children),
            },
          ],
          notes: `Converted from Quotation ${q.quotation_no}`,
          attrs: { quotationNo: q.quotation_no, quotationId: q.id },
        },
        userId,
        client,
      );

      // Update Quotation status
      await client.query(
        `UPDATE quotations
         SET status = 'converted', converted_reservation_id = $1, updated_at = now()
         WHERE id = $2`,
        [reservation.id, quotationId],
      );

      q.status = 'converted';
      q.converted_reservation_id = reservation.id;

      return {
        quotation: {
          id: q.id,
          tenantId: q.tenant_id,
          branchId: q.branch_id,
          quotationNo: q.quotation_no,
          guestId: q.guest_id,
          guestName: q.guest_name,
          guestEmail: q.guest_email,
          guestPhone: q.guest_phone,
          unitTypeId: q.unit_type_id,
          ratePlanId: q.rate_plan_id,
          checkIn: checkInStr,
          checkOut: checkOutStr,
          adults: Number(q.adults),
          children: Number(q.children),
          quotedRate: Number(q.quoted_rate),
          quotedTaxes: Number(q.quoted_taxes),
          totalAmount: Number(q.total_amount),
          status: 'converted',
          validUntil: q.valid_until.toISOString(),
          notes: q.notes,
          convertedReservationId: reservation.id,
          createdAt: q.created_at.toISOString(),
        },
        reservation,
      };
    });
  }

  /**
   * Create Waitlist Entry (REQ-RSV-010)
   */
  async createWaitlist(
    tenantId: string,
    dto: CreateWaitlistDto,
    userId?: string,
  ): Promise<WaitlistDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const waitlistId = uuidv7();
      const res = await client.query(
        `INSERT INTO waitlists (
          id, tenant_id, branch_id, guest_id, guest_name, guest_email, guest_phone,
          unit_type_id, rate_plan_id, desired_check_in, desired_check_out, adults,
          children, priority, status, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'waiting', $15, $16)
        RETURNING *`,
        [
          waitlistId,
          tenantId,
          dto.branchId,
          dto.guestId || null,
          dto.guestName,
          dto.guestEmail || null,
          dto.guestPhone || null,
          dto.unitTypeId,
          dto.ratePlanId || null,
          dto.desiredCheckIn,
          dto.desiredCheckOut,
          dto.adults,
          dto.children || 0,
          dto.priority || 1,
          dto.notes || null,
          userId || null,
        ],
      );

      const row = res.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        guestId: row.guest_id,
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        guestPhone: row.guest_phone,
        unitTypeId: row.unit_type_id,
        ratePlanId: row.rate_plan_id,
        desiredCheckIn: typeof row.desired_check_in === 'string' ? row.desired_check_in : row.desired_check_in.toISOString().slice(0, 10),
        desiredCheckOut: typeof row.desired_check_out === 'string' ? row.desired_check_out : row.desired_check_out.toISOString().slice(0, 10),
        adults: Number(row.adults),
        children: Number(row.children),
        priority: Number(row.priority),
        status: row.status,
        notes: row.notes,
        convertedReservationId: row.converted_reservation_id,
        createdAt: row.created_at.toISOString(),
      };
    });
  }

  /**
   * List Waitlist Entries
   */
  async getWaitlists(tenantId: string, branchId: string): Promise<WaitlistDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT * FROM waitlists WHERE tenant_id = $1 AND branch_id = $2 ORDER BY priority DESC, created_at ASC`,
        [tenantId, branchId],
      );
      return res.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        guestId: row.guest_id,
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        guestPhone: row.guest_phone,
        unitTypeId: row.unit_type_id,
        ratePlanId: row.rate_plan_id,
        desiredCheckIn: typeof row.desired_check_in === 'string' ? row.desired_check_in : row.desired_check_in.toISOString().slice(0, 10),
        desiredCheckOut: typeof row.desired_check_out === 'string' ? row.desired_check_out : row.desired_check_out.toISOString().slice(0, 10),
        adults: Number(row.adults),
        children: Number(row.children),
        priority: Number(row.priority),
        status: row.status,
        notes: row.notes,
        convertedReservationId: row.converted_reservation_id,
        createdAt: row.created_at.toISOString(),
      }));
    });
  }

  /**
   * One-Click Conversion from Waitlist to Confirmed Reservation (REQ-RSV-010)
   */
  async convertWaitlist(
    tenantId: string,
    waitlistId: string,
    ratePlanId?: string,
    userId?: string,
  ): Promise<{ waitlist: WaitlistDto; reservation: ReservationDto }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const wRes = await client.query(
        `SELECT * FROM waitlists WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, waitlistId],
      );
      if (wRes.rows.length === 0) {
        throw new NotFoundException(`Waitlist entry with ID ${waitlistId} not found`);
      }
      const w = wRes.rows[0];
      if (w.status !== 'waiting' && w.status !== 'offered') {
        throw new BadRequestException(`Waitlist entry is ${w.status}; only waiting entries can be converted`);
      }

      // Determine rate plan
      let activeRatePlanId = ratePlanId || w.rate_plan_id;
      if (!activeRatePlanId) {
        const rp = await client.query(
          `SELECT id FROM rate_plans WHERE tenant_id = $1 AND branch_id = $2 LIMIT 1`,
          [tenantId, w.branch_id],
        );
        activeRatePlanId = rp.rows[0]?.id;
      }

      const checkInStr = typeof w.desired_check_in === 'string' ? w.desired_check_in : w.desired_check_in.toISOString().slice(0, 10);
      const checkOutStr = typeof w.desired_check_out === 'string' ? w.desired_check_out : w.desired_check_out.toISOString().slice(0, 10);

      // Create Reservation
      const reservation = await this.reservationsService.createReservation(
        tenantId,
        {
          branchId: w.branch_id,
          source: 'waitlist',
          guestId: w.guest_id || undefined,
          guest: !w.guest_id
            ? {
                firstName: w.guest_name.split(' ')[0] || 'Guest',
                lastName: w.guest_name.split(' ').slice(1).join(' ') || 'Customer',
                email: w.guest_email || undefined,
                phone: w.guest_phone || undefined,
              }
            : undefined,
          units: [
            {
              unitTypeId: w.unit_type_id,
              ratePlanId: activeRatePlanId,
              checkIn: checkInStr,
              checkOut: checkOutStr,
              adults: Number(w.adults),
              children: Number(w.children),
            },
          ],
          notes: `Converted from Waitlist priority ${w.priority}`,
          attrs: { waitlistId: w.id },
        },
        userId,
        client,
      );

      // Update waitlists record
      await client.query(
        `UPDATE waitlists
         SET status = 'converted', converted_reservation_id = $1, updated_at = now()
         WHERE id = $2`,
        [reservation.id, waitlistId],
      );

      w.status = 'converted';
      w.converted_reservation_id = reservation.id;

      return {
        waitlist: {
          id: w.id,
          tenantId: w.tenant_id,
          branchId: w.branch_id,
          guestId: w.guest_id,
          guestName: w.guest_name,
          guestEmail: w.guest_email,
          guestPhone: w.guest_phone,
          unitTypeId: w.unit_type_id,
          ratePlanId: activeRatePlanId,
          desiredCheckIn: checkInStr,
          desiredCheckOut: checkOutStr,
          adults: Number(w.adults),
          children: Number(w.children),
          priority: Number(w.priority),
          status: 'converted',
          notes: w.notes,
          convertedReservationId: reservation.id,
          createdAt: w.created_at.toISOString(),
        },
        reservation,
      };
    });
  }
}
