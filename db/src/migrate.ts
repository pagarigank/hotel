import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

export async function runMigrations(databaseName: string = 'innkeeper') {
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER_OWNER || 'innkeeper_owner',
    password: process.env.PGPASSWORD_OWNER || 'innkeeper_owner_pass',
    database: databaseName,
  });

  const client = await pool.connect();
  try {
    console.log(`[Migrate] Connected to ${databaseName} as innkeeper_owner`);

    // Ensure _migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const migrationsDir = path.resolve('migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.error(`[Migrate] Migrations directory not found at ${migrationsDir}`);
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');

      const existing = await client.query('SELECT * FROM _migrations WHERE name = $1', [file]);
      if (existing.rows.length > 0) {
        if (existing.rows[0].checksum !== checksum) {
          console.warn(`[Migrate] Warning: Checksum mismatch for already executed migration ${file}`);
        }
        continue;
      }

      console.log(`[Migrate] Applying ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (name, checksum) VALUES ($1, $2)',
          [file, checksum]
        );
        await client.query('COMMIT');
        console.log(`[Migrate] Successfully applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrate] Failed to apply ${file}:`, err);
        throw err;
      }
    }

    console.log('[Migrate] All migrations up to date.');
  } finally {
    client.release();
    await pool.end();
  }
}

// Execute directly if run via CLI
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migrate] Error:', err);
      process.exit(1);
    });
}
