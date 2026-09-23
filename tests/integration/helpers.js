// Integration tests run the real app against a real PostgreSQL and Redis.
// Defaults suit a local install; CI sets TEST_DATABASE_URL and TEST_REDIS_URL.
// The test database is wiped, so never point these at real data.

import { loadConfig } from '../../server/config.js';
import { createDb } from '../../server/db.js';
import { createRedis } from '../../server/redis.js';
import { migrate } from '../../server/migrate.js';
import { buildApp } from '../../server/app.js';

export async function setup(env = {}) {
  const config = loadConfig({
    DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://localhost/tictactoe_test',
    REDIS_URL: process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/15',
    LOG_LEVEL: 'silent',
    RATE_LIMITS: 'off', // rate-limit.test.js turns them back on
    ...env,
  });
  const db = createDb(config);
  const redis = createRedis(config);
  await migrate(db, () => {});
  await db.query('TRUNCATE users RESTART IDENTITY CASCADE');
  await redis.flushdb();
  const app = await buildApp({ config, db, redis });

  return {
    app,
    db,
    redis,
    config,
    async close() {
      await app.close();
      await Promise.all([db.close(), redis.quit()]);
    },
  };
}

let counter = 0;
export function newPlayer(overrides = {}) {
  counter++;
  return {
    firstName: 'Test',
    lastName: 'Player',
    username: `player_${process.pid % 10000}_${counter}`,
    birthDate: '1990-05-17',
    country: 'FR',
    phone: '+33612345678',
    password: 'a good long password',
    ...overrides,
  };
}

// A tiny client that keeps the session cookie between requests, like a browser
export function client(app) {
  let cookie = '';
  const request = async (method, url, payload, headers = {}) => {
    const res = await app.inject({
      method,
      url,
      payload,
      headers: { ...(cookie && { cookie }), ...headers },
    });
    const set = res.cookies.find((c) => c.name === 'sid');
    if (set) cookie = set.value ? `sid=${set.value}` : '';
    return { status: res.statusCode, body: res.body ? res.json() : null, res };
  };
  return {
    request,
    get: (url) => request('GET', url),
    post: (url, body, headers) => request('POST', url, body, headers),
    patch: (url, body) => request('PATCH', url, body),
    put: (url, body) => request('PUT', url, body),
    del: (url) => request('DELETE', url),
    get cookie() {
      return cookie;
    },
  };
}
