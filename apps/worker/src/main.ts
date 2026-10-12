import pg from 'pg';
import { uuidv7 } from 'uuidv7';

const { Pool } = pg;

function workerPoolConfig(): pg.PoolConfig {
  return {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    // The worker must discover/claim events across all tenants, so it connects
    // as the dedicated BYPASSRLS role. This role is never used in request paths.
    user: process.env.PGUSER_WORKER || 'innkeeper_worker',
    password: process.env.PGPASSWORD_WORKER || 'innkeeper_worker_pass',
    database: process.env.PGDATABASE || 'innkeeper',
    max: 5,
  };
}

export class OutboxPublisher {
  private pool: pg.Pool;
  private running: boolean = false;
  private pollIntervalMs: number = 2000;

  constructor() {
    this.pool = new Pool(workerPoolConfig());
  }

  async start() {
    this.running = true;
    console.log('[Worker] Outbox Publisher started. Polling outbox_events...');

    while (this.running) {
      try {
        await this.processPendingEvents();
      } catch (err) {
        console.error('[Worker] Error processing outbox events:', err);
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  stop() {
    this.running = false;
    return this.pool.end();
  }

  private async processPendingEvents() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Fetch pending events with SKIP LOCKED to allow concurrent workers
      const res = await client.query(`
        SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, payload, retry_count
        FROM outbox_events
        WHERE status = 'pending'
          AND (next_retry_at IS NULL OR next_retry_at <= now())
        ORDER BY created_at ASC
        LIMIT 25
        FOR UPDATE SKIP LOCKED
      `);

      if (res.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      console.log(`[Worker] Publishing ${res.rows.length} pending domain events...`);

      for (const event of res.rows) {
        try {
          // Simulate dispatching to SSE / webhook / notification
          console.log(
            `[Worker Event Dispatch] [${event.event_type}] Aggregate: ${event.aggregate_type}:${event.aggregate_id} (Tenant: ${event.tenant_id})`,
          );

          await client.query(
            `UPDATE outbox_events
             SET status = 'published', published_at = now()
             WHERE id = $1`,
            [event.id],
          );
        } catch (dispatchErr: any) {
          console.error(`[Worker] Dispatch failed for event ${event.id}:`, dispatchErr);
          const nextRetry = new Date(Date.now() + Math.pow(2, event.retry_count + 1) * 1000);
          const newStatus = event.retry_count >= 5 ? 'failed' : 'pending';

          await client.query(
            `UPDATE outbox_events
             SET retry_count = retry_count + 1, next_retry_at = $1, status = $2
             WHERE id = $3`,
            [nextRetry, newStatus, event.id],
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * Releases out-of-order / out-of-service blocks whose date window has elapsed
 * and restores the unit to a cleanable state. This is the automated half of
 * REQ-PRP-006: without it an expired block would leave the room stuck as
 * out_of_order indefinitely.
 */
export class ExpiredBlockSweeper {
  private pool: pg.Pool;
  private running: boolean = false;
  private intervalMs: number = 60000;

  constructor() {
    this.pool = new Pool(workerPoolConfig());
  }

  async start() {
    this.running = true;
    console.log('[Worker] Expired block sweeper started. Polling unit_blocks...');

    while (this.running) {
      try {
        await this.sweep();
      } catch (err) {
        console.error('[Worker] Error sweeping expired blocks:', err);
      }
      await new Promise((resolve) => setTimeout(resolve, this.intervalMs));
    }
  }

  stop() {
    this.running = false;
    return this.pool.end();
  }

  private async sweep() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const released = await client.query(`
        UPDATE unit_blocks
        SET is_active = false, released_at = now(), updated_at = now()
        WHERE is_active = true AND to_date < CURRENT_DATE
        RETURNING id, tenant_id, branch_id, unit_id
      `);

      if (released.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      let restored = 0;
      for (const row of released.rows) {
        // Another active block may still cover the unit; leave it out of order then.
        const stillBlocked = await client.query(
          `SELECT 1 FROM unit_blocks
           WHERE unit_id = $1 AND is_active = true AND CURRENT_DATE BETWEEN from_date AND to_date
           LIMIT 1`,
          [row.unit_id],
        );
        if (stillBlocked.rows.length > 0) continue;

        const upd = await client.query(
          `UPDATE units
           SET status_code = 'vacant_dirty', status_changed_at = now(), is_sellable = false,
               version = version + 1, updated_at = now()
           WHERE id = $1 AND status_code = 'out_of_order'
           RETURNING id, number`,
          [row.unit_id],
        );

        if (upd.rows.length === 0) continue;
        restored++;

        await client.query(
          `INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
           VALUES ($1, $2, 'unit', $3, 'unit.status_changed', $4)`,
          [
            uuidv7(),
            row.tenant_id,
            row.unit_id,
            JSON.stringify({
              unitId: row.unit_id,
              unitNumber: upd.rows[0].number,
              fromStatus: 'out_of_order',
              toStatus: 'vacant_dirty',
              reason: 'Block expired',
              branchId: row.branch_id,
              changedBy: null,
              timestamp: new Date().toISOString(),
            }),
          ],
        );
      }

      await client.query('COMMIT');
      console.log(`[Worker] Expired-block sweep released ${released.rows.length} block(s), restored ${restored} unit(s).`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * Temporary booking hold sweeper (REQ-RSV-005):
 * Automatically releases expired booking holds and decrements sold counters.
 */
export class ExpiredHoldSweeper {
  private pool: pg.Pool;
  private running: boolean = false;
  private intervalMs: number = 30000;

  constructor() {
    this.pool = new Pool(workerPoolConfig());
  }

  async start() {
    this.running = true;
    console.log('[Worker] Expired hold sweeper started. Polling holds...');
    while (this.running) {
      try {
        await this.sweep();
      } catch (err) {
        console.error('[Worker] Error sweeping expired holds:', err);
      }
      await new Promise((resolve) => setTimeout(resolve, this.intervalMs));
    }
  }

  stop() {
    this.running = false;
    return this.pool.end();
  }

  private async sweep() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const expired = await client.query(`
        SELECT h.id AS hold_id, h.tenant_id, h.reservation_unit_id, ru.reservation_id, ru.branch_id, ru.unit_type_id, ru.check_in, ru.check_out
        FROM holds h
        JOIN reservation_units ru ON ru.id = h.reservation_unit_id
        WHERE h.expires_at < now()
        FOR UPDATE SKIP LOCKED
      `);

      if (expired.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      for (const row of expired.rows) {
        await client.query(
          `UPDATE room_type_inventory
           SET sold = GREATEST(0, sold - 1)
           WHERE tenant_id = $1 AND branch_id = $2 AND unit_type_id = $3
             AND stay_date >= $4 AND stay_date < $5`,
          [row.tenant_id, row.branch_id, row.unit_type_id, row.check_in, row.check_out],
        );

        await client.query(
          `UPDATE reservations SET status = 'cancelled', updated_at = now() WHERE id = $1`,
          [row.reservation_id],
        );

        await client.query(
          `UPDATE reservation_units SET status = 'cancelled' WHERE id = $1`,
          [row.reservation_unit_id],
        );

        await client.query(`DELETE FROM holds WHERE id = $1`, [row.hold_id]);
      }

      await client.query('COMMIT');
      console.log(`[Worker] Expired-hold sweep released ${expired.rows.length} hold(s).`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * Group block cutoff date release sweeper (REQ-RSV-009):
 * Automatically releases unallocated group block rooms whose cutoff date has passed.
 */
export class GroupBlockCutoffSweeper {
  private pool: pg.Pool;
  private running: boolean = false;
  private intervalMs: number = 60000;

  constructor() {
    this.pool = new Pool(workerPoolConfig());
  }

  async start() {
    this.running = true;
    console.log('[Worker] Group block cutoff sweeper started. Polling group_blocks...');
    while (this.running) {
      try {
        await this.sweep();
      } catch (err) {
        console.error('[Worker] Error sweeping group blocks:', err);
      }
      await new Promise((resolve) => setTimeout(resolve, this.intervalMs));
    }
  }

  stop() {
    this.running = false;
    return this.pool.end();
  }

  private async sweep() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const expiredBlocks = await client.query(`
        UPDATE group_blocks
        SET status = 'released', updated_at = now()
        WHERE status = 'definite' AND cutoff_date < CURRENT_DATE
        RETURNING id, code, name
      `);

      await client.query('COMMIT');
      if (expiredBlocks.rows.length > 0) {
        console.log(`[Worker] Group-block cutoff sweep released ${expiredBlocks.rows.length} block(s).`);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

const worker = new OutboxPublisher();
const sweeper = new ExpiredBlockSweeper();
const holdSweeper = new ExpiredHoldSweeper();
const groupSweeper = new GroupBlockCutoffSweeper();

worker.start().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});

sweeper.start().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});

holdSweeper.start().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});

groupSweeper.start().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('[Worker] Gracefully shutting down...');
  await Promise.all([worker.stop(), sweeper.stop(), holdSweeper.stop(), groupSweeper.stop()]);
  process.exit(0);
});

