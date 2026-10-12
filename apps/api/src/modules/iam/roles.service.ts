import { Injectable, Inject, ConflictException, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';
import { DatabaseService } from '../../kernel/database/database.service.js';
import type {
  CreateRoleDto,
  UpdateRoleDto,
  RoleDto,
  AssignRoleDto,
  MembershipDto,
  MembershipRoleDto,
} from '@innkeeper/contracts';

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
  'config.customfield.modify',
  'config.navigation.modify',
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

  async updateRole(tenantId: string, id: string, dto: UpdateRoleDto): Promise<RoleDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const existing = await client.query(
        `SELECT id, code FROM roles WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Role '${id}' not found`);
      }

      if (dto.code && dto.code !== existing.rows[0].code) {
        const dup = await client.query(
          `SELECT id FROM roles WHERE tenant_id = $1 AND code = $2 AND id <> $3`,
          [tenantId, dto.code, id],
        );
        if (dup.rows.length > 0) {
          throw new ConflictException(`Role with code '${dto.code}' already exists`);
        }
      }

      const sets: string[] = [];
      const params: any[] = [id, tenantId];
      if (dto.code !== undefined) {
        params.push(dto.code);
        sets.push(`code = $${params.length}`);
      }
      if (dto.name !== undefined) {
        params.push(dto.name);
        sets.push(`name = $${params.length}`);
      }
      if (dto.permissions !== undefined) {
        params.push(dto.permissions);
        sets.push(`permissions = $${params.length}`);
      }
      if (dto.limits !== undefined) {
        params.push(JSON.stringify(dto.limits));
        sets.push(`limits = $${params.length}`);
      }

      const res = await client.query(
        `UPDATE roles SET ${sets.join(', ')}
         WHERE tenant_id = $2 AND id = $1
         RETURNING id, tenant_id, code, name, permissions, limits, created_at`,
        params,
      );

      const r = res.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        code: r.code,
        name: r.name,
        permissions: r.permissions || [],
        limits: r.limits || {},
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
      };
    });
  }

  async deleteRole(tenantId: string, id: string): Promise<{ success: true }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const assigned = await client.query(
        `SELECT 1 FROM membership_roles WHERE tenant_id = $1 AND role_id = $2 LIMIT 1`,
        [tenantId, id],
      );
      if (assigned.rows.length > 0) {
        throw new ConflictException(
          'Role is assigned to one or more memberships and cannot be deleted',
        );
      }

      const res = await client.query(
        `DELETE FROM roles WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [tenantId, id],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException(`Role '${id}' not found`);
      }
      return { success: true as const };
    });
  }

  async getMemberships(tenantId: string): Promise<MembershipDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT m.id, m.tenant_id, m.user_id, m.active, u.email, u.name,
                mr.id AS membership_role_id, mr.role_id, mr.branch_scope,
                r.code AS role_code, r.name AS role_name
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN membership_roles mr ON mr.membership_id = m.id
         LEFT JOIN roles r ON r.id = mr.role_id
         WHERE m.tenant_id = $1
         ORDER BY u.name`,
        [tenantId],
      );

      const byId = new Map<string, MembershipDto>();
      for (const row of res.rows) {
        let membership = byId.get(row.id);
        if (!membership) {
          membership = {
            id: row.id,
            tenantId: row.tenant_id,
            userId: row.user_id,
            email: row.email,
            name: row.name,
            active: row.active,
            roles: [],
          };
          byId.set(row.id, membership);
        }
        if (row.membership_role_id && row.role_id) {
          membership.roles.push({
            membershipRoleId: row.membership_role_id,
            roleId: row.role_id,
            roleCode: row.role_code,
            roleName: row.role_name,
            branchScope: row.branch_scope ?? null,
          });
        }
      }

      return Array.from(byId.values());
    });
  }

  async assignRoleToMembership(
    tenantId: string,
    membershipId: string,
    dto: AssignRoleDto,
  ): Promise<MembershipRoleDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const membership = await client.query(
        `SELECT id FROM memberships WHERE tenant_id = $1 AND id = $2`,
        [tenantId, membershipId],
      );
      if (membership.rows.length === 0) {
        throw new NotFoundException(`Membership '${membershipId}' not found`);
      }

      const role = await client.query(
        `SELECT id, code, name FROM roles WHERE tenant_id = $1 AND id = $2`,
        [tenantId, dto.roleId],
      );
      if (role.rows.length === 0) {
        throw new NotFoundException(`Role '${dto.roleId}' not found`);
      }

      const existing = await client.query(
        `SELECT id FROM membership_roles
         WHERE tenant_id = $1 AND membership_id = $2 AND role_id = $3`,
        [tenantId, membershipId, dto.roleId],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException('Role is already assigned to this membership');
      }

      const branchScope = dto.branchScope ?? null;
      const id = uuidv7();
      await client.query(
        `INSERT INTO membership_roles (id, tenant_id, membership_id, role_id, branch_scope)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, tenantId, membershipId, dto.roleId, branchScope],
      );

      return {
        membershipRoleId: id,
        roleId: role.rows[0].id,
        roleCode: role.rows[0].code,
        roleName: role.rows[0].name,
        branchScope,
      };
    });
  }

  async removeRoleFromMembership(
    tenantId: string,
    membershipId: string,
    roleId: string,
  ): Promise<{ success: true }> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `DELETE FROM membership_roles
         WHERE tenant_id = $1 AND membership_id = $2 AND role_id = $3
         RETURNING id`,
        [tenantId, membershipId, roleId],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException('Role assignment not found');
      }
      return { success: true as const };
    });
  }

  getPermissions(): { permissions: string[] } {
    return { permissions: SYSTEM_PERMISSIONS };
  }
}
