import { Injectable, Inject, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { AuditService } from '../../kernel/audit/audit.service.js';
import type {
  LoginRequest,
  AuthResponse,
  ManagerOverrideRequest,
  ManagerOverrideResponse,
} from '@innkeeper/contracts';
import { ACCESS_TOKEN_EXPIRY, getJwtSecret } from './jwt.constants.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private signAccessToken(payload: {
    sub: string;
    email: string;
    tid: string;
    bids: string[];
    roles: string[];
    permissions: string[];
  }): string {
    return jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });
  }

  async login(
    dto: LoginRequest,
    userAgent?: string,
    ipAddress?: string,
    requestedTenantId?: string,
  ): Promise<AuthResponse> {
    // 1. Look up user by email (global users table, platform query)
    const userRes = await this.db.getPool().query(
      `SELECT id, email, password_hash, name, active FROM users WHERE email = $1`,
      [dto.email.toLowerCase().trim()],
    );

    if (userRes.rows.length === 0) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = userRes.rows[0];
    if (!user.active) {
      throw new UnauthorizedException('User account is deactivated');
    }

    // 2. Verify password with bcryptjs
    const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Find tenant memberships for user via security-definer helper
    const membershipsRes = await this.db.getPool().query(
      `SELECT tenant_id, name, slug, plan, active FROM app.get_user_tenants($1)`,
      [user.id],
    );

    if (membershipsRes.rows.length === 0) {
      throw new ForbiddenException('User has no active tenant memberships');
    }

    // Pick requested tenant or default to the first active tenant membership
    let tenantRow = membershipsRes.rows[0];
    if (requestedTenantId) {
      const match = membershipsRes.rows.find((r: any) => r.tenant_id === requestedTenantId);
      if (match) {
        tenantRow = match;
      }
    }
    const tenantId = tenantRow.tenant_id;

    // 4. In tenant-isolated transaction, fetch roles, branch scopes, branches, and issue session
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      // Query branches
      const branchRes = await client.query(
        `SELECT id, code, name, timezone, base_currency, business_date, active
         FROM branches WHERE active = true ORDER BY code`,
      );
      const branches = branchRes.rows.map((b: any) => ({
        id: b.id,
        tenantId,
        code: b.code,
        name: b.name,
        timezone: b.timezone,
        baseCurrency: b.base_currency,
        businessDate: b.business_date,
        active: b.active,
      }));

      // Query roles and permissions
      const rolesRes = await client.query(
        `SELECT r.code, r.name, r.permissions, mr.branch_scope
         FROM membership_roles mr
         JOIN memberships m ON m.id = mr.membership_id
         JOIN roles r ON r.id = mr.role_id
         WHERE m.user_id = $1 AND m.tenant_id = $2`,
        [user.id, tenantId],
      );

      const roles: string[] = [];
      const permissionsSet = new Set<string>();
      let hasGlobalBranchScope = false;
      const permittedBranchIdsSet = new Set<string>();

      for (const row of rolesRes.rows) {
        roles.push(row.code);
        if (Array.isArray(row.permissions)) {
          for (const perm of row.permissions) {
            permissionsSet.add(perm);
          }
        }
        if (row.branch_scope === null) {
          hasGlobalBranchScope = true;
        } else if (Array.isArray(row.branch_scope)) {
          for (const bid of row.branch_scope) {
            permittedBranchIdsSet.add(bid);
          }
        }
      }

      const permissions = Array.from(permissionsSet);
      const permittedBranchIds = hasGlobalBranchScope
        ? branches.map((b: any) => b.id)
        : Array.from(permittedBranchIdsSet);

      const permittedBranches = branches.filter((b: any) => permittedBranchIds.includes(b.id));

      // Issue rotating refresh token
      const refreshToken = uuidv7() + '-' + uuidv7();
      const refreshTokenHash = this.hashRefreshToken(refreshToken);
      const sessionId = uuidv7();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await client.query(
        `INSERT INTO sessions (id, tenant_id, user_id, refresh_token_hash, user_agent, ip_address, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sessionId, tenantId, user.id, refreshTokenHash, userAgent || null, ipAddress || null, expiresAt],
      );

      // Generate access token
      const accessToken = this.signAccessToken({
        sub: user.id,
        email: user.email,
        tid: tenantId,
        bids: permittedBranchIds,
        roles,
        permissions,
      });

      // Audit log
      await this.audit.log(
        {
          action: 'auth.login',
          entityType: 'session',
          entityId: sessionId,
          userId: user.id,
          tenantId,
          userAgent,
          ipAddress,
        },
        client,
      );

      return {
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRY,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        tenant: {
          id: tenantRow.tenant_id,
          slug: tenantRow.slug,
          name: tenantRow.name,
          plan: tenantRow.plan,
          active: tenantRow.active,
          createdAt: new Date().toISOString(),
        },
        permittedBranches,
        roles,
        permissions,
      };
    });
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const tokenHash = this.hashRefreshToken(refreshToken);

    // Look up session via security-definer helper
    const sessionRes = await this.db.getPool().query(
      `SELECT id, tenant_id, user_id, expires_at, email, name, active
       FROM app.get_session_by_token($1)`,
      [tokenHash],
    );

    if (sessionRes.rows.length === 0) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = sessionRes.rows[0];
    if (new Date(session.expires_at) < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }
    if (!session.active) {
      throw new UnauthorizedException('User account is inactive');
    }

    const targetTenantId = session.tenant_id;

    return this.db.transaction(targetTenantId, async (client: pg.PoolClient) => {
      // 1. Invalidate old session (token rotation)
      await client.query(`DELETE FROM sessions WHERE id = $1`, [session.id]);

      // 2. Re-fetch permissions & branches
      const rolesRes = await client.query(
        `SELECT r.code, r.permissions, mr.branch_scope
         FROM membership_roles mr
         JOIN memberships m ON m.id = mr.membership_id
         JOIN roles r ON r.id = mr.role_id
         WHERE m.user_id = $1 AND m.tenant_id = $2`,
        [session.user_id, targetTenantId],
      );

      const roles: string[] = [];
      const permissionsSet = new Set<string>();
      let hasGlobalBranchScope = false;
      const permittedBranchIdsSet = new Set<string>();

      for (const row of rolesRes.rows) {
        roles.push(row.code);
        if (Array.isArray(row.permissions)) {
          for (const perm of row.permissions) permissionsSet.add(perm);
        }
        if (row.branch_scope === null) {
          hasGlobalBranchScope = true;
        } else if (Array.isArray(row.branch_scope)) {
          for (const bid of row.branch_scope) permittedBranchIdsSet.add(bid);
        }
      }

      const branchRes = await client.query(`SELECT id FROM branches WHERE active = true`);
      const allBranchIds = branchRes.rows.map((b: any) => b.id);
      const permittedBranchIds = hasGlobalBranchScope ? allBranchIds : Array.from(permittedBranchIdsSet);

      // 3. Issue new rotating refresh token
      const newRefreshToken = uuidv7() + '-' + uuidv7();
      const newHash = this.hashRefreshToken(newRefreshToken);
      const newSessionId = uuidv7();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await client.query(
        `INSERT INTO sessions (id, tenant_id, user_id, refresh_token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [newSessionId, targetTenantId, session.user_id, newHash, expiresAt],
      );

      const accessToken = this.signAccessToken({
        sub: session.user_id,
        email: session.email,
        tid: targetTenantId,
        bids: permittedBranchIds,
        roles,
        permissions: Array.from(permissionsSet),
      });

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRY,
      };
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    await this.db.getPool().query(`SELECT app.delete_session_by_token($1)`, [tokenHash]);
  }

  async me(userId: string, tenantId: string): Promise<any> {
    const userRes = await this.db.getPool().query(
      `SELECT id, email, name FROM users WHERE id = $1`,
      [userId],
    );
    if (userRes.rows.length === 0) {
      throw new UnauthorizedException('User not found');
    }
    const user = userRes.rows[0];

    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const tenantRes = await client.query(`SELECT id, slug, name, plan, active FROM tenants WHERE id = $1`, [tenantId]);
      const branchesRes = await client.query(`SELECT id, code, name, timezone, base_currency, business_date FROM branches WHERE active = true`);
      const rolesRes = await client.query(
        `SELECT r.code, r.name, r.permissions
         FROM membership_roles mr
         JOIN memberships m ON m.id = mr.membership_id
         JOIN roles r ON r.id = mr.role_id
         WHERE m.user_id = $1 AND m.tenant_id = $2`,
        [userId, tenantId],
      );

      const roles = rolesRes.rows.map((r: any) => r.code);
      const permissions = Array.from(new Set(rolesRes.rows.flatMap((r: any) => r.permissions || [])));

      return {
        user,
        tenant: tenantRes.rows[0],
        branches: branchesRes.rows,
        roles,
        permissions,
      };
    });
  }

  async managerOverride(
    dto: ManagerOverrideRequest,
    tenantId: string,
    currentUserId: string,
  ): Promise<ManagerOverrideResponse> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      // 1. Look up manager
      const managerRes = await client.query(
        `SELECT u.id, u.email, u.name, u.active
         FROM users u
         JOIN memberships m ON m.user_id = u.id
         WHERE u.email = $1 AND m.tenant_id = $2 AND m.active = true`,
        [dto.managerEmail.toLowerCase().trim(), tenantId],
      );

      if (managerRes.rows.length === 0) {
        throw new UnauthorizedException('Manager not found in this tenant');
      }

      const manager = managerRes.rows[0];

      // 2. Verify manager roles / permissions
      const rolesRes = await client.query(
        `SELECT r.code, r.permissions, r.limits
         FROM membership_roles mr
         JOIN memberships m ON m.id = mr.membership_id
         JOIN roles r ON r.id = mr.role_id
         WHERE m.user_id = $1 AND m.tenant_id = $2`,
        [manager.id, tenantId],
      );

      const hasManagerRole = rolesRes.rows.some(
        (r: any) =>
          r.code === 'admin' ||
          r.code === 'manager' ||
          (Array.isArray(r.permissions) && (r.permissions.includes('*') || r.permissions.includes('security.override'))),
      );

      if (!hasManagerRole) {
        throw new ForbiddenException('User does not have manager authorization privileges');
      }

      // 3. Verify Manager PIN from settings or default '1234'
      const pinSettingRes = await client.query(
        `SELECT value FROM settings WHERE tenant_id = $1 AND key = 'security.manager_pin' LIMIT 1`,
        [tenantId],
      );

      let expectedPin = '1234';
      if (pinSettingRes.rows.length > 0) {
        const val = pinSettingRes.rows[0].value;
        expectedPin = typeof val === 'string' ? val : String(val);
      }

      if (dto.managerPin !== expectedPin) {
        throw new UnauthorizedException('Invalid manager override PIN');
      }

      // 4. Verify limits if discount or void amount is provided
      for (const r of rolesRes.rows) {
        const limits = r.limits || {};
        if (dto.discountPct !== undefined && limits.max_discount_pct !== undefined) {
          if (dto.discountPct > limits.max_discount_pct && r.code !== 'admin') {
            throw new ForbiddenException(`Discount exceeds manager limit of ${limits.max_discount_pct}%`);
          }
        }
        if (dto.voidAmount !== undefined && limits.max_void_amount !== undefined) {
          if (dto.voidAmount > limits.max_void_amount && r.code !== 'admin') {
            throw new ForbiddenException(`Void amount exceeds manager limit of ${limits.max_void_amount}`);
          }
        }
      }

      // 5. High-priority audit record
      await this.audit.log(
        {
          action: 'security.manager_override',
          entityType: 'override',
          entityId: manager.id,
          userId: currentUserId,
          tenantId,
          reason: dto.reason,
          afterDiff: {
            managerEmail: dto.managerEmail,
            action: dto.action,
            discountPct: dto.discountPct,
            voidAmount: dto.voidAmount,
          },
        },
        client,
      );

      // 6. Generate signed short-lived override token (valid 5 minutes)
      const overrideToken = jwt.sign(
        {
          type: 'manager_override',
          managerId: manager.id,
          managerName: manager.name,
          reason: dto.reason,
          action: dto.action,
          tid: tenantId,
        },
        getJwtSecret(),
        { expiresIn: 300 },
      );

      return {
        approved: true,
        managerId: manager.id,
        managerName: manager.name,
        reason: dto.reason,
        overrideToken,
      };
    });
  }
}
