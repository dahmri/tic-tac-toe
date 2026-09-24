import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, newPlayer, setup } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

test('signing up creates the account and logs in', async () => {
  const c = client(t.app);
  const player = newPlayer();
  const res = await c.post('/api/account', player);
  assert.equal(res.status, 201);
  assert.equal(res.body.user.username, player.username);
  assert.equal(res.body.user.firstName, 'Test');
  assert.equal(res.body.user.avatar, 'octopus');
  assert.equal(res.body.user.password, undefined);
  assert.ok(c.cookie);

  const cookie = res.res.cookies.find((k) => k.name === 'sid');
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'Lax');

  const me = await c.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.phone, '+33612345678');
});

test('personal data is encrypted in the database, the password hashed', async () => {
  const player = newPlayer({ firstName: 'Findable', phone: '+441234567890' });
  await client(t.app).post('/api/account', player);
  const { rows } = await t.db.query('SELECT * FROM users WHERE username = $1', [player.username]);
  const row = rows[0];
  const raw = JSON.stringify(row) + row.pii.toString('latin1');
  for (const secret of ['Findable', '+441234567890', '1990-05-17', player.password]) {
    assert.equal(raw.includes(secret), false, `${secret} is stored in plain text`);
  }
  assert.match(row.password_hash, /^\$argon2id\$/);
  assert.equal(row.country, 'FR');
});

test('invalid sign-ups are refused with a message per field', async () => {
  const res = await client(t.app).post('/api/account', newPlayer({ username: 'x', birthDate: '' }));
  assert.equal(res.status, 400);
  assert.ok(res.body.fields.username);
  assert.ok(res.body.fields.birthDate);
});

test('an avatar must be chosen from the list, and can be changed', async () => {
  const missing = await client(t.app).post('/api/account', newPlayer({ avatar: undefined }));
  assert.equal(missing.status, 400);
  assert.equal(missing.body.fields.avatar, 'Pick an avatar.');
  const guest = await client(t.app).post('/api/account', newPlayer({ avatar: 'guest' }));
  assert.equal(guest.status, 400);

  const c = client(t.app);
  await c.post('/api/account', newPlayer());
  const res = await c.patch('/api/me', { avatar: 'banana' });
  assert.equal(res.status, 200);
  assert.equal((await c.get('/api/me')).body.user.avatar, 'banana');
});

test('usernames are unique regardless of case', async () => {
  const player = newPlayer({ username: 'CaseTest' });
  assert.equal((await client(t.app).post('/api/account', player)).status, 201);
  const res = await client(t.app).post('/api/account', { ...player, username: 'casetest' });
  assert.equal(res.status, 409);
  assert.ok(res.body.fields.username);
});

test('logging in: right password works, wrong one gives the same message as no account', async () => {
  const player = newPlayer();
  await client(t.app).post('/api/account', player);
  const c = client(t.app);

  const wrong = await c.post('/api/session', { username: player.username, password: 'nope' });
  const ghost = await c.post('/api/session', { username: 'nobody_here', password: 'nope' });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, ghost.body);

  const ok = await c.post('/api/session', {
    username: player.username.toUpperCase(),
    password: player.password,
  });
  assert.equal(ok.status, 200);
  assert.equal((await c.get('/api/me')).status, 200);
});

test('logging out ends the session', async () => {
  const c = client(t.app);
  await c.post('/api/account', newPlayer());
  const cookie = c.cookie;
  assert.equal((await c.del('/api/session')).status, 204);
  const reused = await t.app.inject({ url: '/api/me', headers: { cookie } });
  assert.equal(reused.statusCode, 401);
});

test('the profile can be updated, and only valid changes are saved', async () => {
  const c = client(t.app);
  const player = newPlayer();
  await c.post('/api/account', player);

  const res = await c.patch('/api/me', {
    firstName: 'Renamed',
    country: 'ma',
    phone: '',
    username: player.username + 'x',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.firstName, 'Renamed');
  assert.equal(res.body.user.country, 'MA');
  assert.equal(res.body.user.phone, null);
  assert.equal(res.body.user.lastName, 'Player'); // untouched
  assert.equal(res.body.user.username, player.username + 'x');

  const bad = await c.patch('/api/me', { birthDate: '2024-01-01' });
  assert.equal(bad.status, 400);
  assert.equal((await c.get('/api/me')).body.user.birthDate, '1990-05-17');
});

test("renaming to someone else's username is refused", async () => {
  const other = newPlayer();
  await client(t.app).post('/api/account', other);
  const c = client(t.app);
  await c.post('/api/account', newPlayer());
  const res = await c.patch('/api/me', { username: other.username.toUpperCase() });
  assert.equal(res.status, 409);
});

test('changing the password needs the current one and logs out other devices', async () => {
  const player = newPlayer();
  const phone = client(t.app);
  await phone.post('/api/account', player);
  const laptop = client(t.app);
  await laptop.post('/api/session', { username: player.username, password: player.password });

  const wrong = await laptop.put('/api/me/password', {
    currentPassword: 'not it',
    newPassword: 'brand new password',
  });
  assert.equal(wrong.status, 400);
  assert.ok(wrong.body.fields.currentPassword);

  const weak = await laptop.put('/api/me/password', {
    currentPassword: player.password,
    newPassword: 'short',
  });
  assert.ok(weak.body.fields.newPassword);

  const ok = await laptop.put('/api/me/password', {
    currentPassword: player.password,
    newPassword: 'brand new password',
  });
  assert.equal(ok.status, 204);
  assert.equal((await laptop.get('/api/me')).status, 200, 'this device stays logged in');
  assert.equal((await phone.get('/api/me')).status, 401, 'other devices are logged out');

  const login = await client(t.app).post('/api/session', {
    username: player.username,
    password: 'brand new password',
  });
  assert.equal(login.status, 200);
});

test('profile endpoints need a session', async () => {
  const c = client(t.app);
  assert.equal((await c.get('/api/me')).status, 401);
  assert.equal((await c.patch('/api/me', { country: 'FR' })).status, 401);
  const forged = await t.app.inject({
    url: '/api/me',
    headers: { cookie: 'sid=' + 'a'.repeat(43) },
  });
  assert.equal(forged.statusCode, 401);
});

test('cross-site requests are refused', async () => {
  const res = await client(t.app).post('/api/session', {}, { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
});

test('same-site requests pass, including on a non-standard port', async () => {
  const res = await client(t.app).post(
    '/api/session',
    { username: 'nobody_here', password: 'x' },
    { origin: 'http://games.example:8080', host: 'games.example:8080' },
  );
  assert.equal(res.status, 401); // past the Origin check, then a normal failed login
});

test('the health check reports the database and Redis', async () => {
  assert.deepEqual((await client(t.app).get('/api/health')).body, { ok: true });
});
