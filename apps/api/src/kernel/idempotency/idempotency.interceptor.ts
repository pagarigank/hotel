import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { RequestContext } from '../context/request-context.js';
import { ProblemDetailsException } from '../errors/problem-details.exception.js';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      return next.handle();
    }

    const ctx = RequestContext.get();
    const tenantId = ctx.tenantId;
    const userId = ctx.userId || '10000000-0000-0000-0000-000000000001';

    if (!tenantId) {
      return next.handle();
    }

    const payload = JSON.stringify({
      url: req.url,
      method: req.method,
      body: req.body,
    });
    const requestHash = crypto.createHash('sha256').update(payload).digest('hex');

    const pool = this.db.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const existing = await client.query(
        `SELECT * FROM idempotency_keys WHERE tenant_id = $1 AND key = $2`,
        [tenantId, idempotencyKey]
      );

      if (existing.rows.length > 0) {
        const record = existing.rows[0];
        if (record.request_hash !== requestHash) {
          await client.query('ROLLBACK');
          throw new ProblemDetailsException(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key payload mismatch',
            HttpStatus.UNPROCESSABLE_ENTITY,
            `The key "${idempotencyKey}" was previously submitted with a different request payload.`
          );
        }

        if (record.status === 'completed') {
          await client.query('COMMIT');
          res.status(record.response_status || HttpStatus.OK);
          return of(record.response_body);
        } else if (record.status === 'processing') {
          await client.query('ROLLBACK');
          throw new ProblemDetailsException(
            'IDEMPOTENCY_IN_FLIGHT',
            'A request with this idempotency key is already processing',
            HttpStatus.CONFLICT,
            'Please retry in a moment.'
          );
        }
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await client.query(
        `INSERT INTO idempotency_keys (key, tenant_id, user_id, request_hash, status, expires_at)
         VALUES ($1, $2, $3, $4, 'processing', $5)
         ON CONFLICT (tenant_id, key) DO UPDATE SET request_hash = $4, status = 'processing'`,
        [idempotencyKey, tenantId, userId, requestHash, expiresAt]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return next.handle().pipe(
      tap({
        next: async (responseBody) => {
          const updateClient = await pool.connect();
          try {
            await updateClient.query('BEGIN');
            await updateClient.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
            await updateClient.query(
              `UPDATE idempotency_keys
               SET status = 'completed', response_status = $1, response_body = $2
               WHERE tenant_id = $3 AND key = $4`,
              [res.statusCode || HttpStatus.OK, JSON.stringify(responseBody), tenantId, idempotencyKey]
            );
            await updateClient.query('COMMIT');
          } finally {
            updateClient.release();
          }
        },
        error: async () => {
          const failClient = await pool.connect();
          try {
            await failClient.query('BEGIN');
            await failClient.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
            await failClient.query(
              `UPDATE idempotency_keys SET status = 'failed' WHERE tenant_id = $1 AND key = $2`,
              [tenantId, idempotencyKey]
            );
            await failClient.query('COMMIT');
          } finally {
            failClient.release();
          }
        },
      })
    );
  }
}
