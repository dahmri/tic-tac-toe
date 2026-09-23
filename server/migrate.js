// Applies the SQL files in server/migrations/ in name order, each exactly
// once and in its own transaction. Safe to run from several instances at
// the same time: an advisory lock makes them take turns.
//
// Usage: node server/migrate.js   (or: npm run migrate)

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.js';
import { loadConfig } from './config.js';

const DIR = fileURLToPath(new URL('./migrations/', import.meta.url));
const LOCK_ID = 7_210_131; // any constant shared by all instances

export async function migrate(db, log = console.log) {
  const client = await db.pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();

    for (const name of files.filter((f) => !done.has(f))) {
      const sql = await readFile(DIR + name, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        log(`Applied ${name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${name} failed: ${err.message}`, { cause: err });
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = createDb(loadConfig());
  try {
    await migrate(db);
    console.log('Database is up to date.');
  } finally {
    await db.close();
  }
}
