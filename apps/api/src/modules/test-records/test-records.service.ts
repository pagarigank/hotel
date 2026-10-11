import { Injectable, HttpStatus, Inject } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { RequestContext } from '../../kernel/context/request-context.js';
import { OutboxService } from '../../kernel/outbox/outbox.service.js';
import { AuditService } from '../../kernel/audit/audit.service.js';
import { ProblemDetailsException } from '../../kernel/errors/problem-details.exception.js';
import type { CreateTestTenantRecordDto, TestTenantRecordDto } from '@innkeeper/contracts';

@Injectable()
export class TestRecordsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(dto: CreateTestTenantRecordDto): Promise<TestTenantRecordDto> {
    const tenantId = RequestContext.getTenantId();
    const branchId = dto.branchId || RequestContext.current()?.branchId;
    const id = uuidv7();

    return this.db.withTenantTransaction(tenantId, branchId ? [branchId] : undefined, async (client) => {
      const res = await client.query(
        `INSERT INTO test_tenant_records (id, tenant_id, branch_id, title, content)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, tenant_id, branch_id, title, content, version, created_at, updated_at`,
        [id, tenantId, branchId || null, dto.title, dto.content || '']
      );

      const record = res.rows[0];

      // Emit outbox domain event
      await this.outbox.emit(client, tenantId, {
        aggregateType: 'test_record',
        aggregateId: id,
        eventType: 'test_record.created',
        payload: { id, title: dto.title, tenantId },
      });

      // Emit audit log
      await this.audit.log(
        {
          action: 'test_record.create',
          entityType: 'test_record',
          entityId: id,
          afterDiff: { title: dto.title },
        },
        client
      );

      return {
        id: record.id,
        tenantId: record.tenant_id,
        branchId: record.branch_id,
        title: record.title,
        content: record.content,
        version: record.version,
        createdAt: record.created_at.toISOString(),
        updatedAt: record.updated_at ? record.updated_at.toISOString() : null,
      };
    });
  }

  async findAll(): Promise<TestTenantRecordDto[]> {
    const tenantId = RequestContext.getTenantId();
    const branchId = RequestContext.current()?.branchId;

    return this.db.withTenantTransaction(tenantId, branchId ? [branchId] : undefined, async (client) => {
      const res = await client.query(
        `SELECT id, tenant_id, branch_id, title, content, version, created_at, updated_at
         FROM test_tenant_records
         ORDER BY created_at DESC`
      );

      return res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        title: r.title,
        content: r.content,
        version: r.version,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at ? r.updated_at.toISOString() : null,
      }));
    });
  }

  async findOne(id: string): Promise<TestTenantRecordDto> {
    const tenantId = RequestContext.getTenantId();
    const branchId = RequestContext.current()?.branchId;

    return this.db.withTenantTransaction(tenantId, branchId ? [branchId] : undefined, async (client) => {
      const res = await client.query(
        `SELECT id, tenant_id, branch_id, title, content, version, created_at, updated_at
         FROM test_tenant_records
         WHERE id = $1`,
        [id]
      );

      if (res.rows.length === 0) {
        throw new ProblemDetailsException(
          'RECORD_NOT_FOUND',
          'Record not found',
          HttpStatus.NOT_FOUND,
          `Record with ID ${id} was not found or is outside your tenant boundary`
        );
      }

      const r = res.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        title: r.title,
        content: r.content,
        version: r.version,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at ? r.updated_at.toISOString() : null,
      };
    });
  }
}
