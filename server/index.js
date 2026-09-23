// Starts the game server: API, and (in development) the site's files.
// Usage: node server/index.js   (or: npm start)

import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { createRedis } from './redis.js';
import { migrate } from './migrate.js';
import { buildApp } from './app.js';

const config = loadConfig();
const db = createDb(config);
const redis = createRedis(config);

// Outside production the schema is brought up to date on start; in
// production migrations run as their own deploy step (npm run migrate)
if (!config.production) await migrate(db, () => {});

if (config.production && !config.rateLimits) {
  console.warn('Warning: RATE_LIMITS=off. Logins are not protected against password guessing.');
}

const app = await buildApp({ config, db, redis });
await app.listen({ host: config.host, port: config.port });
console.log(`Server listening on http://${config.host}:${config.port}`);

// Finish in-flight requests, then close connections, on docker stop / Ctrl+C
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    await Promise.allSettled([db.close(), redis.quit()]);
    process.exit(0);
  });
}
