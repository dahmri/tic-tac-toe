import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, live, player, setup, wait } from './helpers.js';
import { arenaAt, previousArena } from '../../js/arena.js';

let t;
before(async () => {
  t = await setup({ ARENA_ALWAYS: 'on', ARENA_REST_MS: '50', ARENA_SWEEP_MS: '0' });
  await t.db.query('TRUNCATE arena_players');
});
after(() => t.close());

// One sweep, as the server runs every couple of seconds
async function sweep(now) {
  await t.redis.del('arena:sweep');
  return t.app.ctx.arena.sweep(now);
}

// Plays squares in turn in an arena game, as whoever's move it is
async function play(conns, match, squares) {
  let current = match;
  for (const square of squares) {
    const mover = conns.get(current.players[current.turn].id);
    mover.send({ t: 'move', match: match.id, square });
    const updates = await Promise.all([...conns.values()].map((c) => c.next('match')));
    current = updates[0].match;
  }
  return current;
}

test('the arena pairs players, scores games, and pairs them again', async () => {
  const [ann, bob] = await Promise.all([player(t.app), player(t.app)]);
  const a = await live(t.app, ann);
  const b = await live(t.app, bob);

  // Guests can look; players join
  const look = (await client(t.app).get('/api/arena')).body;
  assert.equal(look.arena.running, true);
  assert.equal(look.me, null);
  a.send({ t: 'arena-join' });
  b.send({ t: 'arena-join' });
  await Promise.all([a.next('arena'), b.next('arena')]);
  assert.equal((await ann.get('/api/arena')).body.me.in, true);

  assert.equal(await sweep(), 1, 'one pairing');
  const [{ match }] = await Promise.all([a.next('match'), b.next('match')]);
  assert.ok(match.arena);
  const conns = new Map([
    [ann.user.id, a],
    [bob.user.id, b],
  ]);
  const winner = match.players.X.id;
  const over = await play(
    new Map([
      [match.players.X.id, conns.get(match.players.X.id)],
      [match.players.O.id, conns.get(match.players.O.id)],
    ]),
    match,
    [0, 3, 1, 4, 2],
  );
  assert.equal(over.over, true);

  // No next round in the arena
  conns.get(winner).send({ t: 'next-round', match: match.id });
  const refused = await conns.get(winner).next('error');
  assert.equal(refused.message, 'In the arena, your next opponent is found for you.');

  await wait(100);
  const board = (await ann.get('/api/arena')).body;
  assert.deepEqual(
    board.players.map((p) => [p.id, p.points, p.played, p.won]),
    [
      [winner, 2, 1, 1],
      [winner === ann.user.id ? bob.user.id : ann.user.id, 0, 1, 0],
    ],
  );
  assert.equal(board.me.rank, winner === ann.user.id ? 1 : 2);

  // A sweep closes the game; after a breather in the lobby, the next pairs
  // them again (nobody else is waiting)
  assert.equal(await sweep(Date.now() + 1000), 0, 'not straight away');
  const closed = await a.next('match');
  assert.equal(closed.match.ended, true);
  assert.equal(closed.match.leftBy, undefined);
  await b.next('match');
  await wait(100);
  assert.equal(await sweep(), 1);
  const [{ match: again }] = await Promise.all([a.next('match'), b.next('match')]);
  assert.notEqual(again.id, match.id);

  // Pausing: out of the pairings, still on the board
  a.send({ t: 'leave', match: again.id });
  await Promise.all([a.next('match'), b.next('match')]);
  a.send({ t: 'arena-pause' });
  await a.next('arena');
  await wait(100);
  assert.equal(await sweep(), 0);
  assert.equal((await ann.get('/api/arena')).body.me.in, false);
  await Promise.all([a.close(), b.close()]);
});

test('the arena prefers a new opponent to the last one', async () => {
  await t.db.query('TRUNCATE arena_players');
  const ps = await Promise.all([1, 2, 3, 4].map(() => player(t.app)));
  const conns = await Promise.all(ps.map((p) => live(t.app, p)));
  const arena = t.app.ctx.arena.current();
  await t.redis.del(`arena:${arena.id}:in`); // the last test's players
  // Everyone even on points; 1 last played 2, and 3 last played 4
  await t.redis.set(`arena:${arena.id}:last:${ps[0].user.id}`, ps[1].user.id);
  await t.redis.set(`arena:${arena.id}:last:${ps[1].user.id}`, ps[0].user.id);
  await t.redis.set(`arena:${arena.id}:last:${ps[2].user.id}`, ps[3].user.id);
  await t.redis.set(`arena:${arena.id}:last:${ps[3].user.id}`, ps[2].user.id);
  for (const c of conns) c.send({ t: 'arena-join' });
  await Promise.all(conns.map((c) => c.next('arena')));
  assert.equal(await sweep(), 2);
  const matches = await Promise.all(conns.map((c) => c.next('match')));
  for (const { match } of matches) {
    const pair = [match.players.X.id, match.players.O.id].sort().join();
    assert.notEqual(pair, [ps[0].user.id, ps[1].user.id].sort().join());
    assert.notEqual(pair, [ps[2].user.id, ps[3].user.id].sort().join());
  }
  await Promise.all(conns.map((c) => c.close()));
});

test('outside its hours the arena is closed', async () => {
  const saturday = Date.UTC(2026, 8, 26, 19, 0); // Saturday 26 September, 19:00 UTC
  assert.deepEqual(arenaAt(saturday), {
    id: '2026-09-26',
    startsAt: Date.UTC(2026, 8, 26, 18),
    endsAt: Date.UTC(2026, 8, 26, 20),
    running: true,
  });
  const after = arenaAt(Date.UTC(2026, 8, 26, 20, 0));
  assert.equal(after.id, '2026-10-03', 'the next one, a week later');
  assert.equal(after.running, false);
  assert.equal(arenaAt(Date.UTC(2026, 8, 24, 12)).id, '2026-09-26', 'a Thursday: this Saturday');
  assert.equal(previousArena(after), '2026-09-26');

  const closed = await setup({ ARENA_ALWAYS: '', ARENA_SWEEP_MS: '0' });
  try {
    const ann = await player(closed.app);
    await assert.rejects(
      closed.app.ctx.arena.join(ann.user.id, Date.UTC(2026, 8, 24, 12)),
      /closed right now/,
    );
  } finally {
    await closed.close();
  }
});
