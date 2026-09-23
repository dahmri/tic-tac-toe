import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, newPlayer, setup } from './helpers.js';

let t;
before(async () => {
  t = await setup({ RATE_LIMITS: 'on' });
});
after(() => t.close());

test('repeated failed logins on one account are rate limited', async () => {
  const c = client(t.app);
  const player = newPlayer();
  await c.post('/api/account', player);
  let last;
  for (let i = 0; i < 11; i++) {
    last = await c.post('/api/session', { username: player.username, password: 'wrong' });
  }
  assert.equal(last.status, 429);
  assert.ok(Number(last.res.headers['retry-after']) > 0);
  assert.ok(Number(last.res.headers['retry-after']) <= 900);

  // Even the right password waits until the window ends
  const right = await c.post('/api/session', {
    username: player.username,
    password: player.password,
  });
  assert.equal(right.status, 429);
});

test('sign-ups from one address are limited', async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await client(t.app).post('/api/account', newPlayer());
  assert.equal(last.status, 429);
});
