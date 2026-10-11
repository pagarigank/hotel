import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';

const { Pool } = pg;

describe('Multi-Tenancy RLS Leakage Test Suite (innkeeper_app NOBYPASSRLS)', () => {
  let pool: pg.Pool;

  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const TENANT_B = 'a0000000-0000-0000-0000-000000000002';

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432', 10),
      user: 'innkeeper_app',
      password: 'innkeeper_app_pass',
      database: 'innkeeper',
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('verifies innkeeper_app has NOBYPASSRLS role attribute', async () => {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user;
      `);
      expect(res.rows[0].rolbypassrls).toBe(false);
      expect(res.rows[0].rolsuper).toBe(false);
    } finally {
      client.release();
    }
  });

  it('dynamically queries pg_class: all non-partition tables with tenant_id MUST have relrowsecurity and relforcerowsecurity', async () => {
    const client = await pool.connect();
    try {
      // Find all base tables having a column named 'tenant_id', excluding partition children (which route via parent)
      const res = await client.query(`
        SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN information_schema.columns col ON col.table_name = c.relname AND col.column_name = 'tenant_id'
        WHERE n.nspname = 'public' 
          AND c.relkind = 'r'
          AND c.relispartition = false
        ORDER BY c.relname;
      `);

      expect(res.rows.length).toBeGreaterThan(6);

      for (const row of res.rows) {
        expect(
          row.relrowsecurity,
          `Table ${row.relname} must have ROW LEVEL SECURITY enabled`
        ).toBe(true);
        expect(
          row.relforcerowsecurity,
          `Table ${row.relname} must have FORCE ROW LEVEL SECURITY enabled`
        ).toBe(true);
      }
    } finally {
      client.release();
    }
  });

  it('fails closed when tenant context is unset (returns 0 rows)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Unset context
      await client.query("SELECT set_config('app.tenant_id', '', true)");
      
      const tables = ['test_tenant_records', 'settings', 'status_defs', 'action_defs', 'numbering_sequences'];
      for (const t of tables) {
        const res = await client.query(`SELECT * FROM ${t}`);
        expect(res.rows.length, `Unset context on ${t} must return 0 rows`).toBe(0);
      }

      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('proves Tenant A cannot read, update, delete, or insert Tenant B rows across tenant tables', async () => {
    const client = await pool.connect();

    try {
      // 1. Insert row as Tenant B
      const rowId = uuidv7();
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_B]);
      await client.query(
        'INSERT INTO test_tenant_records (id, tenant_id, title, content) VALUES ($1, $2, $3, $4)',
        [rowId, TENANT_B, 'Confidential Tenant B Document', 'Secret contents']
      );
      await client.query('COMMIT');

      // 2. Query as Tenant A: Read check
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_A]);

      const selectRes = await client.query(
        'SELECT * FROM test_tenant_records WHERE id = $1',
        [rowId]
      );
      expect(selectRes.rows.length).toBe(0);

      // Update check
      const updateRes = await client.query(
        'UPDATE test_tenant_records SET title = $1 WHERE id = $2',
        ['Hacked by Tenant A', rowId]
      );
      expect(updateRes.rowCount).toBe(0);

      // Delete check
      const deleteRes = await client.query(
        'DELETE FROM test_tenant_records WHERE id = $1',
        [rowId]
      );
      expect(deleteRes.rowCount).toBe(0);

      // Cross-tenant read checks on seeded tables
      const statusRes = await client.query(
        "SELECT * FROM status_defs WHERE label = 'Beach Villa Clean'"
      );
      expect(statusRes.rows.length).toBe(0);

      const actionRes = await client.query(
        "SELECT * FROM action_defs WHERE label = 'Villa Welcome Check-in'"
      );
      expect(actionRes.rows.length).toBe(0);

      await client.query('COMMIT');

      // 3. Insert check in a separate transaction (since expected error aborts the tx)
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_A]);
      const fakeRowId = uuidv7();

      await expect(
        client.query(
          'INSERT INTO test_tenant_records (id, tenant_id, title) VALUES ($1, $2, $3)',
          [fakeRowId, TENANT_B, 'Malicious insert']
        )
      ).rejects.toThrow(/row-level security/i);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
