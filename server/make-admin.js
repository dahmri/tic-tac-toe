// Makes a player an admin (or, with --remove, a player again). Admins see
// the Admin button: reports, renaming, suspensions and usage numbers.
//
// Usage: npm run make-admin -- <username> [--remove]
// On the server: docker compose exec api node server/make-admin.js <username>

import { createDb } from './db.js';
import { loadConfig } from './config.js';

const [username, flag] = process.argv.slice(2);
if (!username) {
  console.error('Usage: npm run make-admin -- <username> [--remove]');
  process.exit(2);
}
const role = flag === '--remove' ? 'player' : 'admin';
const db = createDb(loadConfig());
try {
  const { rows } = await db.query(
    'UPDATE users SET role = $2 WHERE lower(username) = lower($1) RETURNING username',
    [username, role],
  );
  if (!rows[0]) {
    console.error(`No player called ${username}.`);
    process.exitCode = 1;
  } else {
    console.log(`${rows[0].username} is now ${role === 'admin' ? 'an admin' : 'a player'}.`);
  }
} finally {
  await db.close();
}
