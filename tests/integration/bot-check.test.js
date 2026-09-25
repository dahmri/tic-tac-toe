import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { answerChallenge, client, newPlayer, setup } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

test('sign-up needs the answer to a fresh challenge', async () => {
  const c = client(t.app);
  const { body } = await c.get('/api/challenge');
  assert.match(body.challenge, /^\d+\.[\w-]+\.[\w-]{22}$/);
  assert.equal(body.bits, 4);

  const missing = await c.post('/api/account', { ...newPlayer(), challenge: '' });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, "Couldn't check you're not a robot. Try again.");

  const answer = await answerChallenge(t.app);
  assert.equal((await c.post('/api/account', { ...newPlayer(), ...answer })).status, 201);
  const again = await client(t.app).post('/api/account', { ...newPlayer(), ...answer });
  assert.equal(again.status, 400, 'each answer works once');
  assert.equal(again.body.check, 'reused');
});

test('a filled-in trap field means a bot', async () => {
  const c = client(t.app);
  const res = await c.post('/api/account', {
    ...newPlayer(),
    ...(await answerChallenge(t.app)),
    website: 'http://spam.example',
  });
  assert.equal(res.status, 400);
});
