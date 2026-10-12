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
import { GuestsService } from '../guests/guests.service.js';
import { ReservationsService } from './reservations.service.js';
import type {
  CreateGroupBlockDto,
  ImportRoomingListDto,
  GroupBlockDto,
} from '@innkeeper/contracts';

@Injectable()
export class GroupBlocksService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(GuestsService) private readonly guestsService: GuestsService,
    @Inject(ReservationsService) private readonly reservationsService: ReservationsService,
  ) {}

  /**
   * Create Group Block with Master Folio (REQ-RSV-009)
   */
  async createGroupBlock(
    tenantId: string,
    dto: CreateGroupBlockDto,
    userId?: string,
  ): Promise<GroupBlockDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      // Check code uniqueness
      const existing = await client.query(
        `SELECT id FROM group_blocks WHERE tenant_id = $1 AND branch_id = $2 AND code = $3`,
        [tenantId, dto.branchId, dto.code],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException(`Group block with code ${dto.code} already exists`);
      }

      const totalRooms = dto.allocations.reduce((sum, a) => sum + a.allocatedRooms, 0);
      const groupBlockId = uuidv7();
      const masterFolioId = uuidv7();
      const folioNo = `FOL-GRP-${dto.code}`;

      // 1. Create Master Folio
      await client.query(
        `INSERT INTO folios (
          id, tenant_id, branch_id, folio_no, kind, status, currency
        ) VALUES ($1, $2, $3, $4, 'master', 'open', 'USD')
        ON CONFLICT (tenant_id, branch_id, folio_no) DO NOTHING`,
        [masterFolioId, tenantId, dto.branchId, folioNo],
      );

      // 2. Insert Group Block Master
      const blockRes = await client.query(
        `INSERT INTO group_blocks (
          id, tenant_id, branch_id, company_id, name, code, status,
          start_date, end_date, cutoff_date, master_folio_id, total_rooms,
          picked_up_rooms, notes, attrs, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'definite', $7, $8, $9, $10, $11, 0, $12, $13, $14)
        RETURNING *`,
        [
          groupBlockId,
          tenantId,
          dto.branchId,
          dto.companyId || null,
          dto.name,
          dto.code,
          dto.startDate,
          dto.endDate,
          dto.cutoffDate,
          masterFolioId,
          totalRooms,
          dto.notes || null,
          JSON.stringify(dto.attrs || {}),
          userId || null,
        ],
      );

      // 3. Insert Allocations
      const savedAllocations: any[] = [];
      for (const alloc of dto.allocations) {
        const allocId = uuidv7();
        const aRes = await client.query(
          `INSERT INTO group_block_allocations (
            id, tenant_id, group_block_id, unit_type_id, allocated_rooms, picked_up_rooms, agreed_rate
          ) VALUES ($1, $2, $3, $4, $5, 0, $6)
          RETURNING *`,
          [allocId, tenantId, groupBlockId, alloc.unitTypeId, alloc.allocatedRooms, alloc.agreedRate],
        );
        savedAllocations.push({
          id: allocId,
          unitTypeId: alloc.unitTypeId,
          allocatedRooms: alloc.allocatedRooms,
          pickedUpRooms: 0,
          agreedRate: Number(alloc.agreedRate),
        });
      }

      const row = blockRes.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        companyId: row.company_id,
        name: row.name,
        code: row.code,
        status: row.status,
        startDate: row.start_date.toISOString().slice(0, 10),
        endDate: row.end_date.toISOString().slice(0, 10),
        cutoffDate: row.cutoff_date.toISOString().slice(0, 10),
        masterFolioId: row.master_folio_id,
        totalRooms: Number(row.total_rooms),
        pickedUpRooms: Number(row.picked_up_rooms),
        notes: row.notes,
        attrs: row.attrs,
        allocations: savedAllocations,
        createdAt: row.created_at.toISOString(),
      };
    });
  }

  /**
   * List Group Blocks for Branch
   */
  async getGroupBlocks(tenantId: string, branchId: string): Promise<GroupBlockDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT gb.*,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', gba.id,
                      'unitTypeId', gba.unit_type_id,
                      'allocatedRooms', gba.allocated_rooms,
                      'pickedUpRooms', gba.picked_up_rooms,
                      'agreedRate', gba.agreed_rate
                    )
                  ) FILTER (WHERE gba.id IS NOT NULL), '[]'
                ) AS allocations
         FROM group_blocks gb
         LEFT JOIN group_block_allocations gba ON gba.group_block_id = gb.id
         WHERE gb.tenant_id = $1 AND gb.branch_id = $2
         GROUP BY gb.id
         ORDER BY gb.start_date DESC`,
        [tenantId, branchId],
      );

      return res.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        companyId: row.company_id,
        name: row.name,
        code: row.code,
        status: row.status,
        startDate: typeof row.start_date === 'string' ? row.start_date : row.start_date.toISOString().slice(0, 10),
        endDate: typeof row.end_date === 'string' ? row.end_date : row.end_date.toISOString().slice(0, 10),
        cutoffDate: typeof row.cutoff_date === 'string' ? row.cutoff_date : row.cutoff_date.toISOString().slice(0, 10),
        masterFolioId: row.master_folio_id,
        totalRooms: Number(row.total_rooms),
        pickedUpRooms: Number(row.picked_up_rooms),
        notes: row.notes,
        attrs: row.attrs,
        allocations: row.allocations.map((a: any) => ({
          ...a,
          allocatedRooms: Number(a.allocatedRooms),
          pickedUpRooms: Number(a.pickedUpRooms),
          agreedRate: Number(a.agreedRate),
        })),
        createdAt: row.created_at.toISOString(),
      }));
    });
  }

  /**
   * Rooming List Import (REQ-RSV-009)
   * Converts rooming list rows into individual reservations tied to the group block
   */
  async importRoomingList(
    tenantId: string,
    groupBlockId: string,
    dto: ImportRoomingListDto,
    userId?: string,
  ): Promise<{ importedCount: number; reservationIds: string[] }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const blockRes = await client.query(
        `SELECT * FROM group_blocks WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, groupBlockId],
      );
      if (blockRes.rows.length === 0) {
        throw new NotFoundException(`Group block with ID ${groupBlockId} not found`);
      }
      const block = blockRes.rows[0];
      if (block.status !== 'definite') {
        throw new BadRequestException(`Group block is ${block.status}; only definite blocks accept rooming lists`);
      }

      // Check remaining capacity
      const remaining = Number(block.total_rooms) - Number(block.picked_up_rooms);
      if (dto.items.length > remaining) {
        throw new BadRequestException(
          `Cannot import ${dto.items.length} reservations; only ${remaining} rooms remaining in block`,
        );
      }

      // Fetch standard BAR rate plan for default association
      const rpRes = await client.query(
        `SELECT id FROM rate_plans WHERE tenant_id = $1 AND branch_id = $2 LIMIT 1`,
        [tenantId, block.branch_id],
      );
      const defaultRatePlanId = rpRes.rows[0]?.id;

      const createdReservationIds: string[] = [];

      for (const item of dto.items) {
        // Create reservation
        const resv = await this.reservationsService.createReservation(
          tenantId,
          {
            branchId: block.branch_id,
            source: 'group',
            companyId: block.company_id || undefined,
            guest: {
              firstName: item.firstName,
              lastName: item.lastName,
              email: item.email,
              phone: item.phone,
            },
            units: [
              {
                unitTypeId: item.unitTypeId,
                ratePlanId: defaultRatePlanId,
                checkIn: item.checkIn,
                checkOut: item.checkOut,
                adults: item.adults,
                children: item.children,
              },
            ],
            notes: `Group block: ${block.name} (${block.code})`,
            attrs: {
              groupBlockId: block.id,
              groupBlockCode: block.code,
              masterFolioId: block.master_folio_id,
            },
          },
          userId,
          client,
        );

        createdReservationIds.push(resv.id);

        // Increment picked_up_rooms on allocation
        await client.query(
          `UPDATE group_block_allocations
           SET picked_up_rooms = picked_up_rooms + 1
           WHERE tenant_id = $1 AND group_block_id = $2 AND unit_type_id = $3`,
          [tenantId, block.id, item.unitTypeId],
        );
      }

      // Increment picked_up_rooms on group_blocks master
      await client.query(
        `UPDATE group_blocks
         SET picked_up_rooms = picked_up_rooms + $1, updated_at = now()
         WHERE id = $2`,
        [dto.items.length, block.id],
      );

      return {
        importedCount: dto.items.length,
        reservationIds: createdReservationIds,
      };
    });
  }

  /**
   * Release Unallocated Group Block Rooms (REQ-RSV-009)
   */
  async releaseGroupBlock(
    tenantId: string,
    groupBlockId: string,
  ): Promise<{ released: boolean; releasedRooms: number }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT * FROM group_blocks WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, groupBlockId],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException(`Group block with ID ${groupBlockId} not found`);
      }
      const block = res.rows[0];
      const releasedRooms = Math.max(0, Number(block.total_rooms) - Number(block.picked_up_rooms));

      await client.query(
        `UPDATE group_blocks
         SET status = 'released', updated_at = now()
         WHERE id = $1`,
        [groupBlockId],
      );

      return { released: true, releasedRooms };
    });
  }
}
