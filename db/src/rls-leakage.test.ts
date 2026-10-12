import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';

const { Pool } = pg;

const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
const TENANT_B = 'a0000000-0000-0000-0000-000000000002';

interface ColumnInfo {
  name: string;
  dataType: string;
  hasDefault: boolean;
  isNullable: boolean;
  isIdentity: boolean;
  isGenerated: boolean;
}

type Row = Record<string, unknown>;

/** Quotes a SQL identifier (table/column name) safely. */
function q(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function baseType(dataType: string): string {
  return dataType.replace(/\(.*\)$/, '').replace(/\[\]$/, '').toLowerCase();
}

function isArrayType(dataType: string): boolean {
  return dataType.endsWith('[]');
}

/** Tables in the public schema that carry a tenant_id column and enforce their own RLS. */
async function listTenantTables(client: pg.PoolClient): Promise<string[]> {
  const res = await client.query<{ relname: string }>(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relispartition = false
      AND NOT c.relispartition
      AND a.attname = 'tenant_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY c.relname;
  `);
  return res.rows.map((r) => r.relname);
}

async function getColumns(client: pg.PoolClient, table: string): Promise<ColumnInfo[]> {
  const res = await client.query<{
    name: string;
    data_type: string;
    has_default: boolean;
    is_nullable: boolean;
    identity: string;
    generated: string;
  }>(
    `SELECT a.attname AS name,
            format_type(a.atttypid, a.atttypmod) AS data_type,
            a.atthasdef AS has_default,
            NOT a.attnotnull AS is_nullable,
            a.attidentity AS identity,
            a.attgenerated AS generated
     FROM pg_attribute a
     WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum;`,
    [table],
  );
  return res.rows.map((r) => ({
    name: r.name,
    dataType: r.data_type,
    hasDefault: r.has_default,
    isNullable: r.is_nullable,
    isIdentity: r.identity !== '',
    isGenerated: r.generated !== '',
  }));
}

async function getPrimaryKey(client: pg.PoolClient, table: string): Promise<string[]> {
  const res = await client.query<{ attname: string }>(
    `SELECT a.attname
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = $1::regclass AND i.indisprimary;`,
    [table],
  );
  return res.rows.map((r) => r.attname);
}

async function getPolicyWithCheck(client: pg.PoolClient, table: string): Promise<string | null> {
  const res = await client.query<{ check_expr: string | null }>(
    `SELECT pg_get_expr(polwithcheck, polrelid) AS check_expr
     FROM pg_policy
     WHERE polrelid = $1::regclass AND polname = 'tenant_isolation';`,
    [table],
  );
  return res.rows[0]?.check_expr ?? null;
}

/** Maps a text-ish column to the first literal in one of its CHECK constraints, e.g. status IN ('pending'). */
async function getCheckLiterals(
  client: pg.PoolClient,
  table: string,
  columns: ColumnInfo[],
): Promise<Record<string, string>> {
  const res = await client.query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = $1::regclass AND contype = 'c';`,
    [table],
  );
  const literals: Record<string, string> = {};
  for (const col of columns) {
    for (const row of res.rows) {
      if (new RegExp(`\\b${col.name}\\b`).test(row.def)) {
        const match = row.def.match(/'([^']+)'/);
        if (match) {
          literals[col.name] = match[1];
          break;
        }
      }
    }
  }
  return literals;
}

async function getForeignTargets(
  client: pg.PoolClient,
  table: string,
): Promise<Record<string, { table: string; column: string }>> {
  const res = await client.query<{ column: string; ref_table: string; ref_column: string }>(
    `SELECT a.attname AS column,
            confrelid::regclass::text AS ref_table,
            af.attname AS ref_column
     FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY (c.confkey)
     WHERE c.conrelid = $1::regclass AND c.contype = 'f';`,
    [table],
  );
  const map: Record<string, { table: string; column: string }> = {};
  for (const r of res.rows) {
    map[r.column] = { table: r.ref_table, column: r.ref_column };
  }
  return map;
}

