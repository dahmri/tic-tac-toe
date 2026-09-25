import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, player, setup } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

async function makeAdmin() {
  const admin = await player(t.app);
  await t.db.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
  return admin;
}

const login = (c, username) =>
  c.post('/api/session', { username, password: 'a good long password' });

test('players other than admins find nothing there', async () => {
  const ann = await player(t.app);
  assert.equal((await ann.get('/api/admin/reports')).status, 404);
  assert.equal((await client(t.app).get('/api/admin/usage')).status, 404);
  assert.equal((await ann.request('DELETE', `/api/admin/players/${ann.user.id}`)).status, 404);
  assert.equal((await ann.get('/api/me')).body.user.admin, undefined);
});

test('an admin handles a report about a username by renaming the player', async () => {
  const admin = await makeAdmin();
  assert.equal((await admin.get('/api/me')).body.user.admin, true);
  const ann = await player(t.app);
  const bob = await player(t.app);
  await ann.post('/api/reports', { id: bob.user.id, reason: 'username', details: 'rude' });

  const { reports } = (await admin.get('/api/admin/reports')).body;
  const report = reports.find((r) => r.player.id === bob.user.id);
  assert.equal(report.reporter, ann.user.username);
  assert.equal(report.details, 'rude');

  const bad = await admin.post(`/api/admin/players/${bob.user.id}/rename`, { username: 'a b' });
  assert.equal(bad.status, 400);
  const res = await admin.post(`/api/admin/players/${bob.user.id}/rename`, {});
  assert.equal(res.body.username, `Player${bob.user.id}`);
  assert.equal((await bob.get('/api/me')).body.user.username, `Player${bob.user.id}`);
  const after = (await admin.get('/api/admin/reports')).body.reports;
  assert.equal(
    after.some((r) => r.id === report.id),
    false,
    'the report is handled',
  );

  const { log } = (await admin.get('/api/admin/log')).body;
  assert.equal(log[0].action, 'renamed');
  assert.equal(log[0].player, bob.user.username);
  assert.equal(log[0].admin, admin.user.username);
});

test('a suspended player is logged out and can only log in once it is lifted', async () => {
  const admin = await makeAdmin();
  const bob = await player(t.app);
  const res = await admin.post(`/api/admin/players/${bob.user.id}/suspend`, { days: 7 });
  assert.equal(res.status, 200);
  assert.equal((await bob.get('/api/me')).status, 401, 'logged out everywhere');

  const refused = await login(client(t.app), bob.user.username);
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, 'This account is suspended.');
  assert.ok(new Date(refused.body.until) > new Date(Date.now() + 6 * 86_400_000));
  // A wrong password says nothing about the suspension
  const wrong = await client(t.app).post('/api/session', {
    username: bob.user.username,
    password: 'not the password',
  });
  assert.equal(wrong.status, 401);

  const found = (await admin.get(`/api/admin/players?q=${bob.user.username}`)).body.players;
  assert.ok(found[0].suspendedUntil);

  assert.equal((await admin.post(`/api/admin/players/${bob.user.id}/unsuspend`)).status, 204);
  assert.equal((await login(client(t.app), bob.user.username)).status, 200);

  await admin.post(`/api/admin/players/${bob.user.id}/suspend`, { days: null });
  const forever = await login(client(t.app), bob.user.username);
  assert.equal(forever.status, 403);
  assert.equal(forever.body.until, null, 'until further notice');
  assert.equal(
    (await admin.post(`/api/admin/players/${bob.user.id}/suspend`, { days: 3 })).status,
    400,
  );
});

test("an admin deletes an account, but can't touch admins", async () => {
  const admin = await makeAdmin();
  const other = await makeAdmin();
  const bob = await player(t.app);
  assert.equal((await admin.request('DELETE', `/api/admin/players/${other.user.id}`)).status, 400);
  assert.equal((await admin.request('DELETE', `/api/admin/players/${admin.user.id}`)).status, 400);
  assert.equal((await admin.request('DELETE', `/api/admin/players/${bob.user.id}`)).status, 204);
  assert.equal((await bob.get('/api/me')).status, 401);
  assert.equal((await login(client(t.app), bob.user.username)).status, 401);
});

test('usage numbers: players active today, sign-ups and games, as counts', async () => {
  const admin = await makeAdmin();
  const ann = await player(t.app);
  const game = await ann.post('/api/games/cpu', {
    difficulty: 'casual',
    starter: 'X',
    moves: [0, 3, 1, 4, 2],
    seconds: 12,
  });
  assert.equal(game.status, 201);
  const { days, now } = (await admin.get('/api/admin/usage')).body;
  assert.equal(days.length, 30);
  const today = days[0];
  assert.equal(today.day, new Date().toISOString().slice(0, 10));
  assert.ok(today.active >= 2, 'the admin and ann logged in today');
  assert.ok(today.signups >= 2);
  assert.ok(today.computer >= 1 && today.variants.classic >= 1);
  assert.ok(now.players >= 2);
  assert.equal(JSON.stringify(days).includes(ann.user.username), false, 'no names');
});
