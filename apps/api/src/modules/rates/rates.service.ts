import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import pg from 'pg';
import { DatabaseService } from '../../kernel/database/database.service.js';
import type {
  RatePlanDto,
  CreateRatePlanDto,
  RateCalendarEntryDto,
  SetRateCalendarDto,
  RestrictionDto,
  SetRestrictionsDto,
  TaxDto,
  TaxRuleDto,
  PriceQuoteRequestDto,
  PriceQuoteResponseDto,
  NightlyRateBreakdownDto,
  NightlyTaxDetailDto,
} from '@innkeeper/contracts';

@Injectable()
export class RatesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /**
   * Rate Plans
   */
  async getRatePlans(tenantId: string, branchId: string): Promise<RatePlanDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id AS "tenantId", branch_id AS "branchId", code, name, currency,
                is_active AS "isActive", policy_cancellation AS "policyCancellation",
                policy_deposit AS "policyDeposit", policy_no_show AS "policyNoShow", attrs
         FROM rate_plans
         WHERE tenant_id = $1 AND branch_id = $2
         ORDER BY code ASC`,
        [tenantId, branchId],
      );
      return res.rows;
    });
  }

  async createRatePlan(tenantId: string, dto: CreateRatePlanDto): Promise<RatePlanDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `INSERT INTO rate_plans (id, tenant_id, branch_id, code, name, currency, is_active, policy_cancellation, policy_deposit, policy_no_show, attrs)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, tenant_id AS "tenantId", branch_id AS "branchId", code, name, currency,
                   is_active AS "isActive", policy_cancellation AS "policyCancellation",
                   policy_deposit AS "policyDeposit", policy_no_show AS "policyNoShow", attrs`,
        [
          tenantId,
          dto.branchId,
          dto.code,
          dto.name,
          dto.currency || 'USD',
          dto.isActive ?? true,
          JSON.stringify(dto.policyCancellation || {}),
          JSON.stringify(dto.policyDeposit || {}),
          JSON.stringify(dto.policyNoShow || {}),
          JSON.stringify(dto.attrs || {}),
        ],
      );
      return res.rows[0];
    });
  }

  /**
   * Rate Calendar
   */
  async getRateCalendar(
    tenantId: string,
    branchId: string,
    ratePlanId: string,
    startDate: string,
    endDate: string,
  ): Promise<RateCalendarEntryDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id AS "tenantId", branch_id AS "branchId", rate_plan_id AS "ratePlanId",
                unit_type_id AS "unitTypeId", stay_date::text AS "stayDate", rate::float AS rate,
                single_occupancy_rate::float AS "singleOccupancyRate",
                extra_adult_rate::float AS "extraAdultRate", extra_child_rate::float AS "extraChildRate"
         FROM rate_calendar
         WHERE tenant_id = $1 AND branch_id = $2 AND rate_plan_id = $3
           AND stay_date >= $4 AND stay_date <= $5
         ORDER BY stay_date ASC`,
        [tenantId, branchId, ratePlanId, startDate, endDate],
      );
      return res.rows;
    });
  }

  async setRateCalendar(tenantId: string, dto: SetRateCalendarDto): Promise<{ updatedCount: number }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `INSERT INTO rate_calendar (id, tenant_id, branch_id, rate_plan_id, unit_type_id, stay_date, rate, single_occupancy_rate, extra_adult_rate, extra_child_rate)
         SELECT
           gen_random_uuid(),
           $1,
           $2,
           $3,
           $4,
           d::date,
           $5,
           $6,
           $7,
           $8
         FROM generate_series($9::date, $10::date, '1 day'::interval) AS d
         ON CONFLICT (tenant_id, branch_id, rate_plan_id, unit_type_id, stay_date)
         DO UPDATE SET
           rate = EXCLUDED.rate,
           single_occupancy_rate = EXCLUDED.single_occupancy_rate,
           extra_adult_rate = EXCLUDED.extra_adult_rate,
           extra_child_rate = EXCLUDED.extra_child_rate`,
        [
          tenantId,
          dto.branchId,
          dto.ratePlanId,
          dto.unitTypeId,
          dto.rate,
          dto.singleOccupancyRate ?? null,
          dto.extraAdultRate ?? 0,
          dto.extraChildRate ?? 0,
          dto.startDate,
          dto.endDate,
        ],
      );
      return { updatedCount: res.rowCount || 0 };
    });
  }

  /**
   * Restrictions
   */
  async getRestrictions(
    tenantId: string,
    branchId: string,
    ratePlanId: string,
    startDate: string,
    endDate: string,
  ): Promise<RestrictionDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id AS "tenantId", branch_id AS "branchId", rate_plan_id AS "ratePlanId",
                unit_type_id AS "unitTypeId", stay_date::text AS "stayDate", min_los AS "minLos",
                max_los AS "maxLos", closed_to_arrival AS "closedToArrival",
                closed_to_departure AS "closedToDeparture", stop_sell AS "stopSell"
         FROM restrictions
         WHERE tenant_id = $1 AND branch_id = $2 AND rate_plan_id = $3
           AND stay_date >= $4 AND stay_date <= $5
         ORDER BY stay_date ASC`,
        [tenantId, branchId, ratePlanId, startDate, endDate],
      );
      return res.rows;
    });
  }

  async setRestrictions(tenantId: string, dto: SetRestrictionsDto): Promise<{ updatedCount: number }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `INSERT INTO restrictions (id, tenant_id, branch_id, rate_plan_id, unit_type_id, stay_date, min_los, max_los, closed_to_arrival, closed_to_departure, stop_sell)
         SELECT
           gen_random_uuid(),
           $1,
           $2,
           $3,
           $4,
           d::date,
           $5,
           $6,
           $7,
           $8,
           $9
         FROM generate_series($10::date, $11::date, '1 day'::interval) AS d
         ON CONFLICT (tenant_id, branch_id, rate_plan_id, unit_type_id, stay_date)
         DO UPDATE SET
           min_los = EXCLUDED.min_los,
           max_los = EXCLUDED.max_los,
           closed_to_arrival = EXCLUDED.closed_to_arrival,
           closed_to_departure = EXCLUDED.closed_to_departure,
           stop_sell = EXCLUDED.stop_sell`,
        [
          tenantId,
          dto.branchId,
          dto.ratePlanId,
          dto.unitTypeId ?? null,
          dto.minLos ?? null,
          dto.maxLos ?? null,
          dto.closedToArrival ?? false,
          dto.closedToDeparture ?? false,
          dto.stopSell ?? false,
          dto.startDate,
          dto.endDate,
        ],
      );
      return { updatedCount: res.rowCount || 0 };
    });
  }

  /**
   * Taxes & Tax Rules
   */
  async getTaxes(tenantId: string): Promise<TaxDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id AS "tenantId", code, name, rate_pct::float AS "ratePct",
                is_flat_amount AS "isFlatAmount", flat_amount::float AS "flatAmount",
                currency, gl_account_code AS "glAccountCode", is_active AS "isActive"
         FROM taxes
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY code ASC`,
        [tenantId],
      );
      return res.rows;
    });
  }

  async getTaxRules(tenantId: string, branchId?: string): Promise<TaxRuleDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id AS "tenantId", branch_id AS "branchId", code, name,
                is_inclusive AS "isInclusive", calculation_order AS "calculationOrder",
                compounds_previous AS "compoundsPrevious", tax_ids AS "taxIds"
         FROM tax_rules
         WHERE tenant_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
         ORDER BY calculation_order ASC`,
        [tenantId, branchId || null],
      );
      return res.rows;
    });
  }

  /**
   * Real-time Nightly Price Quote Engine (REQ-RSV-001 / REQ-RAT-003)
   */
  async calculatePriceQuote(
    tenantId: string,
    dto: PriceQuoteRequestDto,
    existingClient?: pg.PoolClient,
  ): Promise<PriceQuoteResponseDto> {
    const runInClient = async (client: pg.PoolClient) => {
      const checkInDate = new Date(dto.checkIn);
      const checkOutDate = new Date(dto.checkOut);

      if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime()) || checkOutDate <= checkInDate) {
        throw new BadRequestException('checkOut must be strictly after checkIn');
      }

      // 1. Fetch Unit Type
      const utRes = await client.query(
        `SELECT id, code, name, kind, max_adults, max_children, max_occupancy, base_rate::float AS base_rate
         FROM unit_types
         WHERE tenant_id = $1 AND branch_id = $2 AND id = $3`,
        [tenantId, dto.branchId, dto.unitTypeId],
      );
      if (utRes.rows.length === 0) {
        throw new NotFoundException(`Unit type ${dto.unitTypeId} not found`);
      }
      const unitType = utRes.rows[0];

      // 2. Fetch Rate Plan
      const rpRes = await client.query(
        `SELECT id, code, name, currency, policy_cancellation, policy_deposit, policy_no_show
         FROM rate_plans
         WHERE tenant_id = $1 AND branch_id = $2 AND id = $3 AND is_active = true`,
        [tenantId, dto.branchId, dto.ratePlanId],
      );
      if (rpRes.rows.length === 0) {
        throw new NotFoundException(`Rate plan ${dto.ratePlanId} not found`);
      }
      const ratePlan = rpRes.rows[0];

      // 3. Generate stay dates list (checkIn to checkOut - 1 day)
      const stayDates: string[] = [];
      const curr = new Date(checkInDate);
      while (curr < checkOutDate) {
        stayDates.push(curr.toISOString().slice(0, 10));
        curr.setDate(curr.getDate() + 1);
      }
      const nightsCount = stayDates.length;

      // 4. Fetch daily rates from rate_calendar
      const ratesRes = await client.query(
        `SELECT stay_date::text AS stay_date, rate::float AS rate,
                single_occupancy_rate::float AS single_rate,
                extra_adult_rate::float AS extra_adult_rate,
                extra_child_rate::float AS extra_child_rate
         FROM rate_calendar
         WHERE tenant_id = $1 AND branch_id = $2 AND rate_plan_id = $3 AND unit_type_id = $4
           AND stay_date >= $5 AND stay_date < $6`,
        [tenantId, dto.branchId, dto.ratePlanId, dto.unitTypeId, dto.checkIn, dto.checkOut],
      );
      const ratesMap = new Map<string, any>();
      for (const r of ratesRes.rows) {
        ratesMap.set(r.stay_date, r);
      }

      // 5. Fetch daily restrictions
      const restrRes = await client.query(
        `SELECT stay_date::text AS stay_date, min_los, max_los, closed_to_arrival, closed_to_departure, stop_sell
         FROM restrictions
         WHERE tenant_id = $1 AND branch_id = $2 AND rate_plan_id = $3
           AND (unit_type_id = $4 OR unit_type_id IS NULL)
           AND stay_date >= $5 AND stay_date <= $6`,
        [tenantId, dto.branchId, dto.ratePlanId, dto.unitTypeId, dto.checkIn, dto.checkOut],
      );
      const restrMap = new Map<string, any>();
      for (const r of restrRes.rows) {
        restrMap.set(r.stay_date, r);
      }

      // 6. Check Inventory Capacity
      const invRes = await client.query(
        `SELECT stay_date::text AS stay_date, (capacity + overbook_allowance - sold) AS available_count, stop_sell
         FROM room_type_inventory
         WHERE tenant_id = $1 AND branch_id = $2 AND unit_type_id = $3
           AND stay_date >= $4 AND stay_date < $5`,
        [tenantId, dto.branchId, dto.unitTypeId, dto.checkIn, dto.checkOut],
      );
      let minAvailableUnits = 999;
      if (invRes.rows.length < nightsCount) {
        // If some dates lack inventory rows, check active physical units count
        const totalUnitsRes = await client.query(
          `SELECT count(*)::int AS count FROM units WHERE tenant_id = $1 AND branch_id = $2 AND unit_type_id = $3 AND deleted_at IS NULL`,
          [tenantId, dto.branchId, dto.unitTypeId],
        );
        minAvailableUnits = totalUnitsRes.rows[0]?.count || 0;
      } else {
        for (const row of invRes.rows) {
          if (row.stop_sell) minAvailableUnits = 0;
          minAvailableUnits = Math.min(minAvailableUnits, Number(row.available_count));
        }
      }

      // 7. Fetch Standard Room Taxes
      const taxRes = await client.query(
        `SELECT t.code, t.name, t.rate_pct::float AS rate_pct, t.is_flat_amount, t.flat_amount::float AS flat_amount
         FROM taxes t
         WHERE t.tenant_id = $1 AND t.is_active = true
         ORDER BY t.code ASC`,
        [tenantId],
      );

      // 8. Build Nightly Breakdown
      let isAvailable = minAvailableUnits > 0;
      let subtotal = 0;
      let totalTaxes = 0;
      const nightlyBreakdown: NightlyRateBreakdownDto[] = [];

      for (let i = 0; i < stayDates.length; i++) {
        const stayDate = stayDates[i];
        const rateRow = ratesMap.get(stayDate);
        const restr = restrMap.get(stayDate);

        // Check restrictions
        if (restr) {
          if (restr.stop_sell) isAvailable = false;
          if (i === 0 && restr.closed_to_arrival) isAvailable = false;
          if (restr.min_los && nightsCount < restr.min_los) isAvailable = false;
          if (restr.max_los && nightsCount > restr.max_los) isAvailable = false;
        }

        const baseRate = rateRow ? Number(rateRow.rate) : Number(unitType.base_rate);
        const extraAdultRate = rateRow ? Number(rateRow.extra_adult_rate) : 25;
        const extraChildRate = rateRow ? Number(rateRow.extra_child_rate) : 10;

        const extraAdultsCount = Math.max(0, dto.adults - (unitType.max_adults || 2));
        const extraAdultsCost = extraAdultsCount * extraAdultRate;
        const extraChildrenCost = (dto.children || 0) * extraChildRate;
        const roomRate = Number((baseRate + extraAdultsCost + extraChildrenCost).toFixed(2));

        // Taxes
        const nightlyTaxes: NightlyTaxDetailDto[] = [];
        let nightTaxTotal = 0;

        for (const t of taxRes.rows) {
          const tAmount = Number(((roomRate * t.rate_pct) / 100).toFixed(2));
          nightlyTaxes.push({
            taxCode: t.code,
            name: t.name,
            ratePct: t.rate_pct,
            amount: tAmount,
          });
          nightTaxTotal += tAmount;
        }

        const nightTotal = Number((roomRate + nightTaxTotal).toFixed(2));
        subtotal += roomRate;
        totalTaxes += nightTaxTotal;

        nightlyBreakdown.push({
          stayDate,
          baseRate,
          extraAdultsRate: extraAdultsCost,
          extraChildrenRate: extraChildrenCost,
          roomRate,
          taxes: nightlyTaxes,
          taxAmount: Number(nightTaxTotal.toFixed(2)),
          nightTotal,
        });
      }

      // Check departure restrictions
      const depRestr = restrMap.get(dto.checkOut);
      if (depRestr && depRestr.closed_to_departure) {
        isAvailable = false;
      }

      subtotal = Number(subtotal.toFixed(2));
      totalTaxes = Number(totalTaxes.toFixed(2));
      const totalAmount = Number((subtotal + totalTaxes).toFixed(2));

      return {
        branchId: dto.branchId,
        unitTypeId: dto.unitTypeId,
        unitTypeName: unitType.name,
        ratePlanId: dto.ratePlanId,
        ratePlanName: ratePlan.name,
        currency: ratePlan.currency || 'USD',
        checkIn: dto.checkIn,
        checkOut: dto.checkOut,
        nightsCount,
        adults: dto.adults,
        children: dto.children,
        nightlyBreakdown,
        subtotal,
        totalTaxes,
        totalAmount,
        policySnapshot: {
          ratePlanCode: ratePlan.code,
          cancellation: ratePlan.policy_cancellation,
          deposit: ratePlan.policy_deposit,
          noShow: ratePlan.policy_no_show,
        },
        isAvailable,
        availableUnitsCount: isAvailable ? Math.max(0, minAvailableUnits) : 0,
      };
    };

    if (existingClient) {
      return runInClient(existingClient);
    }
    return this.db.transaction(tenantId, runInClient);
  }
}
