import { Injectable, Inject, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';
import { DatabaseService } from '../../kernel/database/database.service.js';
import type { StatusDef, ActionDef, CustomFieldDef } from '@innkeeper/config-schemas';
import { validateCustomFieldValues } from '@innkeeper/config-schemas';
import type { NavigationItem } from '@innkeeper/contracts';
import type {
  NavigationConfigDto,
  UpdateNavigationConfigDto,
} from '@innkeeper/contracts';
import type {
  CreateStatusDefDto,
  UpdateStatusDefDto,
  CreateActionDefDto,
  UpdateActionDefDto,
  CreateCustomFieldDefDto,
  UpdateCustomFieldDefDto,
  CreateStatusTransitionDto,
} from '@innkeeper/contracts';

const DEFAULT_NAVIGATION_TREE: NavigationItem[] = [
  {
    key: 'frontdesk',
    label: 'Front Desk',
    path: '/frontdesk',
    icon: 'bi-reception-4',
    permission: 'frontdesk.stay.checkin',
    children: [
      { key: 'board', label: 'Rooms Board', path: '/board', icon: 'bi-grid-3x3-gap', permission: 'frontdesk.stay.checkin' },
      { key: 'arrivals', label: 'Expected Arrivals', path: '/frontdesk/arrivals', icon: 'bi-box-arrow-in-right', permission: 'frontdesk.stay.checkin' },
      { key: 'departures', label: 'Departures', path: '/frontdesk/departures', icon: 'bi-box-arrow-right', permission: 'frontdesk.stay.checkout' },
      { key: 'inhouse', label: 'In-House Guests', path: '/frontdesk/inhouse', icon: 'bi-people', permission: 'frontdesk.stay.checkin' },
    ],
  },
  {
    key: 'reservations',
    label: 'Reservations',
    path: '/reservations',
    icon: 'bi-calendar-check',
    permission: 'reservation.booking.create',
    children: [
      { key: 'all_reservations', label: 'Bookings List', path: '/reservations/list', icon: 'bi-list-ul', permission: 'reservation.booking.create' },
      { key: 'tape_chart', label: 'Calendar Chart', path: '/reservations/calendar', icon: 'bi-calendar3', permission: 'reservation.booking.create' },
      { key: 'rate_grid', label: 'Rate Grid & Restrictions', path: '/reservations/rates', icon: 'bi-cash-coin', permission: 'reservation.rate.override' },
    ],
  },
  {
    key: 'housekeeping',
    label: 'Housekeeping',
    path: '/housekeeping',
    icon: 'bi-brush',
    permission: 'housekeeping.status.update',
    children: [
      { key: 'room_status', label: 'Unit Cleanliness', path: '/housekeeping/units', icon: 'bi-check2-square', permission: 'housekeeping.status.update' },
      { key: 'attendant_tasks', label: 'Attendant Sheets', path: '/housekeeping/sheets', icon: 'bi-card-checklist', permission: 'housekeeping.task.assign' },
    ],
  },
  {
    key: 'cashiering',
    label: 'Folios & Billing',
    path: '/folios',
    icon: 'bi-receipt-cutoff',
    permission: 'folio.charge.post',
    children: [
      { key: 'active_folios', label: 'Guest Folios', path: '/folios/active', icon: 'bi-receipt', permission: 'folio.charge.post' },
      { key: 'shifts', label: 'Cashier Shifts & Drop', path: '/cashier/shifts', icon: 'bi-wallet2', permission: 'folio.payment.record' },
    ],
  },
  {
    key: 'audit',
    label: 'Night Audit',
    path: '/audit',
    icon: 'bi-moon-stars',
    permission: 'audit.night.run',
    children: [
      { key: 'night_audit_run', label: 'Roll Business Day', path: '/audit/wizard', icon: 'bi-play-circle', permission: 'audit.night.run' },
      { key: 'daily_reports', label: 'Daily Trial Balance', path: '/audit/reports', icon: 'bi-file-earmark-bar-graph', permission: 'audit.report.view' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings & Config',
    path: '/settings',
    icon: 'bi-gear-wide-connected',
    permission: 'config.settings.update',
    children: [
      { key: 'general_settings', label: 'General & Hierarchy', path: '/settings/general', icon: 'bi-sliders', permission: 'config.settings.update' },
      { key: 'status_defs', label: 'Status Definitions', path: '/settings/statuses', icon: 'bi-palette', permission: 'config.status.modify' },
      { key: 'roles_permissions', label: 'Roles & IAM', path: '/settings/roles', icon: 'bi-shield-lock', permission: 'config.roles.manage' },
      { key: 'numbering', label: 'Numbering Sequences', path: '/settings/numbering', icon: 'bi-123', permission: 'config.settings.update' },
    ],
  },
];

@Injectable()
export class UiService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async getStatusDefs(tenantId: string, entity: string = 'unit', branchId?: string): Promise<StatusDef[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id, branch_id, entity, code, label, color_token, icon, sort,
                is_sellable, is_occupied, is_dirty, blocks_booking, system_key
         FROM status_defs
         WHERE tenant_id = $1 AND entity = $2 AND (branch_id = $3 OR branch_id IS NULL)
         ORDER BY sort ASC, created_at ASC`,
        [tenantId, entity, branchId || null],
      );

      // De-duplicate: branch-specific definitions take precedence over tenant definitions
      const byCode = new Map<string, any>();
      for (const row of res.rows) {
        if (!byCode.has(row.code) || row.branch_id !== null) {
          byCode.set(row.code, {
            id: row.id,
            tenantId: row.tenant_id,
            branchId: row.branch_id,
            entity: row.entity,
            code: row.code,
            label: row.label,
            colorToken: row.color_token,
            icon: row.icon,
            sort: row.sort,
            isSellable: row.is_sellable,
            isOccupied: row.is_occupied,
            isDirty: row.is_dirty,
            blocksBooking: row.blocks_booking,
            systemKey: row.system_key,
          });
        }
      }

      return Array.from(byCode.values()).sort((a, b) => a.sort - b.sort);
    });
  }

  async getActions(
    tenantId: string,
    entity: string,
    query: { status?: string; branchId?: string },
    userPermissions: string[],
  ): Promise<ActionDef[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id, branch_id, entity, code, label, icon, group_code,
                permission, visible_when, target, sort, enabled
         FROM action_defs
         WHERE tenant_id = $1 AND entity = $2 AND enabled = true
           AND (branch_id = $3 OR branch_id IS NULL)
         ORDER BY sort ASC`,
        [tenantId, entity, query.branchId || null],
      );

      const hasWildcard = userPermissions.includes('*');

      return res.rows
        .map((row: any) => ({
          id: row.id,
          tenantId: row.tenant_id,
          branchId: row.branch_id,
          entity: row.entity,
          code: row.code,
          label: row.label,
          icon: row.icon,
          groupCode: row.group_code,
          permission: row.permission,
          visibleWhen: row.visible_when || {},
          target: row.target,
          sort: row.sort,
          enabled: row.enabled,
        }))
        .filter((action: any) => {
          // 1. Permission check
          if (!hasWildcard && !userPermissions.includes(action.permission)) {
            return false;
          }

          // 2. State-machine / status visibility
          if (query.status && action.visibleWhen?.statusIn) {
            if (!action.visibleWhen.statusIn.includes(query.status)) {
              return false;
            }
          }

          return true;
        });
    });
  }

  async getCustomFields(tenantId: string, entity: string): Promise<CustomFieldDef[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id, entity, key, label, type, required, options,
                validation, show_in_list, print, sort
         FROM custom_field_defs
         WHERE tenant_id = $1 AND entity = $2
         ORDER BY sort ASC, key ASC`,
        [tenantId, entity],
      );

      return res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        entity: r.entity,
        key: r.key,
        label: r.label,
        type: r.type,
        required: r.required,
        options: r.options || [],
        validation: r.validation || {},
        showInList: r.show_in_list,
        print: r.print,
        sort: r.sort,
      }));
    });
  }

  private mapStatusDef(r: any): StatusDef {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      entity: r.entity,
      code: r.code,
      label: r.label,
      colorToken: r.color_token,
      icon: r.icon,
      sort: r.sort,
      isSellable: r.is_sellable,
      isOccupied: r.is_occupied,
      isDirty: r.is_dirty,
      blocksBooking: r.blocks_booking,
      systemKey: r.system_key,
    };
  }

  private mapActionDef(r: any): ActionDef {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      entity: r.entity,
      code: r.code,
      label: r.label,
      icon: r.icon,
      groupCode: r.group_code,
      permission: r.permission,
      visibleWhen: r.visible_when || {},
      target: r.target,
      sort: r.sort,
      enabled: r.enabled,
    };
  }

  private mapCustomFieldDef(r: any): CustomFieldDef {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      entity: r.entity,
      key: r.key,
      label: r.label,
      type: r.type,
      required: r.required,
      options: r.options || [],
      validation: r.validation || {},
      showInList: r.show_in_list,
      print: r.print,
      sort: r.sort,
    };
  }

  private readonly STATUS_RETURNING = `id, tenant_id, branch_id, entity, code, label,
    color_token, icon, sort, is_sellable, is_occupied, is_dirty, blocks_booking, system_key`;

  private readonly ACTION_RETURNING = `id, tenant_id, branch_id, entity, code, label, icon,
    group_code, permission, visible_when, target, sort, enabled`;

  private readonly CUSTOM_FIELD_RETURNING = `id, tenant_id, entity, key, label, type, required,
    options, validation, show_in_list, print, sort`;

  async createStatusDef(tenantId: string, dto: CreateStatusDefDto): Promise<StatusDef> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const branchId = dto.branchId ?? null;
      const existing = await client.query(
        `SELECT id FROM status_defs
         WHERE tenant_id = $1 AND entity = $2 AND code = $3 AND branch_id IS NOT DISTINCT FROM $4::uuid`,
        [tenantId, dto.entity, dto.code, branchId],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException(`Status '${dto.code}' already exists for entity '${dto.entity}'`);
      }

      const id = uuidv7();
      const res = await client.query(
        `INSERT INTO status_defs (id, tenant_id, branch_id, entity, code, label, color_token, icon,
            sort, is_sellable, is_occupied, is_dirty, blocks_booking, system_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING ${this.STATUS_RETURNING}`,
        [
          id, tenantId, branchId, dto.entity, dto.code, dto.label, dto.colorToken, dto.icon ?? null,
          dto.sort, dto.isSellable, dto.isOccupied, dto.isDirty, dto.blocksBooking, dto.systemKey ?? null,
        ],
      );
      return this.mapStatusDef(res.rows[0]);
    });
  }

  async updateStatusDef(tenantId: string, id: string, dto: UpdateStatusDefDto): Promise<StatusDef> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const sets: string[] = [];
      const params: any[] = [id, tenantId];
      const push = (column: string, value: unknown) => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      };
      if (dto.label !== undefined) push('label', dto.label);
      if (dto.colorToken !== undefined) push('color_token', dto.colorToken);
      if (dto.icon !== undefined) push('icon', dto.icon);
      if (dto.sort !== undefined) push('sort', dto.sort);
      if (dto.isSellable !== undefined) push('is_sellable', dto.isSellable);
      if (dto.isOccupied !== undefined) push('is_occupied', dto.isOccupied);
      if (dto.isDirty !== undefined) push('is_dirty', dto.isDirty);
      if (dto.blocksBooking !== undefined) push('blocks_booking', dto.blocksBooking);
      if (dto.systemKey !== undefined) push('system_key', dto.systemKey);

      const res = await client.query(
        `UPDATE status_defs SET ${sets.join(', ')} WHERE tenant_id = $2 AND id = $1
         RETURNING ${this.STATUS_RETURNING}`,
        params,
      );
      if (res.rows.length === 0) throw new NotFoundException(`Status '${id}' not found`);
      return this.mapStatusDef(res.rows[0]);
    });
  }

  async deleteStatusDef(tenantId: string, id: string): Promise<{ success: true }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const found = await client.query(
        `SELECT entity, code, system_key FROM status_defs WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id],
      );
      if (found.rows.length === 0) throw new NotFoundException(`Status '${id}' not found`);
      const { entity, code, system_key } = found.rows[0];
      if (system_key) {
        throw new BadRequestException('System status definitions cannot be deleted');
      }
      const refs = await client.query(
        `SELECT 1 FROM status_transitions
         WHERE tenant_id = $1 AND entity = $2 AND (from_code = $3 OR to_code = $3) LIMIT 1`,
        [tenantId, entity, code],
      );
      if (refs.rows.length > 0) {
        throw new ConflictException('Status is referenced by transitions and cannot be deleted');
      }
      await client.query(`DELETE FROM status_defs WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      return { success: true as const };
    });
  }

  async createStatusTransition(
    tenantId: string,
    dto: CreateStatusTransitionDto,
  ): Promise<{ id: string; entity: string; fromCode: string; toCode: string; permission: string; requiresReason: boolean }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const existing = await client.query(
        `SELECT id FROM status_transitions
         WHERE tenant_id = $1 AND entity = $2 AND from_code = $3 AND to_code = $4`,
        [tenantId, dto.entity, dto.fromCode, dto.toCode],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException(`Transition ${dto.fromCode} → ${dto.toCode} already exists`);
      }
      const id = uuidv7();
      await client.query(
        `INSERT INTO status_transitions (id, tenant_id, entity, from_code, to_code, permission, requires_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, tenantId, dto.entity, dto.fromCode, dto.toCode, dto.permission, dto.requiresReason],
      );
      return {
        id,
        entity: dto.entity,
        fromCode: dto.fromCode,
        toCode: dto.toCode,
        permission: dto.permission,
        requiresReason: dto.requiresReason,
      };
    });
  }

  async deleteStatusTransition(tenantId: string, id: string): Promise<{ success: true }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `DELETE FROM status_transitions WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [tenantId, id],
      );
      if (res.rows.length === 0) throw new NotFoundException('Transition not found');
      return { success: true as const };
    });
  }

  async createActionDef(tenantId: string, dto: CreateActionDefDto): Promise<ActionDef> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const branchId = dto.branchId ?? null;
      const existing = await client.query(
        `SELECT id FROM action_defs
         WHERE tenant_id = $1 AND entity = $2 AND code = $3 AND branch_id IS NOT DISTINCT FROM $4::uuid`,
        [tenantId, dto.entity, dto.code, branchId],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException(`Action '${dto.code}' already exists for entity '${dto.entity}'`);
      }
      const id = uuidv7();
      const res = await client.query(
        `INSERT INTO action_defs (id, tenant_id, branch_id, entity, code, label, icon, group_code,
            permission, visible_when, target, sort, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING ${this.ACTION_RETURNING}`,
        [
          id, tenantId, branchId, dto.entity, dto.code, dto.label, dto.icon ?? null,
          dto.groupCode ?? null, dto.permission, JSON.stringify(dto.visibleWhen || {}),
          JSON.stringify(dto.target), dto.sort, dto.enabled,
        ],
      );
      return this.mapActionDef(res.rows[0]);
    });
  }

  async updateActionDef(tenantId: string, id: string, dto: UpdateActionDefDto): Promise<ActionDef> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const sets: string[] = [];
      const params: any[] = [id, tenantId];
      const push = (column: string, value: unknown) => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      };
      if (dto.label !== undefined) push('label', dto.label);
      if (dto.icon !== undefined) push('icon', dto.icon);
      if (dto.groupCode !== undefined) push('group_code', dto.groupCode);
      if (dto.permission !== undefined) push('permission', dto.permission);
      if (dto.visibleWhen !== undefined) push('visible_when', JSON.stringify(dto.visibleWhen));
      if (dto.target !== undefined) push('target', JSON.stringify(dto.target));
      if (dto.sort !== undefined) push('sort', dto.sort);
      if (dto.enabled !== undefined) push('enabled', dto.enabled);

      const res = await client.query(
        `UPDATE action_defs SET ${sets.join(', ')} WHERE tenant_id = $2 AND id = $1
         RETURNING ${this.ACTION_RETURNING}`,
        params,
      );
      if (res.rows.length === 0) throw new NotFoundException(`Action '${id}' not found`);
      return this.mapActionDef(res.rows[0]);
    });
  }

  async deleteActionDef(tenantId: string, id: string): Promise<{ success: true }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `DELETE FROM action_defs WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [tenantId, id],
      );
      if (res.rows.length === 0) throw new NotFoundException(`Action '${id}' not found`);
      return { success: true as const };
    });
  }

  async createCustomFieldDef(
    tenantId: string,
    dto: CreateCustomFieldDefDto,
  ): Promise<CustomFieldDef> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const existing = await client.query(
        `SELECT id FROM custom_field_defs WHERE tenant_id = $1 AND entity = $2 AND key = $3`,
        [tenantId, dto.entity, dto.key],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException(`Custom field '${dto.key}' already exists for entity '${dto.entity}'`);
      }
      const id = uuidv7();
      const res = await client.query(
        `INSERT INTO custom_field_defs (id, tenant_id, entity, key, label, type, required, options,
            validation, show_in_list, print, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING ${this.CUSTOM_FIELD_RETURNING}`,
        [
          id, tenantId, dto.entity, dto.key, dto.label, dto.type, dto.required,
          JSON.stringify(dto.options), JSON.stringify(dto.validation), dto.showInList, dto.print, dto.sort,
        ],
      );
      return this.mapCustomFieldDef(res.rows[0]);
    });
  }

  async updateCustomFieldDef(
    tenantId: string,
    id: string,
    dto: UpdateCustomFieldDefDto,
  ): Promise<CustomFieldDef> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const sets: string[] = [];
      const params: any[] = [id, tenantId];
      const push = (column: string, value: unknown) => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      };
      if (dto.label !== undefined) push('label', dto.label);
      if (dto.type !== undefined) push('type', dto.type);
      if (dto.required !== undefined) push('required', dto.required);
      if (dto.options !== undefined) push('options', JSON.stringify(dto.options));
      if (dto.validation !== undefined) push('validation', JSON.stringify(dto.validation));
      if (dto.showInList !== undefined) push('show_in_list', dto.showInList);
      if (dto.print !== undefined) push('print', dto.print);
      if (dto.sort !== undefined) push('sort', dto.sort);

      const res = await client.query(
        `UPDATE custom_field_defs SET ${sets.join(', ')} WHERE tenant_id = $2 AND id = $1
         RETURNING ${this.CUSTOM_FIELD_RETURNING}`,
        params,
      );
      if (res.rows.length === 0) throw new NotFoundException(`Custom field '${id}' not found`);
      return this.mapCustomFieldDef(res.rows[0]);
    });
  }

  async deleteCustomFieldDef(tenantId: string, id: string): Promise<{ success: true }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `DELETE FROM custom_field_defs WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [tenantId, id],
      );
      if (res.rows.length === 0) throw new NotFoundException(`Custom field '${id}' not found`);
      return { success: true as const };
    });
  }

  /**
   * Validate an entity's `attrs` payload against its configured custom-field
   * definitions. Returns the parsed (typed) attrs or the list of issues.
   */
  async validateEntityAttrs(
    tenantId: string,
    entity: string,
    attrs: Record<string, unknown> | null | undefined,
  ) {
    const defs = await this.getCustomFields(tenantId, entity);
    if (defs.length === 0) {
      return { success: true as const, data: attrs ?? {} };
    }
    return validateCustomFieldValues(defs, attrs);
  }

  async getNavigation(
    tenantId: string,
    userPermissions: string[],
    userRoles: string[] = [],
  ): Promise<{ items: NavigationItem[] }> {
    const tree = await this.resolveNavigationTree(tenantId, userRoles);
    return { items: filterNavigationByPermission(tree, userPermissions) };
  }

  async listNavigationConfigs(tenantId: string): Promise<NavigationConfigDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id, role_code, items, updated_at
         FROM navigation_configs
         WHERE tenant_id = $1
         ORDER BY role_code ASC`,
        [tenantId],
      );
      return res.rows.map(mapNavigationConfig);
    });
  }

  async upsertNavigationConfig(
    tenantId: string,
    dto: UpdateNavigationConfigDto,
    userId?: string,
  ): Promise<NavigationConfigDto> {
    const roleCode = dto.roleCode && dto.roleCode.length > 0 ? dto.roleCode : '';

    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `INSERT INTO navigation_configs (id, tenant_id, role_code, items, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, now(), now())
         ON CONFLICT (tenant_id, role_code) DO UPDATE
           SET items = EXCLUDED.items,
               updated_by = EXCLUDED.updated_by,
               updated_at = now()
         RETURNING id, tenant_id, role_code, items, updated_at`,
        [uuidv7(), tenantId, roleCode, JSON.stringify(dto.items), userId || null],
      );
      return mapNavigationConfig(res.rows[0]);
    });
  }

  async deleteNavigationConfig(tenantId: string, roleCode: string | null): Promise<{ deleted: boolean }> {
    const key = roleCode && roleCode.length > 0 ? roleCode : '';
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `DELETE FROM navigation_configs WHERE tenant_id = $1 AND role_code = $2`,
        [tenantId, key],
      );
      return { deleted: (res.rowCount ?? 0) > 0 };
    });
  }

  private async resolveNavigationTree(tenantId: string, userRoles: string[]): Promise<NavigationItem[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT role_code, items FROM navigation_configs WHERE tenant_id = $1`,
        [tenantId],
      );

      const byRole = new Map<string, NavigationItem[]>();
      for (const row of res.rows) {
        if (Array.isArray(row.items)) {
          byRole.set(row.role_code, row.items as NavigationItem[]);
        }
      }

      for (const role of userRoles) {
        const cfg = byRole.get(role);
        if (cfg && cfg.length > 0) {
          return cfg;
        }
      }

      const tenantDefault = byRole.get('');
      if (tenantDefault && tenantDefault.length > 0) {
        return tenantDefault;
      }

      return DEFAULT_NAVIGATION_TREE;
    });
  }
}

function filterNavigationByPermission(
  tree: NavigationItem[],
  userPermissions: string[],
): NavigationItem[] {
  const hasWildcard = userPermissions.includes('*');

  function filterItem(item: NavigationItem): NavigationItem | null {
    if (item.permission && !hasWildcard && !userPermissions.includes(item.permission)) {
      return null;
    }

    if (item.children && item.children.length > 0) {
      const filteredChildren = item.children
        .map(filterItem)
        .filter((c): c is NavigationItem => c !== null);

      if (filteredChildren.length === 0) {
        return null; // Don't show empty parents if user has no child access
      }

      return { ...item, children: filteredChildren };
    }

    return item;
  }

  return tree.map(filterItem).filter((item): item is NavigationItem => item !== null);
}

function mapNavigationConfig(row: any): NavigationConfigDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    roleCode: row.role_code && row.role_code.length > 0 ? row.role_code : null,
    items: Array.isArray(row.items) ? row.items : [],
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}
