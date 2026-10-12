import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { OutboxService } from '../../kernel/outbox/outbox.service.js';
import { AuditService } from '../../kernel/audit/audit.service.js';
import { EventsService } from './events.service.js';
import { UiService } from '../config/ui.service.js';
import type {
  PropertyTypeDto,
  AmenityDto,
  CreateAmenityDto,
  BuildingDto,
  CreateBuildingDto,
  FloorDto,
  CreateFloorDto,
  UnitTypeDto,
  CreateUnitTypeDto,
  UnitDto,
  CreateUnitDto,
  BulkCreateUnitsDto,
  ChangeUnitStatusDto,
  CreateUnitBlockDto,
  UnitBlockDto,
  UnitStatusLogDto,
} from '@innkeeper/contracts';

@Injectable()
export class PropertiesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(UiService) private readonly ui: UiService,
  ) {}

  async getPropertyTypes(tenantId: string): Promise<PropertyTypeDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id, code, name FROM property_types WHERE tenant_id = $1 ORDER BY code`,
        [tenantId],
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        code: r.code,
        name: r.name,
      }));
    });
  }

  async getAmenities(tenantId: string): Promise<AmenityDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id, code, name, icon, category, sort
         FROM amenities WHERE tenant_id = $1 ORDER BY sort, name`,
        [tenantId],
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        code: r.code,
        name: r.name,
        icon: r.icon,
        category: r.category,
        sort: r.sort,
      }));
    });
  }

  async createAmenity(tenantId: string, dto: CreateAmenityDto): Promise<AmenityDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const existing = await client.query(
        `SELECT id FROM amenities WHERE tenant_id = $1 AND code = $2`,
        [tenantId, dto.code],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException(`Amenity with code '${dto.code}' already exists`);
      }

      const id = uuidv7();
      const res = await client.query(
        `INSERT INTO amenities (id, tenant_id, code, name, icon, category, sort)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, tenantId, dto.code, dto.name, dto.icon || null, dto.category || 'room', dto.sort || 0],
      );
      const r = res.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        code: r.code,
        name: r.name,
        icon: r.icon,
        category: r.category,
        sort: r.sort,
      };
    });
  }

  async getBuildings(tenantId: string, branchId: string): Promise<BuildingDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id, branch_id, code, name, sort
         FROM buildings WHERE tenant_id = $1 AND branch_id = $2 ORDER BY sort, name`,
        [tenantId, branchId],
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        code: r.code,
        name: r.name,
        sort: r.sort,
      }));
    });
  }

  async createBuilding(tenantId: string, dto: CreateBuildingDto): Promise<BuildingDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const existing = await client.query(
        `SELECT id FROM buildings WHERE tenant_id = $1 AND branch_id = $2 AND code = $3`,
        [tenantId, dto.branchId, dto.code],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException(`Building with code '${dto.code}' already exists in this branch`);
      }

      const id = uuidv7();
      const res = await client.query(
        `INSERT INTO buildings (id, tenant_id, branch_id, code, name, sort)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, tenantId, dto.branchId, dto.code, dto.name, dto.sort || 0],
      );
      const r = res.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        code: r.code,
        name: r.name,
        sort: r.sort,
      };
    });
  }

  async getFloors(tenantId: string, branchId: string): Promise<FloorDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id, branch_id, building_id, number, name, sort
         FROM floors WHERE tenant_id = $1 AND branch_id = $2 ORDER BY sort, number`,
        [tenantId, branchId],
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        buildingId: r.building_id,
        number: r.number,
        name: r.name,
        sort: r.sort,
      }));
    });
  }

  async createFloor(tenantId: string, dto: CreateFloorDto): Promise<FloorDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const existing = await client.query(
        `SELECT id FROM floors WHERE tenant_id = $1 AND branch_id = $2 AND number = $3`,
        [tenantId, dto.branchId, dto.number],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException(`Floor '${dto.number}' already exists in this branch`);
      }

      const id = uuidv7();
      const res = await client.query(
        `INSERT INTO floors (id, tenant_id, branch_id, building_id, number, name, sort)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, tenantId, dto.branchId, dto.buildingId || null, dto.number, dto.name, dto.sort || 0],
      );
      const r = res.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        buildingId: r.building_id,
        number: r.number,
        name: r.name,
        sort: r.sort,
      };
    });
  }

  async getUnitTypes(tenantId: string, branchId: string): Promise<UnitTypeDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id, branch_id, code, name, kind, max_adults, max_children, max_occupancy,
                base_rate, amenities_ids, sort, attrs
         FROM unit_types WHERE tenant_id = $1 AND branch_id = $2 ORDER BY sort, code`,
        [tenantId, branchId],
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        code: r.code,
        name: r.name,
        kind: r.kind,
        maxAdults: r.max_adults,
        maxChildren: r.max_children,
        maxOccupancy: r.max_occupancy,
        baseRate: parseFloat(r.base_rate),
        amenitiesIds: r.amenities_ids || [],
        sort: r.sort,
        attrs: r.attrs || {},
      }));
    });
  }

  async createUnitType(tenantId: string, dto: CreateUnitTypeDto): Promise<UnitTypeDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const existing = await client.query(
        `SELECT id FROM unit_types WHERE tenant_id = $1 AND branch_id = $2 AND code = $3`,
        [tenantId, dto.branchId, dto.code],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException(`Unit type with code '${dto.code}' already exists in this branch`);
      }

      const id = uuidv7();
      const res = await client.query(
        `INSERT INTO unit_types (id, tenant_id, branch_id, code, name, kind, max_adults, max_children, max_occupancy, base_rate, amenities_ids, sort, attrs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          id,
          tenantId,
          dto.branchId,
          dto.code,
          dto.name,
          dto.kind,
          dto.maxAdults,
          dto.maxChildren,
          dto.maxOccupancy,
          dto.baseRate,
          dto.amenitiesIds || [],
          dto.sort || 0,
          JSON.stringify(dto.attrs || {}),
        ],
      );

      const r = res.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        code: r.code,
        name: r.name,
        kind: r.kind,
        maxAdults: r.max_adults,
        maxChildren: r.max_children,
        maxOccupancy: r.max_occupancy,
        baseRate: parseFloat(r.base_rate),
        amenitiesIds: r.amenities_ids || [],
        sort: r.sort,
        attrs: r.attrs || {},
      };
    });
  }

  async getUnits(
    tenantId: string,
    filter: {
      branchId: string;
      floor?: string;
      statusCode?: string;
      unitTypeId?: string;
      search?: string;
    },
  ): Promise<UnitDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      let query = `
        SELECT id, tenant_id, branch_id, unit_type_id, building, floor, number, name,
               status_code, status_changed_at, is_sellable, connecting_unit_id, attrs, version, deleted_at
        FROM units
        WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL
      `;
      const params: any[] = [tenantId, filter.branchId];

      if (filter.floor) {
        params.push(filter.floor);
        query += ` AND floor = $${params.length}`;
      }
      if (filter.statusCode) {
        params.push(filter.statusCode);
        query += ` AND status_code = $${params.length}`;
      }
      if (filter.unitTypeId) {
        params.push(filter.unitTypeId);
        query += ` AND unit_type_id = $${params.length}`;
      }
      if (filter.search) {
        params.push(`%${filter.search}%`);
        query += ` AND (number ILIKE $${params.length} OR name ILIKE $${params.length})`;
      }

      query += ` ORDER BY floor, number`;

      const res = await client.query(query, params);
      return res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        unitTypeId: r.unit_type_id,
        building: r.building,
        floor: r.floor,
        number: r.number,
        name: r.name,
        statusCode: r.status_code,
        statusChangedAt: r.status_changed_at ? new Date(r.status_changed_at).toISOString() : undefined,
        isSellable: r.is_sellable,
        connectingUnitId: r.connecting_unit_id,
        attrs: r.attrs || {},
        version: r.version,
        deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : undefined,
      }));
    });
  }

  async getUnitById(tenantId: string, id: string): Promise<UnitDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT u.id, u.tenant_id, u.branch_id, u.unit_type_id, u.building, u.floor, u.number, u.name,
                u.status_code, u.status_changed_at, u.is_sellable, u.connecting_unit_id, u.attrs, u.version, u.deleted_at,
                ut.code AS unit_type_code, ut.name AS unit_type_name, ut.kind AS unit_type_kind,
                ut.max_adults, ut.max_children, ut.max_occupancy, ut.base_rate, ut.amenities_ids, ut.attrs AS unit_type_attrs
         FROM units u
         LEFT JOIN unit_types ut ON ut.id = u.unit_type_id
         WHERE u.tenant_id = $1 AND u.id = $2 AND u.deleted_at IS NULL`,
        [tenantId, id],
      );

      if (res.rows.length === 0) {
        throw new NotFoundException(`Unit with ID ${id} not found`);
      }

      const r = res.rows[0];
      const mergedAttrs = {
        inherited: {
          unitTypeCode: r.unit_type_code,
          unitTypeName: r.unit_type_name,
          kind: r.unit_type_kind,
          maxAdults: r.max_adults,
          maxChildren: r.max_children,
          maxOccupancy: r.max_occupancy,
          baseRate: r.base_rate ? parseFloat(r.base_rate) : 0,
          amenitiesIds: r.amenities_ids || [],
        },
        ...(r.attrs || {}),
      };

      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        unitTypeId: r.unit_type_id,
        building: r.building,
        floor: r.floor,
        number: r.number,
        name: r.name,
        statusCode: r.status_code,
        statusChangedAt: r.status_changed_at ? new Date(r.status_changed_at).toISOString() : undefined,
        isSellable: r.is_sellable,
        connectingUnitId: r.connecting_unit_id,
        attrs: mergedAttrs,
        version: r.version,
        deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : undefined,
      };
    });
  }

  async getUnitStatusLog(tenantId: string, unitId: string): Promise<UnitStatusLogDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT l.id, l.tenant_id, l.branch_id, l.unit_id, l.from_status, l.to_status,
                l.reason, l.changed_by, l.created_at,
                u.name AS user_name, u.email
         FROM unit_status_log l
         LEFT JOIN users u ON u.id = l.changed_by
         WHERE l.tenant_id = $1 AND l.unit_id = $2
         ORDER BY l.created_at DESC`,
        [tenantId, unitId],
      );

      return res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        unitId: r.unit_id,
        fromStatus: r.from_status,
        toStatus: r.to_status,
        reason: r.reason || null,
        changedBy: r.changed_by,
        changedByName: r.user_name || r.email || undefined,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    });
  }

  async createUnit(tenantId: string, dto: CreateUnitDto): Promise<UnitDto> {
    if (dto.attrs && Object.keys(dto.attrs).length > 0) {
      const validation = await this.ui.validateEntityAttrs(tenantId, 'unit', dto.attrs);
      if (!validation.success) {
        throw new BadRequestException({
          error: 'invalid_custom_fields',
          message: 'Unit attributes failed validation',
          details: validation.issues,
        });
      }
    }

    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const existing = await client.query(
        `SELECT id FROM units WHERE tenant_id = $1 AND branch_id = $2 AND number = $3 AND deleted_at IS NULL`,
        [tenantId, dto.branchId, dto.number],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException(`Unit with number '${dto.number}' already exists in this branch`);
      }

      const id = uuidv7();
      const res = await client.query(
        `INSERT INTO units (id, tenant_id, branch_id, unit_type_id, building, floor, number, name, status_code, is_sellable, connecting_unit_id, attrs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          id,
          tenantId,
          dto.branchId,
          dto.unitTypeId,
          dto.building || null,
          dto.floor || null,
          dto.number,
          dto.name || null,
          dto.statusCode || 'vacant_dirty',
          dto.isSellable !== undefined ? dto.isSellable : true,
          dto.connectingUnitId || null,
          JSON.stringify(dto.attrs || {}),
        ],
      );

      const r = res.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        unitTypeId: r.unit_type_id,
        building: r.building,
        floor: r.floor,
        number: r.number,
        name: r.name,
        statusCode: r.status_code,
        statusChangedAt: r.status_changed_at ? new Date(r.status_changed_at).toISOString() : undefined,
        isSellable: r.is_sellable,
        connectingUnitId: r.connecting_unit_id,
        attrs: r.attrs || {},
        version: r.version,
        deletedAt: undefined,
      };
    });
  }

  async bulkCreateUnits(tenantId: string, dto: BulkCreateUnitsDto): Promise<{ createdCount: number; units: UnitDto[] }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const createdUnits: UnitDto[] = [];
      const prefix = dto.prefix || '';

      for (let i = dto.startNumber; i <= dto.endNumber; i++) {
        const paddedNum = String(i).padStart(dto.padding || 2, '0');
        const unitNumber = `${prefix}${paddedNum}`;

        const existing = await client.query(
          `SELECT id FROM units WHERE tenant_id = $1 AND branch_id = $2 AND number = $3 AND deleted_at IS NULL`,
          [tenantId, dto.branchId, unitNumber],
        );
        if (existing.rows.length > 0) {
          continue; // skip existing to allow idempotent bulk runs
        }

        const id = uuidv7();
        const res = await client.query(
          `INSERT INTO units (id, tenant_id, branch_id, unit_type_id, building, floor, number, name, status_code, is_sellable, attrs)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *`,
          [
            id,
            tenantId,
            dto.branchId,
            dto.unitTypeId,
            dto.building || null,
            dto.floor,
            unitNumber,
            `Room ${unitNumber}`,
            dto.statusCode || 'vacant_clean',
            true,
            JSON.stringify({}),
          ],
        );

        const r = res.rows[0];
        createdUnits.push({
          id: r.id,
          tenantId: r.tenant_id,
          branchId: r.branch_id,
          unitTypeId: r.unit_type_id,
          building: r.building,
          floor: r.floor,
          number: r.number,
          name: r.name,
          statusCode: r.status_code,
          statusChangedAt: r.status_changed_at ? new Date(r.status_changed_at).toISOString() : undefined,
          isSellable: r.is_sellable,
          connectingUnitId: r.connecting_unit_id,
          attrs: r.attrs || {},
          version: r.version,
          deletedAt: undefined,
        });
      }

      return {
        createdCount: createdUnits.length,
        units: createdUnits,
      };
    });
  }

  async updateUnit(tenantId: string, id: string, dto: Partial<CreateUnitDto>): Promise<UnitDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const existing = await client.query(
        `SELECT id, version FROM units WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [tenantId, id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Unit with ID ${id} not found`);
      }

      const updates: string[] = ['updated_at = now()', 'version = version + 1'];
      const params: any[] = [tenantId, id];

      if (dto.name !== undefined) {
        params.push(dto.name);
        updates.push(`name = $${params.length}`);
      }
      if (dto.unitTypeId !== undefined) {
        params.push(dto.unitTypeId);
        updates.push(`unit_type_id = $${params.length}`);
      }
      if (dto.building !== undefined) {
        params.push(dto.building);
        updates.push(`building = $${params.length}`);
      }
      if (dto.floor !== undefined) {
        params.push(dto.floor);
        updates.push(`floor = $${params.length}`);
      }
      if (dto.isSellable !== undefined) {
        params.push(dto.isSellable);
        updates.push(`is_sellable = $${params.length}`);
      }
      if (dto.connectingUnitId !== undefined) {
        params.push(dto.connectingUnitId);
        updates.push(`connecting_unit_id = $${params.length}`);
      }
      if (dto.attrs !== undefined) {
        params.push(JSON.stringify(dto.attrs));
        updates.push(`attrs = $${params.length}`);
      }

      const res = await client.query(
        `UPDATE units SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        params,
      );

      const r = res.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        unitTypeId: r.unit_type_id,
        building: r.building,
        floor: r.floor,
        number: r.number,
        name: r.name,
        statusCode: r.status_code,
        statusChangedAt: r.status_changed_at ? new Date(r.status_changed_at).toISOString() : undefined,
        isSellable: r.is_sellable,
        connectingUnitId: r.connecting_unit_id,
        attrs: r.attrs || {},
        version: r.version,
        deletedAt: undefined,
      };
    });
  }

  async deleteUnit(tenantId: string, id: string): Promise<{ success: boolean }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `UPDATE units SET deleted_at = now() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
        [tenantId, id],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException(`Unit with ID ${id} not found`);
      }
      return { success: true };
    });
  }

  async changeUnitStatus(
    tenantId: string,
    branchId: string,
    unitId: string,
    dto: ChangeUnitStatusDto,
    userId: string,
    userPermissions: string[] = ['*'],
  ): Promise<UnitDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      // 1. Fetch current unit
      const unitRes = await client.query(
        `SELECT id, branch_id, status_code, number, version FROM units
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [tenantId, unitId],
      );
      if (unitRes.rows.length === 0) {
        throw new NotFoundException(`Unit with ID ${unitId} not found`);
      }

      const unit = unitRes.rows[0];
      const fromStatus = unit.status_code;
      const toStatus = dto.toStatus;

      if (fromStatus === toStatus) {
        return this.getUnitById(tenantId, unitId); // no-op
      }

      // 2. Validate state machine transition against status_transitions table
      const transitionRes = await client.query(
        `SELECT id, permission, requires_reason
         FROM status_transitions
         WHERE tenant_id = $1 AND entity = 'unit' AND from_code = $2 AND to_code = $3`,
        [tenantId, fromStatus, toStatus],
      );

      if (transitionRes.rows.length === 0) {
        throw new BadRequestException(
          `Status transition from '${fromStatus}' to '${toStatus}' is not allowed for unit '${unit.number}'`,
        );
      }

      const transition = transitionRes.rows[0];

      // 3. Permission check
      const hasWildcard = userPermissions.includes('*');
      if (!hasWildcard && !userPermissions.includes(transition.permission)) {
        throw new ForbiddenException(
          `User lacks required permission '${transition.permission}' to perform status transition`,
        );
      }

      // 4. Reason check
      if (transition.requires_reason && (!dto.reason || dto.reason.trim().length === 0)) {
        throw new BadRequestException(
          `A mandatory reason string is required to transition to status '${toStatus}'`,
        );
      }

      // 5. Look up status_defs for sellability & occupancy behavior flags,
      //    preferring a branch-specific definition over the tenant default.
      const statusDefRes = await client.query(
        `SELECT is_sellable, is_occupied, is_dirty, blocks_booking
         FROM status_defs
         WHERE tenant_id = $1 AND entity = 'unit' AND code = $2
           AND (branch_id = $3 OR branch_id IS NULL)
         ORDER BY (branch_id IS NULL) ASC
         LIMIT 1`,
        [tenantId, toStatus, unit.branch_id],
      );

      const isSellable = statusDefRes.rows.length > 0 ? statusDefRes.rows[0].is_sellable : false;

      // 6. Record status transition log
      const logId = uuidv7();
      await client.query(
        `INSERT INTO unit_status_log (id, tenant_id, branch_id, unit_id, from_status, to_status, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [logId, tenantId, unit.branch_id, unitId, fromStatus, toStatus, dto.reason || null, userId],
      );

      // 7. Update unit
      const updateRes = await client.query(
        `UPDATE units
         SET status_code = $1, status_changed_at = now(), is_sellable = $2, version = version + 1, updated_at = now()
         WHERE tenant_id = $3 AND id = $4
         RETURNING *`,
        [toStatus, isSellable, tenantId, unitId],
      );

      const updated = updateRes.rows[0];

      // 8. Publish Outbox Event: unit.status_changed
      await this.outbox.emit(client, tenantId, {
        aggregateType: 'unit',
        aggregateId: unitId,
        eventType: 'unit.status_changed',
        payload: {
          unitId,
          unitNumber: unit.number,
          fromStatus,
          toStatus,
          reason: dto.reason,
          branchId: unit.branch_id,
          changedBy: userId,
          timestamp: new Date().toISOString(),
        },
      });

      // 9. Real-time broadcast to connected SSE clients
      this.events.broadcast(
        tenantId,
        'unit.status_changed',
        {
          unitId,
          unitNumber: unit.number,
          fromStatus,
          toStatus,
          branchId: unit.branch_id,
          reason: dto.reason,
        },
        unit.branch_id,
      );

      return {
        id: updated.id,
        tenantId: updated.tenant_id,
        branchId: updated.branch_id,
        unitTypeId: updated.unit_type_id,
        building: updated.building,
        floor: updated.floor,
        number: updated.number,
        name: updated.name,
        statusCode: updated.status_code,
        statusChangedAt: updated.status_changed_at ? new Date(updated.status_changed_at).toISOString() : undefined,
        isSellable: updated.is_sellable,
        connectingUnitId: updated.connecting_unit_id,
        attrs: updated.attrs || {},
        version: updated.version,
        deletedAt: undefined,
      };
    });
  }

  async createUnitBlock(tenantId: string, dto: CreateUnitBlockDto & { unitId: string }, userId: string): Promise<UnitBlockDto> {
    // Date-range sanity: a block must end on or after it starts.
    if (dto.toDate < dto.fromDate) {
      throw new BadRequestException(`Block to_date (${dto.toDate}) cannot be before from_date (${dto.fromDate})`);
    }

    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      // 1. Verify unit exists
      const unitRes = await client.query(
        `SELECT id, branch_id, status_code, number FROM units
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [tenantId, dto.unitId],
      );
      if (unitRes.rows.length === 0) {
        throw new NotFoundException(`Unit with ID ${dto.unitId} not found`);
      }
      const unit = unitRes.rows[0];

      // 2. Reject overlapping active blocks on the same unit (inclusive date ranges).
      const overlapRes = await client.query(
        `SELECT id FROM unit_blocks
         WHERE tenant_id = $1 AND unit_id = $2 AND is_active = true
           AND from_date <= $4 AND to_date >= $3
         LIMIT 1`,
        [tenantId, dto.unitId, dto.fromDate, dto.toDate],
      );
      if (overlapRes.rows.length > 0) {
        throw new ConflictException('An active block already overlaps the requested date range for this unit');
      }

      const blockId = uuidv7();
      await client.query(
        `INSERT INTO unit_blocks (id, tenant_id, branch_id, unit_id, block_type, reason, from_date, to_date, notes, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)`,
        [
          blockId,
          tenantId,
          unit.branch_id,
          dto.unitId,
          dto.blockType,
          dto.reason,
          dto.fromDate,
          dto.toDate,
          dto.notes || null,
          userId,
        ],
      );

      const fromStatus = unit.status_code;
      // Out-of-order makes the room physically unusable (status change); out-of-service
      // only removes it from sale. Both make the unit unsellable while active.
      const toStatus = dto.blockType === 'out_of_order' ? 'out_of_order' : fromStatus;

      const updateRes = await client.query(
        `UPDATE units
         SET status_code = $1, status_changed_at = now(), is_sellable = false,
             version = version + 1, updated_at = now()
         WHERE tenant_id = $2 AND id = $3
         RETURNING version`,
        [toStatus, tenantId, dto.unitId],
      );

      if (toStatus !== fromStatus) {
        const logId = uuidv7();
        await client.query(
          `INSERT INTO unit_status_log (id, tenant_id, branch_id, unit_id, from_status, to_status, reason, changed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [logId, tenantId, unit.branch_id, dto.unitId, fromStatus, toStatus, dto.reason, userId],
        );

        await this.outbox.emit(client, tenantId, {
          aggregateType: 'unit',
          aggregateId: dto.unitId,
          eventType: 'unit.status_changed',
          payload: {
            unitId: dto.unitId,
            unitNumber: unit.number,
            fromStatus,
            toStatus,
            reason: dto.reason,
            branchId: unit.branch_id,
            changedBy: userId,
            timestamp: new Date().toISOString(),
          },
        });

        this.events.broadcast(
          tenantId,
          'unit.status_changed',
          {
            unitId: dto.unitId,
            unitNumber: unit.number,
            fromStatus,
            toStatus,
            branchId: unit.branch_id,
            reason: dto.reason,
          },
          unit.branch_id,
        );
      } else {
        // Status unchanged but sellability/version changed — nudge realtime clients.
        this.events.broadcast(
          tenantId,
          'unit.blocked',
          { unitId: dto.unitId, unitNumber: unit.number, blockType: dto.blockType, branchId: unit.branch_id },
          unit.branch_id,
        );
      }

      return {
        id: blockId,
        tenantId,
        branchId: unit.branch_id,
        unitId: dto.unitId,
        blockType: dto.blockType,
        reason: dto.reason,
        fromDate: dto.fromDate,
        toDate: dto.toDate,
        notes: dto.notes,
        isActive: true,
        createdBy: userId,
        releasedAt: undefined,
      };
    });
  }

  async releaseUnitBlock(tenantId: string, blockId: string, userId: string): Promise<{ success: boolean }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `UPDATE unit_blocks
         SET is_active = false, released_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND is_active = true
         RETURNING unit_id, branch_id`,
        [tenantId, blockId],
      );

      if (res.rows.length === 0) {
        throw new NotFoundException(`Active unit block with ID ${blockId} not found`);
      }

      const { unit_id, branch_id } = res.rows[0];

      // Confirm no other active block keeps the unit out of order before restoring it.
      const remainingRes = await client.query(
        `SELECT 1 FROM unit_blocks
         WHERE tenant_id = $1 AND unit_id = $2 AND is_active = true
           AND CURRENT_DATE BETWEEN from_date AND to_date
         LIMIT 1`,
        [tenantId, unit_id],
      );

      const unitRes = await client.query(
        `SELECT status_code, number FROM units WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, unit_id],
      );
      const unit = unitRes.rows[0];
      if (!unit) {
        return { success: true };
      }

      // Only restore a unit that this block actually took out of order, and only
      // when nothing else still blocks it — never clobber an in-house stay.
      if (unit.status_code === 'out_of_order' && remainingRes.rows.length === 0) {
        await client.query(
          `UPDATE units
           SET status_code = 'vacant_dirty', status_changed_at = now(), is_sellable = false,
               version = version + 1, updated_at = now()
           WHERE tenant_id = $1 AND id = $2`,
          [tenantId, unit_id],
        );

        const logId = uuidv7();
        await client.query(
          `INSERT INTO unit_status_log (id, tenant_id, branch_id, unit_id, from_status, to_status, reason, changed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [logId, tenantId, branch_id, unit_id, 'out_of_order', 'vacant_dirty', 'Block released', userId],
        );

        await this.outbox.emit(client, tenantId, {
          aggregateType: 'unit',
          aggregateId: unit_id,
          eventType: 'unit.status_changed',
          payload: {
            unitId: unit_id,
            unitNumber: unit.number,
            fromStatus: 'out_of_order',
            toStatus: 'vacant_dirty',
            reason: 'Block released',
            branchId: branch_id,
            changedBy: userId,
            timestamp: new Date().toISOString(),
          },
        });

        this.events.broadcast(
          tenantId,
          'unit.status_changed',
          {
            unitId: unit_id,
            unitNumber: unit.number,
            fromStatus: 'out_of_order',
            toStatus: 'vacant_dirty',
            branchId: branch_id,
            reason: 'Block released',
          },
          branch_id,
        );
      } else {
        this.events.broadcast(
          tenantId,
          'unit.released',
          { unitId: unit_id, unitNumber: unit.number, branchId: branch_id },
          branch_id,
        );
      }

      return { success: true };
    });
  }
}
