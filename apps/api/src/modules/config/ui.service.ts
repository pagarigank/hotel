import { Injectable, Inject } from '@nestjs/common';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';
import { DatabaseService } from '../../kernel/database/database.service.js';
import type { StatusDef, ActionDef, CustomFieldDef } from '@innkeeper/config-schemas';
import type { NavigationItem } from '@innkeeper/contracts';

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

  getNavigation(userPermissions: string[]): { items: NavigationItem[] } {
    const hasWildcard = userPermissions.includes('*');

    function filterItem(item: NavigationItem): NavigationItem | null {
      if (item.permission && !hasWildcard && !userPermissions.includes(item.permission)) {
        return null;
      }

      if (item.children && item.children.length > 0) {
        const filteredChildren = item.children
          .map(filterItem)
          .filter((c): c is NavigationItem => c !== null);

        if (filteredChildren.length === 0 && item.children.length > 0) {
          return null; // Don't show empty parents if user has no child access
        }

        return { ...item, children: filteredChildren };
      }

      return item;
    }

    const items = DEFAULT_NAVIGATION_TREE.map(filterItem).filter(
      (item): item is NavigationItem => item !== null,
    );

    return { items };
  }
}
