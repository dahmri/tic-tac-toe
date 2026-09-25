import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { live, player, setup, startMatch } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

test('a spectator sees the match move by move, and the players see the count', async () => {
  const [ann, bob, cat] = await Promise.all([player(t.app), player(t.app), player(t.app)]);
  const m = await startMatch(t.app, ann, bob);
  const c = await live(t.app, cat);

  c.send({ t: 'watch', user: bob.user.id });
  const watching = await c.next('watching');
  assert.equal(watching.match.id, m.id);
  assert.equal(watching.count, 1);
  assert.equal((await m.a.next('watchers')).count, 1);
  assert.equal((await m.b.next('watchers')).count, 1);

  await m.play([4]);
  const seen = await c.next('watched');
  assert.equal(seen.match.board[4], 'X');
  assert.ok(seen.match.turnLeft > 0);

  // Reactions reach spectators too
  m.a.send({ t: 'react', match: m.id, emoji: '👏' });
  assert.equal((await c.next('reaction')).emoji, '👏');

  c.send({ t: 'unwatch' });
  assert.equal((await m.a.next('watchers')).count, 0);
  await m.play([0]);
  await assert.rejects(c.next('watched', 300), 'no more updates');
  await c.close();
  await m.leave();
  await m.close();
});

test('refused: no game, your own game, and players who blocked you', async () => {
  const [ann, bob, cat] = await Promise.all([player(t.app), player(t.app), player(t.app)]);
  const c = await live(t.app, cat);
  c.send({ t: 'watch', user: ann.user.id });
  assert.equal((await c.next('error')).message, 'That game has ended.');

  const m = await startMatch(t.app, ann, bob);
  m.a.send({ t: 'watch', user: bob.user.id });
  assert.equal((await m.a.next('error')).message, "You're playing this game.");

  await ann.post('/api/blocks', { id: cat.user.id });
  c.send({ t: 'watch', user: bob.user.id });
  assert.equal((await c.next('error')).message, "That game isn't available.");
  await c.close();
  await m.leave();
  await m.close();
});
