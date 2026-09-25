// Checks a database restored from a backup: every migration is there, the
// main tables can be read, and players' personal data opens with this
// server's DATA_ENCRYPTION_KEY (a backup without its key is no backup).
// scripts/restore-drill.sh runs it against a scratch copy.
//
// Usage: DATABASE_URL=postgres://…/scratch node server/restore-check.js

import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.js';
import { loadConfig } from './config.js';
import { openPII } from './security.js';

const DIR = fileURLToPath(new URL('./migrations/', import.meta.url));
const TABLES = ['users', 'games', 'player_stats'];
const SAMPLE = 500; // players whose personal data is opened

// { ok, problems: [..], counts: {table: n}, newest: game end time or null }
export async function checkRestore(db, key) {
  const problems = [];
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql'));
  const { rows: applied } = await db
    .query('SELECT name FROM schema_migrations')
    .catch(() => ({ rows: [] }));
  const have = new Set(applied.map((r) => r.name));
  const missing = files.filter((f) => !have.has(f));
  if (missing.length) problems.push(`Migrations missing: ${missing.join(', ')}`);

  const counts = {};
  for (const table of TABLES) {
    try {
      // Table names come from the list above, never from input
      counts[table] = (await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n;
    } catch (err) {
      problems.push(`Can't read ${table}: ${err.message}`);
    }
  }

  const { rows: sealed } = await db
    .query('SELECT id, pii FROM users ORDER BY random() LIMIT $1', [SAMPLE])
    .catch(() => ({ rows: [] }));
  const unreadable = sealed.filter((u) => {
    try {
      openPII(u.pii, key);
      return false;
    } catch {
      return true;
    }
  });
  if (unreadable.length) {
    problems.push(
      `${unreadable.length} of ${sealed.length} players' personal data doesn't open with this key`,
    );
  }

  const newest =
    (await db.query('SELECT max(ended_at) AS t FROM games').catch(() => null))?.rows[0]?.t ?? null;
  return { ok: problems.length === 0, problems, counts, newest };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const db = createDb(config);
  try {
    const r = await checkRestore(db, config.dataKey);
    console.log(
      `Rows: ${Object.entries(r.counts)
        .map(([t, n]) => `${t} ${n}`)
        .join(', ')}`,
    );
    console.log(`Newest game: ${r.newest ? new Date(r.newest).toISOString() : 'none'}`);
    for (const p of r.problems) console.error(`PROBLEM: ${p}`);
    console.log(r.ok ? 'The backup restores and reads correctly.' : 'The backup is NOT usable.');
    process.exitCode = r.ok ? 0 : 1;
  } finally {
    await db.close();
  }
}
