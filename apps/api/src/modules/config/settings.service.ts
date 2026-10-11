import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { OutboxService } from '../../kernel/outbox/outbox.service.js';
import { AuditService } from '../../kernel/audit/audit.service.js';
import type { SettingDto, UpdateSettingDto } from '@innkeeper/contracts';

interface CacheEntry {
  value: unknown;
  effectiveScope: string;
  expiresAt: number;
}

@Injectable()
export class SettingsService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 60_000; // 60 seconds

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private makeCacheKey(
    tenantId: string,
    key: string,
    scopes: { branchId?: string; outletId?: string; userId?: string },
  ): string {
    return `${tenantId}:${scopes.userId || ''}:${scopes.outletId || ''}:${scopes.branchId || ''}:${key}`;
  }

  clearCacheForTenantKey(tenantId: string, key?: string) {
    if (!key) {
      for (const k of this.cache.keys()) {
        if (k.startsWith(`${tenantId}:`)) this.cache.delete(k);
      }
      return;
    }
    for (const k of this.cache.keys()) {
      if (k.startsWith(`${tenantId}:`) && k.endsWith(`:${key}`)) {
        this.cache.delete(k);
      }
    }
  }

  async resolveSetting(
    tenantId: string,
    key: string,
    scopes: { branchId?: string; outletId?: string; userId?: string } = {},
  ): Promise<{ key: string; value: unknown; effectiveScope: string }> {
    const cacheKey = this.makeCacheKey(tenantId, key, scopes);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { key, value: cached.value, effectiveScope: cached.effectiveScope };
    }

    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const res = await client.query(
        `SELECT scope_type, scope_id, value
         FROM settings
         WHERE tenant_id = $1 AND key = $2`,
        [tenantId, key],
      );

      // Hierarchical resolution: user -> outlet -> branch -> tenant -> default
      let effectiveValue: unknown = undefined;
      let effectiveScope = 'default';

      const userMatch = scopes.userId
        ? res.rows.find((r: any) => r.scope_type === 'user' && r.scope_id === scopes.userId)
        : null;
      const outletMatch = scopes.outletId
        ? res.rows.find((r: any) => r.scope_type === 'outlet' && r.scope_id === scopes.outletId)
        : null;
      const branchMatch = scopes.branchId
        ? res.rows.find((r: any) => r.scope_type === 'branch' && r.scope_id === scopes.branchId)
        : null;
      const tenantMatch = res.rows.find((r: any) => r.scope_type === 'tenant');

      if (userMatch) {
        effectiveValue = userMatch.value;
        effectiveScope = 'user';
      } else if (outletMatch) {
        effectiveValue = outletMatch.value;
        effectiveScope = 'outlet';
      } else if (branchMatch) {
        effectiveValue = branchMatch.value;
        effectiveScope = 'branch';
      } else if (tenantMatch) {
        effectiveValue = tenantMatch.value;
        effectiveScope = 'tenant';
      }

      this.cache.set(cacheKey, {
        value: effectiveValue,
        effectiveScope,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });

      return { key, value: effectiveValue, effectiveScope };
    });
  }

  async getSettings(
    tenantId: string,
    filter?: { scopeType?: string; scopeId?: string },
  ): Promise<SettingDto[]> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      let query = `SELECT id, tenant_id, scope_type, scope_id, key, value, version FROM settings WHERE tenant_id = $1`;
      const params: any[] = [tenantId];

      if (filter?.scopeType) {
        params.push(filter.scopeType);
        query += ` AND scope_type = $${params.length}`;
      }
      if (filter?.scopeId) {
        params.push(filter.scopeId);
        query += ` AND scope_id = $${params.length}`;
      }

      query += ` ORDER BY key, scope_type`;

      const res = await client.query(query, params);
      return res.rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        scopeType: r.scope_type,
        scopeId: r.scope_id,
        key: r.key,
        value: r.value,
        version: r.version,
      }));
    });
  }

  async updateSetting(
    tenantId: string,
    key: string,
    dto: UpdateSettingDto,
    userId?: string,
  ): Promise<SettingDto> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      const scopeType = dto.scopeType || 'tenant';
      const scopeId = dto.scopeId || null;

      // Find existing
      const existing = await client.query(
        `SELECT id, version FROM settings
         WHERE tenant_id = $1 AND scope_type = $2 AND (scope_id = $3 OR (scope_id IS NULL AND $3 IS NULL)) AND key = $4`,
        [tenantId, scopeType, scopeId, key],
      );

      let settingId: string;
      let newVersion = 1;

      if (existing.rows.length > 0) {
        settingId = existing.rows[0].id;
        newVersion = existing.rows[0].version + 1;
        await client.query(
          `UPDATE settings
           SET value = $1, version = $2, updated_by = $3, updated_at = now()
           WHERE id = $4 AND tenant_id = $5`,
          [JSON.stringify(dto.value), newVersion, userId || null, settingId, tenantId],
        );
      } else {
        settingId = uuidv7();
        await client.query(
          `INSERT INTO settings (id, tenant_id, scope_type, scope_id, key, value, version, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [settingId, tenantId, scopeType, scopeId, key, JSON.stringify(dto.value), 1, userId || null],
        );
      }

      // Publish domain outbox event: config.changed
      await this.outbox.emit(
        client,
        tenantId,
        {
          aggregateType: 'setting',
          aggregateId: settingId,
          eventType: 'config.changed',
          payload: {
            key,
            scopeType,
            scopeId,
            value: dto.value,
            version: newVersion,
          },
        },
      );

      // Audit log
      await this.audit.log(
        {
          action: 'config.setting.update',
          entityType: 'setting',
          entityId: settingId,
          userId,
          tenantId,
          afterDiff: { key, scopeType, scopeId, value: dto.value },
        },
        client,
      );

      // Invalidate cache
      this.clearCacheForTenantKey(tenantId, key);

      return {
        id: settingId,
        tenantId,
        scopeType: scopeType as any,
        scopeId,
        key,
        value: dto.value,
        version: newVersion,
      };
    });
  }
}
