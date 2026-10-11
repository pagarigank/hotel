import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';
import { DatabaseService } from '../../kernel/database/database.service.js';
import type { GenerateNextNumberDto, GeneratedNumberResponse } from '@innkeeper/contracts';

@Injectable()
export class NumberingService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async generateNextNumber(
    tenantId: string,
    dto: GenerateNextNumberDto,
  ): Promise<GeneratedNumberResponse> {
    return this.db.transaction(tenantId, async (client: pg.PoolClient) => {
      // 1. Lock sequence row with SELECT ... FOR UPDATE
      let res = await client.query(
        `SELECT id, prefix, pattern, reset_policy, next_no, is_gapless
         FROM numbering_sequences
         WHERE tenant_id = $1 AND branch_id = $2 AND doc_type = $3
         FOR UPDATE`,
        [tenantId, dto.branchId, dto.docType],
      );

      // If not present, create a default sequence on-the-fly
      if (res.rows.length === 0) {
        const id = uuidv7();
        const prefix = dto.docType.slice(0, 3).toUpperCase();
        await client.query(
          `INSERT INTO numbering_sequences (id, tenant_id, branch_id, doc_type, prefix, pattern, reset_policy, next_no, is_gapless)
           VALUES ($1, $2, $3, $4, $5, '{PREFIX}-{YYYY}-{#6}', 'yearly', 1, false)`,
          [id, tenantId, dto.branchId, dto.docType, prefix],
        );

        res = await client.query(
          `SELECT id, prefix, pattern, reset_policy, next_no, is_gapless
           FROM numbering_sequences
           WHERE id = $1
           FOR UPDATE`,
          [id],
        );
      }

      const seq = res.rows[0];
      const currentNo = seq.next_no;
      const nextNo = currentNo + 1;

      // 2. Format doc number
      const now = new Date();
      const yyyy = String(now.getUTCFullYear());
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

      let docNumber = seq.pattern
        .replace('{PREFIX}', seq.prefix)
        .replace('{YYYY}', yyyy)
        .replace('{YY}', yyyy.slice(2))
        .replace('{MM}', mm);

      // Replace padded number: e.g. {#6} -> 000001
      const padMatch = docNumber.match(/\{#(\d+)\}/);
      if (padMatch) {
        const digits = parseInt(padMatch[1], 10);
        docNumber = docNumber.replace(padMatch[0], String(currentNo).padStart(digits, '0'));
      } else {
        docNumber = docNumber.replace('{#}', String(currentNo));
      }

      // 3. Increment sequence atomically
      await client.query(
        `UPDATE numbering_sequences
         SET next_no = $1
         WHERE id = $2 AND tenant_id = $3`,
        [nextNo, seq.id, tenantId],
      );

      return {
        docNumber,
        sequenceNo: currentNo,
        isGapless: seq.is_gapless,
      };
    });
  }
}