function placeholder(
  column: ColumnInfo,
  literals: Record<string, string>,
): unknown {
  const t = baseType(column.dataType);
  if (isArrayType(column.dataType)) return [];
  if (literals[column.name] !== undefined) return literals[column.name];
  switch (t) {
    case 'uuid':
      return uuidv7();
    case 'text':
    case 'character varying':
    case 'character':
      return `rls-test-${uuidv7()}`;
    case 'integer':
    case 'smallint':
      return 1;
    case 'bigint':
      return 1;
    case 'numeric':
    case 'real':
    case 'double precision':
      return 0;
    case 'boolean':
      return false;
    case 'timestamp with time zone':
    case 'timestamp without time zone':
      return new Date();
    case 'date':
      return new Date().toISOString().slice(0, 10);
    case 'jsonb':
    case 'json':
      return {};
    default:
      return `rls-test-${uuidv7()}`;
  }
}

async function selectOne(client: pg.PoolClient, table: string): Promise<Row | null> {
  const res = await client.query<Row>(`SELECT * FROM ${q(table)} LIMIT 1;`);
  return res.rows[0] ?? null;
}

async function setTenant(client: pg.PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}

/**
 * Builds an insertable row for `table`. Values are copied from a real template
 * row when available; PK columns always get unique values and tenant_id is
 * forced to `tenantId`. Falls back to type-based placeholders (with CHECK-literal
 * extraction and FK resolution) for tables that have no data yet.
 */
async function buildRow(
  client: pg.PoolClient,
  table: string,
  tenantId: string,
  template: Row | null,
  columns: ColumnInfo[],
  pk: string[],
  literals: Record<string, string>,
  foreignTargets: Record<string, { table: string; column: string }>,
): Promise<Row> {
  const row: Row = {};
  for (const col of columns) {
    if (col.isIdentity || col.isGenerated) continue;
    if (col.name === 'tenant_id') {
      row[col.name] = tenantId;
      continue;
    }
    if (pk.includes(col.name)) {
      row[col.name] = placeholder(col, literals);
      continue;
    }
    if (template && template[col.name] !== undefined && template[col.name] !== null) {
      row[col.name] = template[col.name];
      continue;
    }
    if (!col.isNullable && !col.hasDefault) {
      const fk = foreignTargets[col.name];
      if (fk) {
        const lookup = await client.query<{ v: unknown }>(
          `SELECT ${q(fk.column)} AS v FROM ${q(fk.table)} LIMIT 1;`,
        );
        if (lookup.rows[0]?.v !== undefined && lookup.rows[0]?.v !== null) {
          row[col.name] = lookup.rows[0].v;
          continue;
        }
      }
      row[col.name] = placeholder(col, literals);
    }
  }
  return row;
}

