import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, live, player, setup, startMatch, wait } from './helpers.js';

// What would have gone to push services
const sent = [];
let failWith = null;
async function pushSender(subscription, payload) {
  if (failWith) throw Object.assign(new Error('push service says no'), { statusCode: failWith });
  sent.push({ endpoint: subscription.endpoint, ...JSON.parse(payload) });
}

let t;
before(async () => {
  t = await setup({}, { pushSender });
});
after(() => t.close());
beforeEach(() => {
  sent.length = 0;
  failWith = null;
});

let n = 0;
const subscription = () => ({
  endpoint: `https://push.example.com/send/${++n}`,
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
});

async function subscribed(lang = 'en') {
  const p = await player(t.app);
  const sub = subscription();
  assert.equal((await p.post('/api/push', { subscription: sub, lang })).status, 204);
  return Object.assign(p, { sub });
}

// Until the notifications (sent in the background) arrive
async function arrived(count) {
  for (let i = 0; i < 50 && sent.length < count; i++) await wait(10);
  return sent;
}

test('turning notifications on and off, per browser', async () => {
  assert.equal((await client(t.app).get('/api/push/key')).status, 200);
  const ann = await subscribed();
  const on = await ann.post('/api/push/status', { endpoint: ann.sub.endpoint });
  assert.equal(on.body.on, true);
  assert.equal(
    (await ann.post('/api/push', { subscription: { endpoint: 'http://x' } })).status,
    400,
  );
  assert.equal(
    (await client(t.app).post('/api/push', { subscription: subscription() })).status,
    401,
  );

  assert.equal(
    (await ann.request('DELETE', '/api/push', { endpoint: ann.sub.endpoint })).status,
    204,
  );
  assert.equal((await ann.post('/api/push/status', { endpoint: ann.sub.endpoint })).body.on, false);
});

test('an invitation is pushed, in the player’s language, unless the game is on screen', async () => {
  const ann = await player(t.app);
  const bob = await subscribed('fr');
  const a = await live(t.app, ann);
  const b = await live(t.app, bob);

  b.send({ t: 'visible', on: false });
  await wait(20);
  a.send({ t: 'invite', to: bob.user.id });
  await b.next('invite');
  const [note] = await arrived(1);
  assert.equal(note.endpoint, bob.sub.endpoint);
  assert.equal(note.body, `${ann.user.username} t'invite à jouer.`);
  assert.equal(note.tag, 'invite');

  // Back on screen: the page shows it, no notification
  sent.length = 0;
  b.send({ t: 'visible', on: true });
  const cat = await player(t.app);
  const c = await live(t.app, cat);
  await wait(20);
  c.send({ t: 'invite', to: bob.user.id });
  await b.next('invite');
  await wait(100);
  assert.equal(sent.length, 0);
  await Promise.all([a.close(), b.close(), c.close()]);
});

test('your turn is pushed to the player who has to move', async () => {
  const ann = await subscribed();
  const bob = await subscribed();
  const m = await startMatch(t.app, ann, bob);
  m.a.send({ t: 'visible', on: false });
  m.b.send({ t: 'visible', on: false });
  await wait(20);
  sent.length = 0;
  await m.play([0]); // Ann (X) plays: Bob's turn
  const [note] = await arrived(1);
  assert.equal(note.endpoint, bob.sub.endpoint);
  assert.equal(note.body, `It's your turn against ${ann.user.username}.`);
  await m.close();
});

test('subscriptions the push service says are gone are forgotten', async () => {
  const bob = await subscribed();
  failWith = 410;
  assert.equal(await t.app.ctx.push.invited(bob.user.id, { username: 'ann' }), 0);
  const { rows } = await t.db.query('SELECT 1 FROM push_subscriptions WHERE user_id = $1', [
    bob.user.id,
  ]);
  assert.equal(rows.length, 0);
});
