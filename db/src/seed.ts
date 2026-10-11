import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

export async function runSeeds(databaseName: string = 'innkeeper') {
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER_OWNER || 'innkeeper_owner',
    password: process.env.PGPASSWORD_OWNER || 'innkeeper_owner_pass',
    database: databaseName,
  });

  const client = await pool.connect();
  try {
    console.log(`[Seed] Connected to ${databaseName} as innkeeper_owner`);
    const seedsDir = path.resolve('seeds');
    if (!fs.existsSync(seedsDir)) {
      console.log('[Seed] No seeds directory found.');
      return;
    }

    const files = fs.readdirSync(seedsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`[Seed] Running seed ${file}...`);
      const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`[Seed] Completed seed ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Seed] Failed seed ${file}:`, err);
        throw err;
      }
    }
    console.log('[Seed] Seeding finished successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeeds()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed] Error:', err);
      process.exit(1);
    });
}
