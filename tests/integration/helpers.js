// Integration tests run the real app against a real PostgreSQL and Redis.
// Defaults suit a local install; CI sets TEST_DATABASE_URL and TEST_REDIS_URL.
// The test database is wiped, so never point these at real data.

import { loadConfig } from '../../server/config.js';
import { createDb } from '../../server/db.js';
import { createRedis } from '../../server/redis.js';
import { migrate } from '../../server/migrate.js';
import { buildApp } from '../../server/app.js';
import { solves } from '../../server/challenge.js';

export async function setup(env = {}) {
  const config = loadConfig({
    DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://localhost/tictactoe_test',
    REDIS_URL: process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/15',
    LOG_LEVEL: 'silent',
    RATE_LIMITS: 'off', // rate-limit.test.js turns them back on
    MAIL_OUTBOX: 'on', // emails land in Redis, where tests read them
    SIGNUP_CHALLENGE_BITS: '4', // an easy sign-up puzzle (solved below)
    SIGNUP_CHALLENGE_MIN_MS: '0',
    ...env,
  });
  const db = createDb(config);
  const redis = createRedis(config);
  await migrate(db, () => {});
  await db.query('TRUNCATE users, games RESTART IDENTITY CASCADE');
  await redis.flushdb();
  const app = await buildApp({ config, db, redis });
  await app.ready(); // app.inject() does this itself, app.injectWS() doesn't

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
  const username = `player_${process.pid % 10000}_${counter}`;
  return {
    firstName: 'Test',
    lastName: 'Player',
    username,
    email: `${username}@example.com`,
    avatar: 'octopus',
    birthDate: '1990-05-17',
    country: 'FR',
    phone: '+33612345678',
    password: 'a good long password',
    ...overrides,
  };
}

// The sign-up check's puzzle, fetched and solved (tests make it easy)
export async function answerChallenge(app) {
  const { challenge, bits } = (await app.inject({ method: 'GET', url: '/api/challenge' })).json();
  let nonce = 0;
  while (!solves(challenge, String(nonce), bits)) nonce++;
  return { challenge, nonce: String(nonce) };
}

// A tiny client that keeps the session cookie between requests, like a browser
export function client(app) {
  let cookie = '';
  const request = async (method, url, payload, headers = {}) => {
    // Sign-ups answer the sign-up check first, like the page does
    if (method === 'POST' && url === '/api/account' && payload && !('challenge' in payload)) {
      payload = { ...payload, ...(await answerChallenge(app)) };
    }
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

// Opens the live connection (/ws) as the client's player. Messages are
// queued; next(type) waits for the next message of that type.
export async function live(app, c) {
  const ws = await app.injectWS('/ws', { headers: { cookie: c.cookie } });
  const queue = [];
  const waiters = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    const i = waiters.findIndex((w) => w.type === msg.t);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else queue.push(msg);
  });
  const closed = new Promise((resolve) => ws.on('close', (code) => resolve(code)));
  const next = (type, timeout = 3000) => {
    const i = queue.findIndex((m) => m.t === type);
    if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`No '${type}' message within ${timeout} ms`)),
        timeout,
      );
      waiters.push({ type, resolve: (m) => (clearTimeout(timer), resolve(m)) });
    });
  };
  const hello = await next('hello');
  return {
    ws,
    hello,
    next,
    closed,
    queue,
    send: (msg) => ws.send(JSON.stringify(msg)),
    close() {
      ws.terminate();
      return closed;
    },
  };
}

// Starts a match: `x` invites `o`, to play by `variant`. play(squares) plays them in order, each
// by whoever's turn it is.
export async function startMatch(app, x, o, variant = 'classic') {
  const a = await live(app, x);
  const b = await live(app, o);
  a.send({ t: 'invite', to: o.user.id, variant });
  const { invite } = await b.next('invite');
  b.send({ t: 'invite-accept', id: invite.id });
  const [{ match: m }] = await Promise.all([a.next('match'), b.next('match')]);
  const socketFor = { [x.user.id]: a, [o.user.id]: b };
  let current = m;
  return {
    id: m.id,
    a,
    b,
    // Plays squares in order; whoever's turn it is moves
    async play(squares) {
      for (const square of squares) {
        const mover = socketFor[current.players[current.turn].id];
        mover.send({ t: 'move', match: m.id, square });
        const [next] = await Promise.all([a.next('match'), b.next('match')]);
        current = next.match;
      }
      return current;
    },
    async nextRound() {
      a.send({ t: 'next-round', match: m.id });
      const [next] = await Promise.all([a.next('match'), b.next('match')]);
      current = next.match;
    },
    // Ends the match, so both players are free to play again
    async leave() {
      a.send({ t: 'leave', match: m.id });
      await Promise.all([a.next('match'), b.next('match')]);
    },
    close: () => Promise.all([a.close(), b.close()]),
  };
}

// Signs up a new player and returns their API client. Their email is
// confirmed straight away (most tests play online) unless `confirmed: false`.
export async function player(app, { confirmed = true, ...overrides } = {}) {
  const c = client(app);
  const details = newPlayer(overrides);
  const res = await c.post('/api/account', details);
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  if (confirmed) {
    await app.ctx.db.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [
      res.body.user.id,
    ]);
  }
  return Object.assign(c, { user: res.body.user, details });
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
