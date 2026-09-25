// Load test: many players connected at once, playing online matches.
//
//   npm run load-test -- --players 400 --seconds 60 --url http://127.0.0.1:8000
//
// Run it against a test server started with RATE_LIMITS=off and
// MAIL_OUTBOX=on (it signs players up and confirms their email through the
// test outbox), never against production. It reports how long the server
// takes to answer a move (the time until both players have the new board),
// how many moves a second it handled, and any errors.

import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:8000' },
    players: { type: 'string', default: '200' },
    seconds: { type: 'string', default: '30' },
    think: { type: 'string', default: '300' }, // ms between a player's moves
  },
});
const BASE = values.url.replace(/\/$/, '');
const PLAYERS = Number(values.players) - (Number(values.players) % 2);
const SECONDS = Number(values.seconds);
const THINK = Number(values.think);
const run = Date.now().toString(36);

const latencies = [];
const errors = new Map();
let moves = 0;
let rounds = 0;
let httpCalls = 0;
const note = (what) => errors.set(what, (errors.get(what) || 0) + 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, cookie) {
  httpCalls++;
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body && { 'content-type': 'application/json' }),
      ...(cookie && { cookie }),
    },
    body: body && JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data?.error ?? ''}`);
  return { data, cookie: setCookie?.split(';')[0] ?? cookie };
}

// Signs a player up and confirms their email through the test outbox
async function signUp(n) {
  const username = `lt_${run}_${n}`.slice(0, 20);
  const email = `${username}@example.com`;
  const { data, cookie } = await api('POST', '/api/account', {
    firstName: 'Load',
    lastName: 'Test',
    username,
    email,
    avatar: 'robot',
    birthDate: '1990-01-01',
    country: 'FR',
    password: 'a load test password',
  });
  const { data: box } = await api('GET', `/api/test/outbox?to=${encodeURIComponent(email)}`);
  const link = /https?:\/\/\S+/.exec(box.emails[0].text)[0];
  await api('POST', '/api/email/verify', { token: new URL(link).searchParams.get('verify') });
  return { id: data.user.id, username, cookie };
}

// A player's live connection: send(msg), and next(type) waits for a message
function connect(player) {
  return new Promise((resolve, reject) => {
    // Node's WebSocket takes headers (the session cookie); browsers' doesn't
    const ws = new WebSocket(
      BASE.replace(/^http/, 'ws') + '/ws',
      /** @type {any} */ ({ headers: { cookie: player.cookie } }),
    );
    const waiters = [];
    const queue = [];
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'error') note(`server: ${msg.message}`);
      const i = waiters.findIndex((w) => w.type === msg.t);
      if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
      else queue.push(msg);
    };
    ws.onerror = () => reject(new Error('connection failed'));
    ws.onclose = () => waiters.forEach((w) => w.reject(new Error('closed')));
    const next = (type, timeout = 10_000) => {
      const i = queue.findIndex((m) => m.t === type);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`no ${type}`)), timeout);
        waiters.push({ type, resolve: (m) => (clearTimeout(timer), res(m)), reject: rej });
      });
    };
    ws.onopen = async () => {
      try {
        await next('hello');
        resolve({ ...player, ws, next, send: (m) => ws.send(JSON.stringify(m)) });
      } catch (err) {
        reject(err);
      }
    };
  });
}

// Two players play rounds until the time is up
async function playPair(a, b, until) {
  a.send({ t: 'invite', to: b.id });
  const { invite } = await b.next('invite');
  b.send({ t: 'invite-accept', id: invite.id });
  let [{ match }] = await Promise.all([a.next('match'), b.next('match')]);
  const by = { [a.id]: a, [b.id]: b };
  while (Date.now() < until) {
    if (match.over) {
      rounds++;
      a.send({ t: 'next-round', match: match.id });
      [{ match }] = await Promise.all([a.next('match'), b.next('match')]);
      continue;
    }
    await sleep(THINK * (0.5 + Math.random()));
    const mover = by[match.players[match.turn].id];
    const free = match.board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    const start = performance.now();
    mover.send({
      t: 'move',
      match: match.id,
      square: free[Math.floor(Math.random() * free.length)],
    });
    [{ match }] = await Promise.all([a.next('match'), b.next('match')]);
    latencies.push(performance.now() - start);
    moves++;
  }
  a.send({ t: 'leave', match: match.id });
}

// Every player also polls the lobby list, like the page does
async function pollLobby(p, until) {
  while (Date.now() < until) {
    await sleep(10_000 * Math.random());
    await api('GET', '/api/players/online?limit=20', null, p.cookie).catch(() =>
      note('lobby poll'),
    );
  }
}

const pct = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];

console.log(`Signing up ${PLAYERS} players on ${BASE}…`);
const players = [];
for (let i = 0; i < PLAYERS; i += 20) {
  players.push(
    ...(await Promise.all(
      Array.from({ length: Math.min(20, PLAYERS - i) }, (_, k) => signUp(i + k)),
    )),
  );
}
console.log(`Connecting ${PLAYERS} players…`);
const conns = [];
for (let i = 0; i < PLAYERS; i += 50) {
  conns.push(...(await Promise.all(players.slice(i, i + 50).map(connect))));
}
console.log(`Playing for ${SECONDS} s…`);
const started = Date.now();
const until = started + SECONDS * 1000;
await Promise.all([
  ...Array.from({ length: PLAYERS / 2 }, (_, i) =>
    playPair(conns[i * 2], conns[i * 2 + 1], until).catch((err) => note(`pair: ${err.message}`)),
  ),
  ...conns.map((c) => pollLobby(c, until)),
]);
const elapsed = (Date.now() - started) / 1000;
conns.forEach((c) => c.ws.close());

const sorted = latencies.sort((x, y) => x - y);
console.log(`
Players connected: ${PLAYERS} (${PLAYERS / 2} matches at once)
Moves: ${moves} (${(moves / elapsed).toFixed(0)} a second), rounds finished: ${rounds}
HTTP requests: ${httpCalls}
Move answered (both players have the new board):
  median ${pct(sorted, 50)?.toFixed(1)} ms · 95% ${pct(sorted, 95)?.toFixed(1)} ms · 99% ${pct(sorted, 99)?.toFixed(1)} ms · worst ${sorted.at(-1)?.toFixed(1)} ms
Errors: ${errors.size ? [...errors].map(([k, n]) => `${k} ×${n}`).join(', ') : 'none'}`);
process.exit(0);
