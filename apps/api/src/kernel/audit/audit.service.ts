import { Injectable, Inject } from '@nestjs/common';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';
import { DatabaseService } from '../database/database.service.js';
import { RequestContext } from '../context/request-context.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  tenantId?: string;
  branchId?: string;
  userId?: string;
  beforeDiff?: any;
  afterDiff?: any;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async log(entry: AuditEntry, client?: pg.PoolClient): Promise<string> {
    const ctx = RequestContext.current();
    const id = uuidv7();
    const tenantId = entry.tenantId || ctx?.tenantId;
    if (!tenantId) {
      console.warn('[AuditService] Skipping audit log without tenantId');
      return '';
    }

    const branchId = entry.branchId || ctx?.branchId;
    const userId = entry.userId || ctx?.userId;
    const correlationId = ctx?.correlationId || 'n/a';

    const sql = `
      INSERT INTO audit_log (
        id, tenant_id, branch_id, user_id, action, entity_type, entity_id,
        before_diff, after_diff, ip_address, user_agent, correlation_id, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;
    const params = [
      id,
      tenantId,
      branchId || null,
      userId || null,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.beforeDiff ? JSON.stringify(entry.beforeDiff) : null,
      entry.afterDiff ? JSON.stringify(entry.afterDiff) : null,
      entry.ipAddress || null,
      entry.userAgent || null,
      correlationId,
      entry.reason || null,
    ];

    if (client) {
      await client.query(sql, params);
    } else {
      await this.db.getPool().query(sql, params);
    }
    return id;
  }
}
