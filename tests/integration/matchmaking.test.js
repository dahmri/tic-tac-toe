import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { live, player, setup, wait } from './helpers.js';

let t;
before(async () => {
  t = await setup({ LEAVE_GRACE_MS: '300' });
});
after(() => t.close());

// Gives a player a rating, as if they had played online
async function rate(p, rating) {
  await t.db.query(
    `INSERT INTO player_stats (user_id, rating, played) VALUES ($1, $2, 1)
     ON CONFLICT (user_id) DO UPDATE SET rating = $2`,
    [p.user.id, rating],
  );
}

const waitingFor = async (c) => (await c.next('queue')).waiting;

test('two players looking for a game are paired', async () => {
  const ann = await player(t.app);
  const bob = await player(t.app);
  const a = await live(t.app, ann);
  const b = await live(t.app, bob);
  assert.equal(a.hello.waiting, false);

  a.send({ t: 'queue-join' });
  assert.equal(await waitingFor(a), true);
  b.send({ t: 'queue-join' });
  const [ma, mb] = await Promise.all([a.next('match'), b.next('match')]);
  assert.equal(ma.match.id, mb.match.id);
  const ids = [ma.match.players.X.id, ma.match.players.O.id].sort();
  assert.deepEqual(ids, [ann.user.id, bob.user.id].sort());
  assert.equal(await waitingFor(a), false);
  assert.equal(await waitingFor(b), false);
  assert.equal(await t.app.ctx.matchmaking.isWaiting(ann.user.id), false);
  await Promise.all([a.close(), b.close()]);
});

test('a player can stop looking, and is then never paired', async () => {
  const ann = await player(t.app);
  const bob = await player(t.app);
  const a = await live(t.app, ann);
  const b = await live(t.app, bob);
  a.send({ t: 'queue-join' });
  assert.equal(await waitingFor(a), true);
  a.send({ t: 'queue-leave' });
  assert.equal(await waitingFor(a), false);

  b.send({ t: 'queue-join' });
  assert.equal(await waitingFor(b), true);
  await wait(100);
  assert.ok(!a.queue.some((m) => m.t === 'match'));
  b.send({ t: 'queue-leave' });
  await waitingFor(b);
  await Promise.all([a.close(), b.close()]);
});

test('a reload keeps the search going; closing the game ends it', async () => {
  const ann = await player(t.app);
  const bob = await player(t.app);
  const tab1 = await live(t.app, ann);
  tab1.send({ t: 'queue-join' });
  assert.equal(await waitingFor(tab1), true);
  const tab2 = await live(t.app, ann);
  assert.equal(tab2.hello.waiting, true);
  await tab1.close();
  await tab2.close();
  await wait(50);

  // Between closing the page and opening it again, Ann keeps her place but
  // nobody is paired with her
  const b = await live(t.app, bob);
  b.send({ t: 'queue-join' });
  assert.equal(await waitingFor(b), true);
  const back = await live(t.app, ann);
  assert.equal(back.hello.waiting, true);
  // Now she is back, a search pairs them
  const [m] = await Promise.all([back.next('match'), b.next('match')]);
  assert.ok(m.match.players.X.id === ann.user.id || m.match.players.O.id === ann.user.id);
  assert.equal(await waitingFor(back), false);
  assert.equal(await waitingFor(b), false);
  back.send({ t: 'leave', match: m.match.id });
  await b.next('match');

  // Closing the game for good ends the search after the grace period
  back.send({ t: 'queue-join' });
  assert.equal(await waitingFor(back), true);
  await back.close();
  await wait(50);
  assert.equal(await t.app.ctx.matchmaking.isWaiting(ann.user.id), true, 'in case of a reload');
  await wait(500);
  assert.equal(await t.app.ctx.matchmaking.isWaiting(ann.user.id), false);
  await b.close();
});