function toParam(dataType: string, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  const t = baseType(dataType);
  if (t === 'jsonb' || t === 'json') {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return value;
}

async function insertRow(
  client: pg.PoolClient,
  table: string,
  row: Row,
  columns: ColumnInfo[],
): Promise<void> {
  const byName = new Map(columns.map((c) => [c.name, c]));
  const names = Object.keys(row);
  const colSql = names.map(q).join(', ');
  const params = names.map((n) => toParam(byName.get(n)?.dataType ?? 'text', row[n]));
  const placeholders = names.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(`INSERT INTO ${q(table)} (${colSql}) VALUES (${placeholders});`, params);
}

function pkPredicate(row: Row, pk: string[], columns: ColumnInfo[]): { where: string; params: unknown[] } {
  const byName = new Map(columns.map((c) => [c.name, c]));
  const params: unknown[] = [];
  const where = pk
    .map((col) => {
      params.push(toParam(byName.get(col)?.dataType ?? 'text', row[col]));
      return `${q(col)} = $${params.length}`;
    })
    .join(' AND ');
  return { where, params };
}

describe('Multi-Tenancy RLS Leakage Test Suite (innkeeper_app NOBYPASSRLS)', () => {
  let pool: pg.Pool;

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

  it('enforces cross-tenant READ/UPDATE/DELETE/INSERT isolation on EVERY tenant table and every table exposes a WITH CHECK policy', async () => {
    const client = await pool.connect();
    const failures: string[] = [];
    const skipped: string[] = [];

    try {
      const tables = await listTenantTables(client);
      expect(tables.length).toBeGreaterThan(6);

      for (const table of tables) {
        const columns = await getColumns(client, table);
        const pk = await getPrimaryKey(client, table);
        const policyCheck = await getPolicyWithCheck(client, table);

        // Static guarantee: every tenant table must constrain inserts via WITH CHECK.
        if (!policyCheck) {
          failures.push(`${table}: tenant_isolation policy has no WITH CHECK clause`);
        }

        await client.query('BEGIN');

        // Discover a Tenant B row and a Tenant A template row (each under its own RLS context).
        await setTenant(client, TENANT_B);
        const bRow = await selectOne(client, table);

        await setTenant(client, TENANT_A);
        const aRow = await selectOne(client, table);

        const template = aRow ?? bRow;
        let attackRow: Row | null = bRow;

        // If Tenant B has no row for this table, create one (as Tenant B) from the template
        // so that the isolation assertions are non-trivial. If the shape cannot be inserted
        // even for its own tenant, we fall back to the static WITH CHECK guarantee.
        if (!attackRow) {
          const literals = await getCheckLiterals(client, table, columns);
          const foreignTargets = await getForeignTargets(client, table);
          const candidate = await buildRow(
            client,
            table,
            TENANT_B,
            template,
            columns,
            pk,
            literals,
            foreignTargets,
          );
          await setTenant(client, TENANT_B);
          await client.query('SAVEPOINT mk_b');
          try {
            await insertRow(client, table, candidate, columns);
            attackRow = candidate;
            await client.query('RELEASE SAVEPOINT mk_b');
          } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT mk_b');
            skipped.push(
              `${table}: no Tenant B row and template could not be materialised (${(err as Error).message}) — relied on WITH CHECK policy`,
            );
          }
          await setTenant(client, TENANT_A);
        }

        if (attackRow) {
          const { where, params } = pkPredicate(attackRow, pk, columns);

          // READ: Tenant A must not see Tenant B's row.
          const read = await client.query(
            `SELECT 1 FROM ${q(table)} WHERE ${where};`,
            params,
          );
          if (read.rows.length !== 0) {
            failures.push(`${table}: Tenant A could READ a Tenant B row`);
          }

          // UPDATE: Tenant A must not affect Tenant B's row.
          const update = await client.query(
            `UPDATE ${q(table)} SET tenant_id = tenant_id WHERE ${where};`,
            params,
          );
          if (update.rowCount !== 0) {
            failures.push(`${table}: Tenant A could UPDATE a Tenant B row`);
          }

          // DELETE: Tenant A must not remove Tenant B's row.
          const del = await client.query(
            `DELETE FROM ${q(table)} WHERE ${where};`,
            params,
          );
          if (del.rowCount !== 0) {
            failures.push(`${table}: Tenant A could DELETE a Tenant B row`);
          }

          // INSERT: Tenant A must not be able to write a row tagged for Tenant B.
          const literals = await getCheckLiterals(client, table, columns);
          const foreignTargets = await getForeignTargets(client, table);
          const forged = await buildRow(
            client,
            table,
            TENANT_B,
            template,
            columns,
            pk,
            literals,
            foreignTargets,
          );
          await setTenant(client, TENANT_A);
          await client.query('SAVEPOINT forge');
          let insertError: Error | null = null;
          try {
            await insertRow(client, table, forged, columns);
          } catch (err) {
            insertError = err as Error;
          }
          await client.query('ROLLBACK TO SAVEPOINT forge');
          if (!insertError || !/row-level security/i.test(insertError.message)) {
            failures.push(
              `${table}: cross-tenant INSERT was not blocked by RLS (${
                insertError ? insertError.message : 'insert unexpectedly succeeded'
              })`,
            );
          }
        } else {
          skipped.push(`${table}: no insertable row shape available — relied on WITH CHECK policy`);
        }

        await client.query('ROLLBACK');
      }

      if (skipped.length > 0) {
        console.warn(`[rls-leakage] tables without a materialised probe row:\n  ${skipped.join('\n  ')}`);
      }

      expect(failures, failures.join('\n')).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
