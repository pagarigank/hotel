import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import crypto from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service.js';
import type {
  BoardResponseDto,
  BoardFloorGroupDto,
  BoardUnitDto,
  BoardCountersDto,
} from '@innkeeper/contracts';

@Injectable()
export class BoardService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async getBoard(tenantId: string, branchId: string): Promise<BoardResponseDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      // 1. Get branch info
      const branchRes = await client.query(
        `SELECT id, name, business_date FROM branches WHERE tenant_id = $1 AND id = $2 AND active = true`,
        [tenantId, branchId],
      );

      if (branchRes.rows.length === 0) {
        throw new NotFoundException(`Branch with ID ${branchId} not found`);
      }

      const branch = branchRes.rows[0];

      // 2. Get status definitions for units
      const statusRes = await client.query(
        `SELECT code, label, color_token, icon, is_sellable, is_occupied, is_dirty, blocks_booking
         FROM status_defs
         WHERE tenant_id = $1 AND entity = 'unit' AND (branch_id = $2 OR branch_id IS NULL)`,
        [tenantId, branchId],
      );

      const statusMap = new Map<string, any>();
      for (const s of statusRes.rows) {
        statusMap.set(s.code, s);
      }

      // 3. Query units joined with unit_types, connecting units and (at most one)
      //    active block. A LATERAL sub-select guarantees a single row per unit even
      //    when several block records overlap, so counters/tiles never double up.
      const unitsRes = await client.query(
        `SELECT u.id, u.number, u.name, u.floor, u.building, u.status_code, u.status_changed_at,
                u.is_sellable, u.connecting_unit_id, u.attrs, u.version,
                cu.number AS connecting_number,
                ut.id AS unit_type_id, ut.code AS unit_type_code, ut.name AS unit_type_name,
                ub.id AS block_id, ub.block_type, ub.reason AS block_reason, ub.from_date, ub.to_date, ub.notes AS block_notes
         FROM units u
         JOIN unit_types ut ON ut.id = u.unit_type_id
         LEFT JOIN units cu ON cu.id = u.connecting_unit_id AND cu.deleted_at IS NULL
         LEFT JOIN LATERAL (
           SELECT b.id, b.block_type, b.reason, b.from_date, b.to_date, b.notes
           FROM unit_blocks b
           WHERE b.unit_id = u.id AND b.is_active = true
             AND CURRENT_DATE BETWEEN b.from_date AND b.to_date
           ORDER BY (b.block_type = 'out_of_order') DESC, b.created_at DESC
           LIMIT 1
         ) ub ON true
         WHERE u.tenant_id = $1 AND u.branch_id = $2 AND u.deleted_at IS NULL
         ORDER BY u.floor ASC, u.number ASC`,
        [tenantId, branchId],
      );

      // 4. Aggregate counters
      const counters: BoardCountersDto = {
        total: unitsRes.rows.length,
        vacantClean: 0,
        vacantDirty: 0,
        inspected: 0,
        occupied: 0,
        dueIn: 0,
        dueOut: 0,
        reserved: 0,
        outOfOrder: 0,
        occupancyRate: 0,
      };

      // 5. Group by floor
      const floorsMap = new Map<string, BoardFloorGroupDto>();
      let hashContent = '';

      for (const row of unitsRes.rows) {
        const statusCode = row.status_code;
        const statusMeta = statusMap.get(statusCode) || {
          label: statusCode,
          color_token: `status-${statusCode.replace(/_/g, '-')}`,
          icon: 'bi-circle',
          is_sellable: row.is_sellable,
          is_occupied: false,
          is_dirty: false,
          blocks_booking: false,
        };

        const hasActiveBlock = Boolean(row.block_id);
        const outOfOrderBlock = hasActiveBlock && row.block_type === 'out_of_order';

        // Any active block (OOO or OOS) makes the unit unsellable and blocks bookings.
        const effectiveSellable = statusMeta.is_sellable && !hasActiveBlock;
        const effectiveBlocksBooking = statusMeta.blocks_booking || hasActiveBlock;

        // Re-classify units blocked out-of-order for counters even if their stored
        // status code drifted, while keeping counter sums equal to the unit total.
        const counterStatus =
          outOfOrderBlock && statusCode !== 'out_of_order' ? 'out_of_order' : statusCode;

        if (counterStatus === 'vacant_clean') counters.vacantClean++;
        else if (counterStatus === 'vacant_dirty') counters.vacantDirty++;
        else if (counterStatus === 'inspected') counters.inspected++;
        else if (counterStatus === 'occupied') counters.occupied++;
        else if (counterStatus === 'due_in') counters.dueIn++;
        else if (counterStatus === 'due_out') counters.dueOut++;
        else if (counterStatus === 'reserved') counters.reserved++;
        else if (counterStatus === 'out_of_order') counters.outOfOrder++;

        const attrs = row.attrs || {};
        const boardUnit: BoardUnitDto = {
          id: row.id,
          number: row.number,
          name: row.name,
          floor: row.floor,
          floorName: row.floor ? `Floor ${row.floor}` : 'Floor 1',
          building: row.building,
          unitTypeId: row.unit_type_id,
          unitTypeCode: row.unit_type_code,
          unitTypeName: row.unit_type_name,
          statusCode,
          statusLabel: statusMeta.label,
          colorToken: statusMeta.color_token,
          icon: statusMeta.icon,
          isSellable: effectiveSellable,
          isOccupied: statusMeta.is_occupied,
          isDirty: statusMeta.is_dirty,
          blocksBooking: effectiveBlocksBooking,
          guestName: attrs.guestName || null,
          vipStatus: attrs.vipStatus || null,
          eta: attrs.eta || null,
          etd: attrs.etd || null,
          connectingUnitNumber: row.connecting_number || null,
          activeBlock: row.block_id
            ? {
                id: row.block_id,
                blockType: row.block_type,
                reason: row.block_reason,
                fromDate: String(row.from_date).slice(0, 10),
                toDate: String(row.to_date).slice(0, 10),
                notes: row.block_notes,
              }
            : null,
        };

        const floorKey = row.floor || '1';
        if (!floorsMap.has(floorKey)) {
          floorsMap.set(floorKey, {
            floor: floorKey,
            floorName: `Floor ${floorKey}`,
            building: row.building,
            units: [],
          });
        }
        floorsMap.get(floorKey)!.units.push(boardUnit);

        // ETag must change whenever the rendered board or sellability changes:
        // unit version, status, status timestamp, active block identity/type/window.
        hashContent += `${row.id}:${row.version}:${statusCode}:${row.status_changed_at ? new Date(row.status_changed_at).toISOString() : ''}:${row.block_id || ''}:${row.block_type || ''}:${row.from_date ? String(row.from_date).slice(0, 10) : ''}:${row.to_date ? String(row.to_date).slice(0, 10) : ''};`;
      }

      // Calculate Occupancy Rate %
      if (counters.total > 0) {
        const occupiedCount = counters.occupied + counters.dueOut;
        counters.occupancyRate = Math.round((occupiedCount / counters.total) * 100);
      }

      // Generate ETag
      const etag = `"${crypto.createHash('md5').update(hashContent || 'empty').digest('hex')}"`;

      return {
        branchId,
        branchName: branch.name,
        businessDate: String(branch.business_date).slice(0, 10),
        counters,
        floors: Array.from(floorsMap.values()),
        generatedAt: new Date().toISOString(),
        etag,
      };
    });
  }
}
