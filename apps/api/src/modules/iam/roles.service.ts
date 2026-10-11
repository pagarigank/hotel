import { Injectable, Inject, ConflictException } from '@nestjs/common';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';
import { DatabaseService } from '../../kernel/database/database.service.js';
import type { CreateRoleDto, RoleDto } from '@innkeeper/contracts';

export const SYSTEM_PERMISSIONS = [
  'frontdesk.stay.checkin',
  'frontdesk.stay.checkout',
  'frontdesk.stay.move',
  'frontdesk.stay.extend',
  'frontdesk.keycard.issue',
  'reservation.booking.create',
  'reservation.booking.modify',
  'reservation.booking.cancel',
  'reservation.rate.override',
  'housekeeping.status.update',
  'housekeeping.task.assign',
  'housekeeping.linen.track',
  'folio.charge.post',
  'folio.charge.void',
  'folio.discount.apply',
  'folio.payment.record',
  'folio.refund.issue',
  'folio.invoice.generate',
  'pos.order.create',
  'pos.order.settle',
  'pos.item.void',
  'audit.night.run',
  'audit.report.view',
  'audit.log.view',
  'accounting.voucher.create',
  'accounting.voucher.post',
  'accounting.period.close',
  'config.settings.update',
  'config.status.modify',
  'config.action.modify',
  'config.roles.manage',
  'security.override',
  '*',
];

@Injectable()
export class RolesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async getRoles(tenantId: string): Promise<RoleDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT id, tenant_id, code, name, permissions, limits, created_at
         FROM roles
         WHERE tenant_id = $1
         ORDER BY code`,
        [tenantId],
      );

      return res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        code: r.code,
        name: r.name,
        permissions: r.permissions || [],
        limits: r.limits || {},
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
      }));
    });
  }

  async createRole(tenantId: string, dto: CreateRoleDto): Promise<RoleDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      // Check if code exists
      const existing = await client.query(
        `SELECT id FROM roles WHERE tenant_id = $1 AND code = $2`,
        [tenantId, dto.code],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException(`Role with code '${dto.code}' already exists`);
      }

      const id = uuidv7();
      const res = await client.query(
        `INSERT INTO roles (id, tenant_id, code, name, permissions, limits)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, tenant_id, code, name, permissions, limits, created_at`,
        [id, tenantId, dto.code, dto.name, dto.permissions, JSON.stringify(dto.limits || {})],
      );

      const r = res.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        code: r.code,
        name: r.name,
        permissions: r.permissions,
        limits: r.limits,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  getPermissions(): { permissions: string[] } {
    return { permissions: SYSTEM_PERMISSIONS };
  }
}
