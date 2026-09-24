import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, newPlayer, player, setup, startMatch } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

test('sign-up gives a recovery code that resets the password once', async () => {
  const details = newPlayer();
  const c = client(t.app);
  const { body } = await c.post('/api/account', details);
  assert.match(body.recoveryCode, /^([A-Z2-9]{5}-){3}[A-Z2-9]{5}$/);
  const { rows } = await t.db.query('SELECT recovery_hash FROM users WHERE id = $1', [
    body.user.id,
  ]);
  assert.ok(rows[0].recovery_hash && !rows[0].recovery_hash.includes(body.recoveryCode));

  const reset = (code, newPassword = 'a brand new password') =>
    client(t.app).post('/api/password-reset', {
      username: details.username.toUpperCase(),
      recoveryCode: code,
      newPassword,
    });
  assert.equal((await reset('AAAAA-AAAAA-AAAAA-AAAAA')).status, 400);
  const weak = await reset(body.recoveryCode, 'short');
  assert.equal(weak.status, 400);
  assert.ok(weak.body.fields.newPassword);

  // Typed loosely: lower case, spaces instead of dashes
  const ok = await reset(body.recoveryCode.toLowerCase().replaceAll('-', ' '));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.id, body.user.id);
  assert.notEqual(ok.body.recoveryCode, body.recoveryCode);
  assert.equal((await c.get('/api/me')).status, 401, 'old sessions are logged out');
  assert.equal((await reset(body.recoveryCode)).status, 400, 'the old code is used up');

  const login = await client(t.app).post('/api/session', {
    username: details.username,
    password: 'a brand new password',
  });
  assert.equal(login.status, 200);
});

test('a new recovery code needs the password', async () => {
  const ann = await player(t.app);
  assert.equal((await ann.post('/api/me/recovery-code', { password: 'nope' })).status, 400);
  const res = await ann.post('/api/me/recovery-code', { password: 'a good long password' });
  assert.equal(res.status, 200);
  assert.ok(res.body.recoveryCode);
});

test('export: everything about you, as a download', async () => {
  const ann = await player(t.app, { firstName: 'Annie' });
  await ann.post('/api/games/cpu', {
    difficulty: 'casual',
    starter: 'X',
    moves: [0, 3, 1, 4, 2],
    seconds: 5,
  });
  const res = await ann.get('/api/me/export');
  assert.equal(res.status, 200);
  assert.match(res.res.headers['content-disposition'], /attachment; filename=".+\.json"/);
  assert.equal(res.body.profile.firstName, 'Annie');
  assert.equal(res.body.games.length, 1);
  assert.equal(res.body.stats.computer.played, 1);
  assert.equal(res.body.hasRecoveryCode, true);
  assert.equal(JSON.stringify(res.body).includes('password'), false);
});

test('deleting an account keeps online games for the opponent', async () => {
  const [ann, bob] = await Promise.all([player(t.app), player(t.app)]);
  await ann.post('/api/games/cpu', {
    difficulty: 'casual',
    starter: 'X',
    moves: [0, 3, 1, 4, 2],
    seconds: 5,
  });
  const m = await startMatch(t.app, ann, bob);
  await m.play([0, 3, 1, 4, 2]);
  await m.leave();
  await m.close();

  assert.equal((await ann.request('DELETE', '/api/me', { password: 'wrong' })).status, 400);
  const res = await ann.request('DELETE', '/api/me', { password: 'a good long password' });
  assert.equal(res.status, 204);
  assert.equal((await ann.get('/api/me')).status, 401);
  const { rows } = await t.db.query('SELECT count(*)::int AS n FROM users WHERE id = $1', [
    ann.user.id,
  ]);
  assert.equal(rows[0].n, 0);
  const cpu = await t.db.query(`SELECT count(*)::int AS n FROM games WHERE mode = 'cpu'
    AND x_id IS NULL`);
  assert.equal(cpu.rows[0].n, 0, 'their games vs the computer are gone');

  const history = (await bob.get('/api/me/games')).body.games;
  assert.equal(history.length, 1);
  assert.equal(history[0].opponent.username, 'Deleted player');
  const login = await client(t.app).post('/api/session', {
    username: ann.user.username,
    password: 'a good long password',
  });
  assert.equal(login.status, 401);
});

test('the leaderboard is public', async () => {
  const res = await client(t.app).get('/api/leaderboard');
  assert.equal(res.status, 200);
  assert.equal(res.body.me, null);
});

test('guest games can be added later, dated when they were played', async () => {
  const ann = await player(t.app);
  const endedAt = Date.now() - 3 * 24 * 3600 * 1000;
  const game = { difficulty: 'casual', starter: 'X', moves: [0, 3, 1, 4, 2], seconds: 5 };
  await ann.post('/api/games/cpu', { ...game, endedAt });
  await ann.post('/api/games/cpu', { ...game, endedAt: Date.now() + 86_400_000 });
  const { games } = (await ann.get('/api/me/games')).body;
  const times = games.map((g) => new Date(g.endedAt).getTime()).sort();
  assert.equal(times[0], endedAt);
  assert.ok(times[1] > Date.now() - 60_000, 'a date in the future is taken as now');
});
