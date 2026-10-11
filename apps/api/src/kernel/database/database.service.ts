import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pg from 'pg';

const { Pool } = pg;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: pg.Pool;

  async onModuleInit() {
    this.pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432', 10),
      user: process.env.PGUSER_APP || 'innkeeper_app',
      password: process.env.PGPASSWORD_APP || 'innkeeper_app_pass',
      database: process.env.PGDATABASE || 'innkeeper',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Test connection on startup
    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT current_user, current_database()');
      console.log(`[DatabaseService] Connected as ${res.rows[0].current_user} to ${res.rows[0].current_database}`);
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  getPool(): pg.Pool {
    return this.pool;
  }

  /**
   * Shorthand transaction helper
   */
  async transaction<T>(
    tenantId: string,
    fn: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.withTenantTransaction(tenantId, undefined, fn);
  }

  /**
   * Execute a callback inside an isolated transaction with tenant context
   */
  async withTenantTransaction<T>(
    tenantId: string,
    branchIds: string[] | undefined,
    fn: (client: pg.PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Set transaction-local session settings
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      if (branchIds && branchIds.length > 0) {
        await client.query("SELECT set_config('app.branch_ids', $1, true)", [branchIds]);
      } else {
        await client.query("SELECT set_config('app.branch_ids', '', true)");
      }

      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
