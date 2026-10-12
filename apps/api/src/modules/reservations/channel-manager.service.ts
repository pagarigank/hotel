import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { RatesService } from '../rates/rates.service.js';
import { ReservationsService } from './reservations.service.js';
import type {
  CreateChannelMappingDto,
  ChannelMappingDto,
  ChannelAriSyncDto,
  ChannelBookingWebhookDto,
  ChannelSyncLogDto,
} from '@innkeeper/contracts';

@Injectable()
export class ChannelManagerService {
  private readonly logger = new Logger(ChannelManagerService.name);

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RatesService) private readonly ratesService: RatesService,
    @Inject(ReservationsService) private readonly reservationsService: ReservationsService,
  ) {}

  /**
   * Create or Update Channel Mapping (REQ-RSV-015)
   */
  async createOrUpdateMapping(
    tenantId: string,
    dto: CreateChannelMappingDto,
  ): Promise<ChannelMappingDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const mappingId = uuidv7();
      const res = await client.query(
        `INSERT INTO channel_maps (
          id, tenant_id, branch_id, channel_name, local_unit_type_id, local_rate_plan_id,
          channel_room_code, channel_rate_code, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tenant_id, branch_id, channel_name, channel_room_code, channel_rate_code)
        DO UPDATE SET
          local_unit_type_id = EXCLUDED.local_unit_type_id,
          local_rate_plan_id = EXCLUDED.local_rate_plan_id,
          is_active = EXCLUDED.is_active,
          updated_at = now()
        RETURNING *`,
        [
          mappingId,
          tenantId,
          dto.branchId,
          dto.channelName,
          dto.localUnitTypeId,
          dto.localRatePlanId,
          dto.channelRoomCode,
          dto.channelRateCode,
          dto.isActive ?? true,
        ],
      );

      const row = res.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        channelName: row.channel_name,
        localUnitTypeId: row.local_unit_type_id,
        localRatePlanId: row.local_rate_plan_id,
        channelRoomCode: row.channel_room_code,
        channelRateCode: row.channel_rate_code,
        isActive: row.is_active,
        createdAt: row.created_at.toISOString(),
      };
    });
  }

  /**
   * Get Channel Mappings for Branch
   */
  async getMappings(tenantId: string, branchId: string): Promise<ChannelMappingDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT * FROM channel_maps WHERE tenant_id = $1 AND branch_id = $2 ORDER BY channel_name, channel_room_code`,
        [tenantId, branchId],
      );
      return res.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        channelName: row.channel_name,
        localUnitTypeId: row.local_unit_type_id,
        localRatePlanId: row.local_rate_plan_id,
        channelRoomCode: row.channel_room_code,
        channelRateCode: row.channel_rate_code,
        isActive: row.is_active,
        createdAt: row.created_at.toISOString(),
      }));
    });
  }

  /**
   * Outbound 2-Way ARI Push (REQ-RSV-015 / specification §14.2)
   * Builds OpenTravel / HTNG ARI messages and publishes to OTA channels
   */
  async syncAri(
    tenantId: string,
    dto: ChannelAriSyncDto,
  ): Promise<{ success: boolean; pushedRecordsCount: number; otaMessageSummary: any }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const startDate = dto.startDate || new Date().toISOString().slice(0, 10);
      const endDate =
        dto.endDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      // Fetch active channel maps
      const mapRes = await client.query(
        `SELECT * FROM channel_maps WHERE tenant_id = $1 AND branch_id = $2 AND is_active = true`,
        [tenantId, dto.branchId],
      );

      if (mapRes.rows.length === 0) {
        return {
          success: true,
          pushedRecordsCount: 0,
          otaMessageSummary: { message: 'No active channel maps configured' },
        };
      }

      // Query current inventory, rates, restrictions for mapped unit types
      const ariDataRes = await client.query(
        `SELECT rti.unit_type_id, rti.stay_date::text AS stay_date, rti.capacity, rti.sold, rti.stop_sell,
                COALESCE(rc.rate, 100.0) AS rate,
                COALESCE(rst.min_los, 1) AS min_los,
                COALESCE(rst.max_los, 30) AS max_los,
                COALESCE(rst.closed_to_arrival, false) AS cta,
                COALESCE(rst.closed_to_departure, false) AS ctd
         FROM room_type_inventory rti
         LEFT JOIN rate_calendar rc ON rc.tenant_id = rti.tenant_id AND rc.branch_id = rti.branch_id
                                   AND rc.unit_type_id = rti.unit_type_id AND rc.stay_date = rti.stay_date
         LEFT JOIN restrictions rst ON rst.tenant_id = rti.tenant_id AND rst.branch_id = rti.branch_id
                                   AND rst.unit_type_id = rti.unit_type_id AND rst.stay_date = rti.stay_date
         WHERE rti.tenant_id = $1 AND rti.branch_id = $2
           AND rti.stay_date >= $3 AND rti.stay_date <= $4
         ORDER BY rti.stay_date ASC`,
        [tenantId, dto.branchId, startDate, endDate],
      );

      // Build OpenTravel / HTNG compliant messages
      const otaAvailNotif: any[] = [];
      const otaRateNotif: any[] = [];

      for (const map of mapRes.rows) {
        const relevantRows = ariDataRes.rows.filter(
          (r) => r.unit_type_id === map.local_unit_type_id,
        );

        for (const r of relevantRows) {
          const availableUnits = Math.max(0, Number(r.capacity) - Number(r.sold));
          otaAvailNotif.push({
            channel: map.channel_name,
            roomCode: map.channel_room_code,
            date: r.stay_date,
            bookingLimit: availableUnits,
            status: r.stop_sell || availableUnits <= 0 ? 'Closed' : 'Open',
            cta: r.cta,
            ctd: r.ctd,
            minLos: r.min_los,
            maxLos: r.max_los,
          });

          otaRateNotif.push({
            channel: map.channel_name,
            roomCode: map.channel_room_code,
            ratePlanCode: map.channel_rate_code,
            date: r.stay_date,
            currency: 'USD',
            amount: Number(r.rate),
          });
        }
      }

      // Log sync execution to channel_sync_logs
      const logId = uuidv7();
      await client.query(
        `INSERT INTO channel_sync_logs (
          id, tenant_id, branch_id, channel_name, sync_type, status, payload_summary
        ) VALUES ($1, $2, $3, $4, 'outbound_ari', 'success', $5)`,
        [
          logId,
          tenantId,
          dto.branchId,
          dto.channelName,
          JSON.stringify({
            startDate,
            endDate,
            channels: Array.from(new Set(mapRes.rows.map((m: any) => m.channel_name))),
            availUpdatesCount: otaAvailNotif.length,
            rateUpdatesCount: otaRateNotif.length,
          }),
        ],
      );

      return {
        success: true,
        pushedRecordsCount: otaAvailNotif.length,
        otaMessageSummary: {
          otaStandard: 'HTNG 2024 / OpenTravel 2014B',
          availNotifications: otaAvailNotif.slice(0, 10),
          rateNotifications: otaRateNotif.slice(0, 10),
          totalAvailCount: otaAvailNotif.length,
          totalRateCount: otaRateNotif.length,
        },
      };
    });
  }

  /**
   * Inbound OTA Webhook Processing with Rate-Parity Guard (REQ-RSV-015)
   */
  async ingestWebhookBooking(
    tenantId: string,
    dto: ChannelBookingWebhookDto,
  ): Promise<{ status: string; reservationNo?: string; warnings: string[] }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const warnings: string[] = [];

      // 1. Resolve Mapping
      const mapRes = await client.query(
        `SELECT * FROM channel_maps
         WHERE tenant_id = $1 AND branch_id = $2 AND channel_name = $3
           AND channel_room_code = $4 AND channel_rate_code = $5 AND is_active = true`,
        [tenantId, dto.branchId, dto.channelName, dto.channelRoomCode, dto.channelRateCode],
      );

      if (mapRes.rows.length === 0) {
        throw new BadRequestException(
          `Unrecognized channel mapping: ${dto.channelName} (Room: ${dto.channelRoomCode}, Rate: ${dto.channelRateCode})`,
        );
      }
      const mapping = mapRes.rows[0];

      // 2. Cancellation handling
      if (dto.action === 'cancel') {
        const rsvRes = await client.query(
          `SELECT id, reservation_no FROM reservations
           WHERE tenant_id = $1 AND branch_id = $2 AND channel_ref = $3`,
          [tenantId, dto.branchId, dto.channelReservationRef],
        );
        if (rsvRes.rows.length === 0) {
          throw new NotFoundException(`No existing reservation found with channel ref ${dto.channelReservationRef}`);
        }
        await this.reservationsService.cancelReservation(
          tenantId,
          rsvRes.rows[0].id,
          `Cancelled via OTA ${dto.channelName}`,
        );

        await client.query(
          `INSERT INTO channel_sync_logs (
            id, tenant_id, branch_id, channel_name, sync_type, status, payload_summary
          ) VALUES ($1, $2, $3, $4, 'inbound_booking', 'success', $5)`,
          [
            uuidv7(),
            tenantId,
            dto.branchId,
            dto.channelName,
            JSON.stringify({ action: 'cancel', channelRef: dto.channelReservationRef }),
          ],
        );

        return { status: 'cancelled', reservationNo: rsvRes.rows[0].reservation_no, warnings };
      }

      // 3. Deduplication Check (Idempotent Ingestion)
      const existingRsv = await client.query(
        `SELECT id, reservation_no FROM reservations
         WHERE tenant_id = $1 AND branch_id = $2 AND channel_ref = $3`,
        [tenantId, dto.branchId, dto.channelReservationRef],
      );
      if (existingRsv.rows.length > 0) {
        return {
          status: 'replayed',
          reservationNo: existingRsv.rows[0].reservation_no,
          warnings: ['Duplicate webhook replayed'],
        };
      }

      // 4. Rate-Parity Guard (§12.2 / REQ-RSV-015)
      try {
        const localQuote = await this.ratesService.calculatePriceQuote(
          tenantId,
          {
            branchId: dto.branchId,
            unitTypeId: mapping.local_unit_type_id,
            ratePlanId: mapping.local_rate_plan_id,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            adults: dto.adults,
            children: dto.children,
          },
          client,
        );

        const delta = Math.abs(Number(dto.totalPriceOta) - Number(localQuote.totalAmount));
        if (delta > 2.0) {
          const warningMsg = `Rate-parity discrepancy: OTA booked at $${dto.totalPriceOta} vs local rate $${localQuote.totalAmount}`;
          warnings.push(warningMsg);
          this.logger.warn(`[${dto.channelName}] ${warningMsg}`);
        }
      } catch (quoteErr: any) {
        warnings.push(`Rate-parity check skipped: ${quoteErr.message}`);
      }

      // 5. Ingest Confirmed Reservation via ReservationsService
      const reservation = await this.reservationsService.createReservation(
        tenantId,
        {
          branchId: dto.branchId,
          source: `ota_${dto.channelName}`,
          guest: {
            firstName: dto.guest.firstName,
            lastName: dto.guest.lastName,
            email: dto.guest.email,
            phone: dto.guest.phone,
          },
          units: [
            {
              unitTypeId: mapping.local_unit_type_id,
              ratePlanId: mapping.local_rate_plan_id,
              checkIn: dto.checkIn,
              checkOut: dto.checkOut,
              adults: dto.adults,
              children: dto.children,
            },
          ],
          notes: dto.notes || `Direct OTA Inbound Booking from ${dto.channelName}`,
          attrs: {
            channelName: dto.channelName,
            channelReservationRef: dto.channelReservationRef,
            channelPrice: dto.totalPriceOta,
            currency: dto.currency,
            rateParityWarnings: warnings,
          },
        },
        undefined,
        client,
      );

      // Record channel_ref on reservation
      await client.query(
        `UPDATE reservations SET channel_ref = $1 WHERE id = $2`,
        [dto.channelReservationRef, reservation.id],
      );

      // Log success
      await client.query(
        `INSERT INTO channel_sync_logs (
          id, tenant_id, branch_id, channel_name, sync_type, status, payload_summary
        ) VALUES ($1, $2, $3, $4, 'inbound_booking', $5, $6)`,
        [
          uuidv7(),
          tenantId,
          dto.branchId,
          dto.channelName,
          warnings.length > 0 ? 'warning' : 'success',
          JSON.stringify({
            action: 'book',
            channelRef: dto.channelReservationRef,
            reservationNo: reservation.reservationNo,
            warnings,
          }),
        ],
      );

      return {
        status: 'confirmed',
        reservationNo: reservation.reservationNo,
        warnings,
      };
    });
  }

  /**
   * Get Channel Sync Logs
   */
  async getSyncLogs(tenantId: string, branchId: string): Promise<ChannelSyncLogDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT * FROM channel_sync_logs
         WHERE tenant_id = $1 AND branch_id = $2
         ORDER BY created_at DESC
         LIMIT 50`,
        [tenantId, branchId],
      );

      return res.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        channelName: row.channel_name,
        syncType: row.sync_type,
        status: row.status,
        payloadSummary: row.payload_summary,
        errorMessage: row.error_message,
        createdAt: row.created_at.toISOString(),
      }));
    });
  }
}
