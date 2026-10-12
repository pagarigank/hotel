import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import pg from 'pg';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { RatesService } from '../rates/rates.service.js';
import type {
  AvailabilitySearchRequestDto,
  AvailabilityResponseDto,
  AvailabilityUnitTypeResultDto,
  AvailableRatePlanOptionDto,
} from '@innkeeper/contracts';

@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RatesService) private readonly ratesService: RatesService,
  ) {}

  async searchAvailability(
    tenantId: string,
    dto: AvailabilitySearchRequestDto,
  ): Promise<AvailabilityResponseDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const checkInDate = new Date(dto.checkIn);
      const checkOutDate = new Date(dto.checkOut);

      if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime()) || checkOutDate <= checkInDate) {
        throw new BadRequestException('checkOut date must be strictly after checkIn date');
      }

      // Generate stay dates list
      const stayDates: string[] = [];
      const curr = new Date(checkInDate);
      while (curr < checkOutDate) {
        stayDates.push(curr.toISOString().slice(0, 10));
        curr.setDate(curr.getDate() + 1);
      }
      const nightsCount = stayDates.length;

      // 1. Query matching unit types
      let utQuery = `
        SELECT id, code, name, kind, max_adults AS "maxAdults", max_children AS "maxChildren",
               max_occupancy AS "maxOccupancy", base_rate::float AS "baseRate"
        FROM unit_types
        WHERE tenant_id = $1 AND branch_id = $2
          AND max_occupancy >= $3
      `;
      const utParams: any[] = [tenantId, dto.branchId, dto.adults + dto.children];

      if (dto.unitTypeId) {
        utParams.push(dto.unitTypeId);
        utQuery += ` AND id = $4`;
      }

      utQuery += ` ORDER BY sort ASC, base_rate ASC`;
      const utRes = await client.query(utQuery, utParams);

      // 2. Fetch Active Rate Plans
      const rpRes = await client.query(
        `SELECT id, code, name, currency, policy_cancellation
         FROM rate_plans
         WHERE tenant_id = $1 AND branch_id = $2 AND is_active = true
         ORDER BY code ASC`,
        [tenantId, dto.branchId],
      );
      const ratePlans = rpRes.rows;

      const results: AvailabilityUnitTypeResultDto[] = [];

      for (const ut of utRes.rows) {
        // Query inventory capacity for stay dates
        const invRes = await client.query(
          `SELECT stay_date::text AS stay_date, (capacity + overbook_allowance - sold) AS available_count, stop_sell
           FROM room_type_inventory
           WHERE tenant_id = $1 AND branch_id = $2 AND unit_type_id = $3
             AND stay_date >= $4 AND stay_date < $5`,
          [tenantId, dto.branchId, ut.id, dto.checkIn, dto.checkOut],
        );

        let minAvailableUnits = 999;
        if (invRes.rows.length < nightsCount) {
          // Fallback: calculate available physical units not booked
          const bookedUnitsRes = await client.query(
            `SELECT count(DISTINCT ru.unit_id)::int AS booked_count
             FROM reservation_units ru
             WHERE ru.tenant_id = $1 AND ru.branch_id = $2 AND ru.unit_type_id = $3
               AND ru.status IN ('hold', 'confirmed', 'in_house')
               AND daterange(ru.check_in, ru.check_out, '[)') && daterange($4::date, $5::date, '[)')`,
            [tenantId, dto.branchId, ut.id, dto.checkIn, dto.checkOut],
          );
          const totalUnitsRes = await client.query(
            `SELECT count(*)::int AS count
             FROM units
             WHERE tenant_id = $1 AND branch_id = $2 AND unit_type_id = $3 AND deleted_at IS NULL AND is_sellable = true`,
            [tenantId, dto.branchId, ut.id],
          );

          const totalUnits = totalUnitsRes.rows[0]?.count || 0;
          const bookedUnits = bookedUnitsRes.rows[0]?.booked_count || 0;
          minAvailableUnits = Math.max(0, totalUnits - bookedUnits);
        } else {
          for (const row of invRes.rows) {
            if (row.stop_sell) minAvailableUnits = 0;
            minAvailableUnits = Math.min(minAvailableUnits, Number(row.available_count));
          }
        }

        minAvailableUnits = Math.max(0, minAvailableUnits);

        // Calculate rate plan quotes
        const planOptions: AvailableRatePlanOptionDto[] = [];

        if (minAvailableUnits > 0) {
          for (const rp of ratePlans) {
            try {
              const quote = await this.ratesService.calculatePriceQuote(tenantId, {
                branchId: dto.branchId,
                unitTypeId: ut.id,
                ratePlanId: rp.id,
                checkIn: dto.checkIn,
                checkOut: dto.checkOut,
                adults: dto.adults,
                children: dto.children,
              });

              if (quote.isAvailable) {
                planOptions.push({
                  ratePlanId: rp.id,
                  code: rp.code,
                  name: rp.name,
                  currency: rp.currency || 'USD',
                  totalAmount: quote.totalAmount,
                  averageNightlyRate: Number((quote.totalAmount / nightsCount).toFixed(2)),
                  isAvailable: true,
                  cancellationSummary: rp.policy_cancellation?.type || 'Standard policy',
                });
              }
            } catch (_err) {
              // Quote not available for this plan, skip
            }
          }
        }

        if (planOptions.length > 0 || minAvailableUnits > 0) {
          results.push({
            unitTypeId: ut.id,
            code: ut.code,
            name: ut.name,
            kind: ut.kind,
            maxAdults: ut.maxAdults,
            maxOccupancy: ut.maxOccupancy,
            availableUnitsCount: minAvailableUnits,
            ratePlans: planOptions,
          });
        }
      }

      return {
        branchId: dto.branchId,
        checkIn: dto.checkIn,
        checkOut: dto.checkOut,
        nightsCount,
        results,
      };
    });
  }
}
