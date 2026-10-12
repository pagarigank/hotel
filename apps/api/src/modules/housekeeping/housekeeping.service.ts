import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import pg from 'pg';
import crypto from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { EventsService } from '../properties/events.service.js';
import { FoliosService } from '../folios/folios.service.js';
import type {
  HkTaskDto,
  UpdateHkTaskStatusDto,
  PostMinibarChargeDto,
  MaintenanceOrderDto,
  LostFoundDto,
} from '@innkeeper/contracts';

@Injectable()
export class HousekeepingService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventsService) private readonly eventsService: EventsService,
    @Inject(FoliosService) private readonly foliosService: FoliosService,
  ) {}

  /**
   * List Housekeeping Tasks
   */
  async getTasks(
    tenantId: string,
    filters?: { branchId?: string; status?: string; attendantId?: string; unitId?: string },
  ): Promise<HkTaskDto[]> {
    let sql = `
      SELECT t.*, u.number as unit_number, u.floor,
             usr.name as attendant_name,
             chk.items as checklist_items
      FROM hk_tasks t
      JOIN units u ON u.id = t.unit_id
      LEFT JOIN users usr ON usr.id = t.assigned_to
      LEFT JOIN hk_checklists chk ON chk.id = t.checklist_id
      WHERE t.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (filters?.branchId) {
      params.push(filters.branchId);
      sql += ` AND t.branch_id = $${params.length}`;
    }
    if (filters?.status) {
      params.push(filters.status);
      sql += ` AND t.status = $${params.length}`;
    }
    if (filters?.attendantId) {
      params.push(filters.attendantId);
      sql += ` AND t.assigned_to = $${params.length}`;
    }
    if (filters?.unitId) {
      params.push(filters.unitId);
      sql += ` AND t.unit_id = $${params.length}`;
    }

    sql += ` ORDER BY
      CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'standard' THEN 3 ELSE 4 END,
      t.created_at ASC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client: pg.PoolClient) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => this.mapTaskRow(r));
  }

  /**
   * Update HK Task Status (Attendant completion / Supervisor inspection)
   */
  async updateTaskStatus(
    tenantId: string,
    taskId: string,
    dto: UpdateHkTaskStatusDto,
    userId?: string,
  ): Promise<HkTaskDto> {
    return this.db.transaction(tenantId, async (client) => {
      const taskRes = await client.query(
        `SELECT t.*, u.status_code as unit_status
         FROM hk_tasks t
         JOIN units u ON u.id = t.unit_id
         WHERE t.id = $1 AND t.tenant_id = $2
         FOR UPDATE`,
        [taskId, tenantId],
      );
      if (taskRes.rows.length === 0) {
        throw new NotFoundException(`Task ${taskId} not found`);
      }
      const task = taskRes.rows[0];

      let startedAt = task.started_at;
      let finishedAt = task.finished_at;
      let notes = dto.notes ? (task.notes ? `${task.notes}; ${dto.notes}` : dto.notes) : task.notes;

      if (dto.status === 'in_progress' && !startedAt) {
        startedAt = new Date();
      }
      if (dto.status === 'completed') {
        finishedAt = new Date();
      }

      // Update task record
      const updateRes = await client.query(
        `UPDATE hk_tasks
         SET status = $1, started_at = $2, finished_at = $3, notes = $4, updated_at = now()
         WHERE id = $5
         RETURNING *`,
        [dto.status, startedAt, finishedAt, notes, taskId],
      );

      // Auto-update unit physical status based on housekeeping progression:
      if (dto.status === 'completed') {
        // If it was checkout_clean or deep_clean, the room is now clean!
        if (task.unit_status !== 'occupied') {
          await client.query(
            `UPDATE units SET status_code = 'vacant_clean', updated_at = now() WHERE id = $1`,
            [task.unit_id],
          );
        }
      } else if (dto.status === 'inspected') {
        if (task.unit_status !== 'occupied') {
          await client.query(
            `UPDATE units SET status_code = 'inspected', updated_at = now() WHERE id = $1`,
            [task.unit_id],
          );
        }
      } else if (dto.status === 'rejected') {
        if (task.unit_status !== 'occupied') {
          await client.query(
            `UPDATE units SET status_code = 'vacant_dirty', updated_at = now() WHERE id = $1`,
            [task.unit_id],
          );
        }
      }

      this.eventsService.broadcast(
        tenantId,
        'innkeeper.housekeeping.task_updated',
        {
          taskId,
          unitId: task.unit_id,
          newStatus: dto.status,
        },
        task.branch_id,
      );

      // Return refreshed task
      const refreshed = await client.query(
        `SELECT t.*, u.number as unit_number, u.floor, usr.name as attendant_name, chk.items as checklist_items
         FROM hk_tasks t
         JOIN units u ON u.id = t.unit_id
         LEFT JOIN users usr ON usr.id = t.assigned_to
         LEFT JOIN hk_checklists chk ON chk.id = t.checklist_id
         WHERE t.id = $1`,
        [taskId],
      );
      return this.mapTaskRow(refreshed.rows[0]);
    });
  }

  /**
   * Post Minibar Consumption Charge to Folio
   */
  async postMinibarCharge(
    tenantId: string,
    dto: PostMinibarChargeDto,
    userId?: string,
  ): Promise<any> {
    return this.db.transaction(tenantId, async (client) => {
      let stayId = dto.stayId;
      if (!stayId && dto.unitId) {
        const stayRes = await client.query(
          `SELECT id FROM stays WHERE unit_id = $1 AND status = 'in_house' AND tenant_id = $2 LIMIT 1`,
          [dto.unitId, tenantId],
        );
        if (stayRes.rows.length > 0) {
          stayId = stayRes.rows[0].id;
        }
      }

      if (!stayId) {
        throw new BadRequestException(`No active in-house stay found to bill minibar charges`);
      }

      // Find active folio for stay
      const folioRes = await client.query(
        `SELECT id FROM folios WHERE stay_id = $1 AND tenant_id = $2 LIMIT 1`,
        [stayId, tenantId],
      );
      if (folioRes.rows.length === 0) {
        throw new NotFoundException(`No open folio found for stay ${stayId}`);
      }
      const folioId = folioRes.rows[0].id;

      // Post directly through FoliosService
      return this.foliosService.postCharge(
        tenantId,
        folioId,
        {
          windowNo: dto.windowNo || 1,
          lineType: 'charge',
          chargeType: 'minibar',
          description: `Minibar: ${dto.itemName}`,
          qty: dto.qty || 1,
          unitAmount: dto.unitAmount,
          taxAmount: 0,
        },
        userId,
        client,
      );
    });
  }

  /**
   * Maintenance Orders
   */
  async getMaintenanceOrders(tenantId: string, branchId?: string): Promise<MaintenanceOrderDto[]> {
    let sql = `
      SELECT m.*, u.number as unit_number
      FROM maintenance_orders m
      LEFT JOIN units u ON u.id = m.unit_id
      WHERE m.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    if (branchId) {
      params.push(branchId);
      sql += ` AND m.branch_id = $${params.length}`;
    }
    sql += ` ORDER BY m.created_at DESC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client: pg.PoolClient) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      unitId: r.unit_id,
      unitNumber: r.unit_number,
      title: r.title,
      description: r.description,
      priority: r.priority,
      status: r.status,
      reportedBy: r.reported_by,
      assignedTo: r.assigned_to,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    }));
  }

  async createMaintenanceOrder(
    tenantId: string,
    branchId: string,
    data: {
      unitId: string;
      title: string;
      description: string;
      priority: 'low' | 'medium' | 'high' | 'emergency';
      blocksUnit?: boolean;
    },
    userId?: string,
  ): Promise<MaintenanceOrderDto> {
    return this.db.transaction(tenantId, async (client) => {
      const orderId = crypto.randomUUID();
      const insertRes = await client.query(
        `INSERT INTO maintenance_orders (
          id, tenant_id, branch_id, unit_id, title, description,
          priority, status, blocks_unit, block_type, reported_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'reported', $8, $9, $10)
        RETURNING *`,
        [
          orderId,
          tenantId,
          branchId,
          data.unitId,
          data.title,
          data.description,
          data.priority,
          data.blocksUnit || false,
          data.blocksUnit ? 'out_of_order' : null,
          userId || '10000000-0000-0000-0000-000000000001',
        ],
      );

      if (data.blocksUnit) {
        await client.query(
          `UPDATE units SET status_code = 'out_of_order', updated_at = now() WHERE id = $1`,
          [data.unitId],
        );
      }

      const row = insertRes.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        unitId: row.unit_id,
        title: row.title,
        description: row.description,
        priority: row.priority,
        status: row.status,
        reportedBy: row.reported_by,
        assignedTo: row.assigned_to,
        createdAt: new Date(row.created_at).toISOString(),
      };
    });
  }

  /**
   * Lost and Found
   */
  async getLostFoundItems(tenantId: string, branchId?: string): Promise<LostFoundDto[]> {
    let sql = `
      SELECT lf.*, u.number as unit_number
      FROM lost_found lf
      LEFT JOIN units u ON u.id = lf.found_unit_id
      WHERE lf.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    if (branchId) {
      params.push(branchId);
      sql += ` AND lf.branch_id = $${params.length}`;
    }
    sql += ` ORDER BY lf.found_date DESC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client: pg.PoolClient) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      itemName: r.item_name,
      category: r.category,
      foundLocation: r.found_location,
      foundUnitId: r.found_unit_id,
      foundUnitNumber: r.unit_number,
      foundDate: r.found_date instanceof Date ? r.found_date.toISOString().split('T')[0] : String(r.found_date),
      status: r.status,
      storageLocation: r.storage_location,
      claimedBy: r.claimed_by,
      claimedAt: r.claimed_at ? new Date(r.claimed_at).toISOString() : null,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    }));
  }

  async createLostFoundItem(
    tenantId: string,
    branchId: string,
    data: {
      itemName: string;
      category?: 'clothing' | 'electronics' | 'jewelry' | 'document' | 'cash' | 'other';
      foundLocation: string;
      foundUnitId?: string;
      storageLocation?: string;
    },
    userId?: string,
  ): Promise<LostFoundDto> {
    return this.db.transaction(tenantId, async (client) => {
      const id = crypto.randomUUID();
      const insertRes = await client.query(
        `INSERT INTO lost_found (
          id, tenant_id, branch_id, item_name, category, found_location,
          found_unit_id, found_by, found_date, status, storage_location
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE, 'held', $9)
        RETURNING *`,
        [
          id,
          tenantId,
          branchId,
          data.itemName,
          data.category || 'other',
          data.foundLocation,
          data.foundUnitId || null,
          userId || '10000000-0000-0000-0000-000000000001',
          data.storageLocation || 'HK Secure Cabinet #1',
        ],
      );
      const r = insertRes.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        itemName: r.item_name,
        category: r.category as any,
        foundLocation: r.found_location,
        foundUnitId: r.found_unit_id,
        foundDate: r.found_date instanceof Date ? r.found_date.toISOString().split('T')[0] : String(r.found_date),
        status: r.status as any,
        storageLocation: r.storage_location,
        claimedBy: r.claimed_by_guest_id,
        claimedAt: r.claimed_at ? new Date(r.claimed_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  private mapTaskRow(row: any): HkTaskDto {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      unitId: row.unit_id,
      unitNumber: row.unit_number,
      floor: row.floor,
      taskType: row.task_type,
      priority: row.priority,
      status: row.status,
      assignedUserId: row.assigned_to,
      assignedUserName: row.attendant_name,
      checklistId: row.checklist_id,
      checklistItems: Array.isArray(row.checklist_items) ? row.checklist_items : [],
      notes: row.notes,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
      inspectedAt: row.status === 'inspected' && row.updated_at ? new Date(row.updated_at).toISOString() : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    };
  }
}