test('players are paired by rating, and the gap allowed grows as they wait', async () => {
  const mm = t.app.ctx.matchmaking;
  const [ann, bob, cat] = await Promise.all([player(t.app), player(t.app), player(t.app)]);
  await rate(ann, 1200);
  await rate(bob, 1700);
  await rate(cat, 1260);
  const sockets = await Promise.all([ann, bob, cat].map((p) => live(t.app, p)));
  const me = (p) => ({ id: p.user.id, username: p.user.username, country: p.user.country });
  const now = Date.now();

  assert.deepEqual(await mm.join(me(ann), 'classic', now), { waiting: true });
  assert.deepEqual(await mm.join(me(bob), 'classic', now), { waiting: true }, '500 points apart');
  // 39 s later the gap allowed is 100 + 390 points: still too far
  assert.deepEqual(await mm.retry(me(bob), now + 39_000), { waiting: true });

  // Cat is close to Ann: they are paired, not Bob
  const paired = await mm.join(me(cat), 'classic', now + 39_000);
  assert.ok(paired.match);
  const ids = [paired.match.players.X.id, paired.match.players.O.id];
  assert.ok(ids.includes(ann.user.id) && ids.includes(cat.user.id));
  assert.equal(await mm.isWaiting(ann.user.id), false);

  // After 41 s Bob can be paired with anyone within 510 points
  const dan = await player(t.app);
  await rate(dan, 1690);
  sockets.push(await live(t.app, dan));
  const found = await mm.join(me(dan), 'classic', now + 41_000);
  assert.ok(found.match, 'Bob and Dan are 10 points apart');
  assert.equal(await mm.isWaiting(bob.user.id), false);
  await Promise.all(sockets.map((s) => s.close()));
});

test('players who went offline or are in a game are skipped', async () => {
  const mm = t.app.ctx.matchmaking;
  const [ann, bob, cat] = await Promise.all([player(t.app), player(t.app), player(t.app)]);
  const a = await live(t.app, ann);
  const b = await live(t.app, bob);
  const c = await live(t.app, cat);
  const me = (p) => ({ id: p.user.id, username: p.user.username, country: p.user.country });

  // Ann waits, then her server stops reporting her (a crash): she is dropped
  await mm.join(me(ann));
  await t.redis.zadd('online', Date.now() - 10 * 60_000, ann.user.id);
  assert.deepEqual(await mm.join(me(bob)), { waiting: true });
  assert.equal(await waitingFor(b), true);
  assert.equal(await mm.isWaiting(ann.user.id), false, 'removed from the queue');

  // Bob accepts an invitation while waiting: the search ends
  c.send({ t: 'invite', to: bob.user.id });
  const { invite } = await b.next('invite');
  b.send({ t: 'invite-accept', id: invite.id });
  await b.next('match');
  assert.equal(await waitingFor(b), false);
  assert.equal(await mm.isWaiting(bob.user.id), false);

  // And nobody can look for a game while playing one
  await assert.rejects(mm.join(me(bob)), /Finish your game first/);
  await Promise.all([a.close(), b.close(), c.close()]);
});

test('quick match only pairs players who want the same rules', async () => {
  const mm = t.app.ctx.matchmaking;
  const [ann, bob, cat] = await Promise.all([player(t.app), player(t.app), player(t.app)]);
  const sockets = await Promise.all([ann, bob, cat].map((p) => live(t.app, p)));
  const me = (p) => ({ id: p.user.id, username: p.user.username, country: p.user.country });

  assert.deepEqual(await mm.join(me(ann), 'vanish'), { waiting: true });
  assert.deepEqual(await mm.join(me(bob), 'classic'), { waiting: true }, 'different rules');
  const paired = await mm.join(me(cat), 'vanish');
  assert.equal(paired.match.variant, 'vanish');
  const ids = [paired.match.players.X.id, paired.match.players.O.id];
  assert.ok(ids.includes(ann.user.id) && ids.includes(cat.user.id));
  assert.equal(await mm.isWaiting(bob.user.id), true);
  await assert.rejects(mm.join(me(bob), 'chess'), /Unknown rules/);
  await mm.leave(bob.user.id);
  assert.equal(await mm.isWaiting(bob.user.id), false);
  await Promise.all(sockets.map((s) => s.close()));
});
