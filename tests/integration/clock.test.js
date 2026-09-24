import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { live, player, setup, startMatch, wait } from './helpers.js';

// A short move clock so the tests don't wait 30 s
let t;
before(async () => {
  t = await setup({ TURN_MS: '400' });
});
after(() => t.close());

test('a player who runs out of time loses the round, and it is recorded', async () => {
  const [ann, bob] = await Promise.all([player(t.app), player(t.app)]);
  const m = await startMatch(t.app, ann, bob);
  const played = await m.play([4]); // Ann (X) plays; now Bob is on the clock
  assert.ok(played.turnLeft > 0 && played.turnLeft <= 400, 'players are told the time left');

  await wait(450);
  await t.app.ctx.matches.sweep();
  const [{ match }] = await Promise.all([m.a.next('match'), m.b.next('match')]);
  assert.equal(match.over, true);
  assert.equal(match.timeout, true);
  assert.equal(match.result, 'X', 'the round goes to the player who was waiting');
  assert.deepEqual(match.score, { X: 1, O: 0, D: 0 });
  assert.equal(match.turnLeft, null, 'no clock between rounds');

  await wait(100);
  const { rows } = await t.db.query('SELECT result, forfeit FROM games WHERE match_id = $1', [
    m.id,
  ]);
  assert.deepEqual(rows, [{ result: 'X', forfeit: true }]);
  await m.leave();
  await m.close();
});

test('a move in time resets the clock, and nothing happens before it runs out', async () => {
  const [ann, bob] = await Promise.all([player(t.app), player(t.app)]);
  const m = await startMatch(t.app, ann, bob);
  await wait(250);
  await m.play([0]);
  await wait(250); // 500 ms since the match started, 250 since the move
  await t.app.ctx.matches.sweep();
  const current = await t.app.ctx.matches.get(m.id);
  assert.equal(current.over, false);
  assert.equal(current.turn, 'O');
  await m.leave();
  await m.close();
});

test('reactions reach both players; unknown ones and strangers are refused', async () => {
  const [ann, bob, cat] = await Promise.all([player(t.app), player(t.app), player(t.app)]);
  const m = await startMatch(t.app, ann, bob);
  m.a.send({ t: 'react', match: m.id, emoji: '😂' });
  const [toAnn, toBob] = await Promise.all([m.a.next('reaction'), m.b.next('reaction')]);
  assert.equal(toBob.emoji, '😂');
  assert.equal(toBob.from, ann.user.id);
  assert.equal(toAnn.match, m.id);

  m.a.send({ t: 'react', match: m.id, emoji: 'hello <b>' });
  assert.equal((await m.a.next('error')).message, 'Unknown reaction.');

  const c = await live(t.app, cat);
  c.send({ t: 'react', match: m.id, emoji: '👍' });
  assert.equal((await c.next('error')).message, 'This game has ended.');

  // Too many at once: extras are dropped silently
  m.b.send({ t: 'react', match: m.id, emoji: '🔥' });
  m.b.send({ t: 'react', match: m.id, emoji: '🔥' });
  await m.a.next('reaction');
  await assert.rejects(m.a.next('reaction', 300));
  await c.close();
  await m.leave();
  await m.close();
});
