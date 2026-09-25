import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, live, newPlayer, player, setup, wait } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

const onlineIds = async (c) => (await c.get('/api/players/online')).body.players.map((p) => p.id);

test('a block keeps two players apart, both ways, and says nothing about it', async () => {
  const [ann, bob, cat] = await Promise.all([player(t.app), player(t.app), player(t.app)]);
  await ann.post('/api/friends', { id: bob.user.id });
  const [a, b, c] = await Promise.all([live(t.app, ann), live(t.app, bob), live(t.app, cat)]);

  assert.equal((await bob.post('/api/blocks', { id: ann.user.id })).status, 204);
  assert.deepEqual(
    (await bob.get('/api/blocks')).body.blocked.map((p) => p.id),
    [ann.user.id],
  );
  assert.equal((await ann.get('/api/friends')).body.friends.length, 0, 'no longer friends');

  // Invitations, either way
  a.send({ t: 'invite', to: bob.user.id });
  assert.equal((await a.next('error')).message, "That player isn't available.");
  b.send({ t: 'invite', to: ann.user.id });
  assert.equal((await b.next('error')).message, "That player isn't available.");
  assert.equal((await ann.post('/api/friends', { id: bob.user.id })).status, 400);

  // The lobby, either way (others still see both)
  assert.ok(!(await onlineIds(ann)).includes(bob.user.id));
  assert.ok(!(await onlineIds(bob)).includes(ann.user.id));
  assert.ok((await onlineIds(cat)).includes(ann.user.id));

  // Quick match never pairs them
  const mm = t.app.ctx.matchmaking;
  const me = (p) => ({ id: p.user.id, username: p.user.username, country: p.user.country });
  assert.deepEqual(await mm.join(me(ann)), { waiting: true });
  assert.deepEqual(await mm.join(me(bob)), { waiting: true }, 'not paired with Ann');
  const paired = await mm.join(me(cat));
  assert.ok(paired.match, 'Cat is paired with one of them');
  await mm.leave(ann.user.id);
  await mm.leave(bob.user.id);

  // Unblocked: back to normal
  assert.equal((await bob.request('DELETE', `/api/blocks/${ann.user.id}`)).status, 204);
  await wait(20);
  assert.ok((await onlineIds(ann)).includes(bob.user.id));
  await Promise.all([a.close(), b.close(), c.close()]);
});

test('reports are kept, with a reason; nonsense is refused', async () => {
  const [ann, bob] = await Promise.all([player(t.app), player(t.app)]);
  const ok = await ann.post('/api/reports', {
    id: bob.user.id,
    reason: 'username',
    details: '  rude  ',
  });
  assert.equal(ok.status, 201);
  const { rows } = await t.db.query('SELECT * FROM reports WHERE reported_id = $1', [bob.user.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, 'username');
  assert.equal(rows[0].details, 'rude');
  assert.equal(Number(rows[0].reporter_id), ann.user.id);

  assert.equal((await ann.post('/api/reports', { id: bob.user.id, reason: 'boring' })).status, 400);
  assert.equal((await ann.post('/api/reports', { id: ann.user.id, reason: 'other' })).status, 400);
  assert.equal((await ann.post('/api/reports', { id: 999999, reason: 'other' })).status, 400);
  assert.equal(
    (await client(t.app).post('/api/reports', { id: bob.user.id, reason: 'other' })).status,
    401,
  );
});

test('offensive and reserved usernames are refused at sign-up and on rename', async () => {
  const bad = await client(t.app).post('/api/account', newPlayer({ username: 'Sh1t_Head' }));
  assert.equal(bad.status, 400);
  assert.match(bad.body.fields.username, /isn't allowed/);
  const ann = await player(t.app);
  const rename = await ann.patch('/api/me', { username: 'Admin_Ann' });
  assert.equal(rename.status, 400);
  assert.match(rename.body.fields.username, /reserved/);
});
