import pg from 'pg';

const { Pool } = pg;

export class OutboxPublisher {
  private pool: pg.Pool;
  private running: boolean = false;
  private pollIntervalMs: number = 2000;

  constructor() {
    this.pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432', 10),
      user: process.env.PGUSER_APP || 'innkeeper_app',
      password: process.env.PGPASSWORD_APP || 'innkeeper_app_pass',
      database: process.env.PGDATABASE || 'innkeeper',
      max: 5,
    });
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
            `[Worker Event Dispatch] [${event.event_type}] Aggregate: ${event.aggregate_type}:${event.aggregate_id} (Tenant: ${event.tenant_id})`
          );

          await client.query(
            `UPDATE outbox_events
             SET status = 'published', published_at = now()
             WHERE id = $1`,
            [event.id]
          );
        } catch (dispatchErr: any) {
          console.error(`[Worker] Dispatch failed for event ${event.id}:`, dispatchErr);
          const nextRetry = new Date(Date.now() + Math.pow(2, event.retry_count + 1) * 1000);
          const newStatus = event.retry_count >= 5 ? 'failed' : 'pending';

          await client.query(
            `UPDATE outbox_events
             SET retry_count = retry_count + 1, next_retry_at = $1, status = $2
             WHERE id = $3`,
            [nextRetry, newStatus, event.id]
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

const worker = new OutboxPublisher();
worker.start().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('[Worker] Gracefully shutting down...');
  await worker.stop();
  process.exit(0);
});
