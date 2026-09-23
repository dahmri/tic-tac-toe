import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, live, player, setup, wait } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

// Starts a match: `x` invites `o`
async function match(x, o) {
  const a = await live(t.app, x);
  const b = await live(t.app, o);
  a.send({ t: 'invite', to: o.user.id });
  const { invite } = await b.next('invite');
  b.send({ t: 'invite-accept', id: invite.id });
  const [{ match: m }] = await Promise.all([a.next('match'), b.next('match')]);
  const socketFor = { [x.user.id]: a, [o.user.id]: b };
  let current = m;
  return {
    id: m.id,
    a,
    b,
    // Plays squares in order; whoever's turn it is moves
    async play(squares) {
      for (const square of squares) {
        const mover = socketFor[current.players[current.turn].id];
        mover.send({ t: 'move', match: m.id, square });
        const [next] = await Promise.all([a.next('match'), b.next('match')]);
        current = next.match;
      }
      return current;
    },
    async nextRound() {
      a.send({ t: 'next-round', match: m.id });
      const [next] = await Promise.all([a.next('match'), b.next('match')]);
      current = next.match;
    },
    close: () => Promise.all([a.close(), b.close()]),
  };
}

const TOP_ROW_FOR_STARTER = [0, 3, 1, 4, 2]; // whoever opens the round wins it
const DRAW = [0, 1, 2, 4, 3, 5, 7, 6, 8];

test('online rounds are recorded for both players, with head-to-head totals', async () => {
  const ann = await player(t.app);
  const bob = await player(t.app, { country: 'MA' });
  const m = await match(ann, bob);

  await m.play(TOP_ROW_FOR_STARTER); // round 1: Ann (X) opens and wins
  await m.nextRound();
  await m.play(TOP_ROW_FOR_STARTER); // round 2: Bob (O) opens and wins
  await m.nextRound();
  await m.play(DRAW); // round 3: draw
  await m.close();
  await wait(50);

  const a = (await ann.get('/api/me/stats')).body;
  assert.deepEqual(
    {
      played: a.stats.online.played,
      won: a.stats.online.won,
      lost: a.stats.online.lost,
      drawn: a.stats.online.drawn,
      winRate: a.stats.online.winRate,
    },
    { played: 3, won: 1, lost: 1, drawn: 1, winRate: 33 },
  );
  assert.equal(a.stats.online.asX.played, 3);
  assert.equal(a.stats.online.asX.won, 1);
  assert.equal(a.stats.online.fastestWin, 5);
  assert.equal(a.opponents.total, 1);
  assert.deepEqual(
    { ...a.opponents.top[0], lastPlayedAt: undefined },
    {
      id: bob.user.id,
      username: bob.user.username,
      country: 'MA',
      played: 3,
      won: 1,
      lost: 1,
      drawn: 1,
      lastPlayedAt: undefined,
    },
  );

  const b = (await bob.get('/api/me/stats')).body;
  assert.equal(b.stats.online.asO.played, 3);
  assert.equal(b.stats.online.won, 1);
  assert.equal(b.opponents.top[0].username, ann.user.username);

  // History: newest first, from each player's side
  const h = (await ann.get('/api/me/games')).body;
  assert.deepEqual(
    h.games.map((g) => g.outcome),
    ['D', 'L', 'W'],
  );
  assert.equal(h.games[2].opponent.username, bob.user.username);
  assert.equal(h.games[2].symbol, 'X');
  assert.equal(h.games[2].moves, 5);
  assert.equal(h.next, null);
  assert.equal(h.games[0].opponent.firstName, undefined, 'no personal data');
});

test('win streaks count online wins in a row', async () => {
  const ann = await player(t.app);
  const bob = await player(t.app);
  const m = await match(ann, bob);
  // Ann opens rounds 1 and 3 and wins them; round 2 Bob opens, Ann lets him win
  await m.play(TOP_ROW_FOR_STARTER);
  await m.nextRound();
  await m.play([0, 3, 1, 4, 2]); // Bob wins round 2
  await m.nextRound();
  await m.play(TOP_ROW_FOR_STARTER); // Ann wins
  await m.nextRound();
  // Round 4: Bob opens; Ann wins with the middle column
  await m.play([0, 4, 3, 1, 8, 7]);
  await m.close();
  await wait(50);
  const s = (await ann.get('/api/me/stats')).body.stats.online;
  assert.equal(s.won, 3);
  assert.equal(s.currentStreak, 2);
  assert.equal(s.bestStreak, 2);
  const bs = (await bob.get('/api/me/stats')).body.stats.online;
  assert.equal(bs.currentStreak, 0);
  assert.equal(bs.bestStreak, 1);
});

test('leaving mid-round records a forfeit', async () => {
  const ann = await player(t.app);
  const bob = await player(t.app);
  const m = await match(ann, bob);
  await m.play([4]);
  m.a.send({ t: 'leave', match: m.id });
  await Promise.all([m.a.next('match'), m.b.next('match')]);
  await m.close();
  await wait(50);
  const b = (await bob.get('/api/me/stats')).body.stats.online;
  assert.equal(b.won, 1);
  assert.equal(b.winsByForfeit, 1);
  assert.equal(b.fastestWin, null, 'a walkover is not a fast win');
  const a = (await ann.get('/api/me/stats')).body.stats.online;
  assert.equal(a.lossesByForfeit, 1);
  assert.equal((await ann.get('/api/me/games')).body.games[0].forfeit, true);
});

test('a round is recorded once, even if recording is retried', async () => {
  const ann = await player(t.app);
  const bob = await player(t.app);
  const round = {
    mode: 'online',
    matchId: '00000000-0000-4000-8000-000000000001',
    round: 1,
    xId: ann.user.id,
    oId: bob.user.id,
    result: 'X',
    forfeit: false,
    moves: [0, 3, 1, 4, 2],
    startedAt: Date.now() - 5000,
    endedAt: Date.now(),
  };
  assert.ok(await t.app.ctx.stats.record(round));
  assert.equal(await t.app.ctx.stats.record(round), null);
  assert.equal((await ann.get('/api/me/stats')).body.stats.online.played, 1);
});

test('rounds that fail to save are retried from Redis', async () => {
  const ann = await player(t.app);
  const bob = await player(t.app);
  const round = {
    mode: 'online',
    matchId: '00000000-0000-4000-8000-000000000002',
    round: 1,
    xId: ann.user.id,
    oId: bob.user.id,
    result: 'O',
    forfeit: false,
    moves: [0, 3, 1, 4, 8, 5],
    startedAt: Date.now() - 5000,
    endedAt: Date.now(),
  };
  await t.redis.rpush('stats:retry', JSON.stringify(round));
  await t.app.ctx.stats.retryPending();
  assert.equal(await t.redis.llen('stats:retry'), 0);
  assert.equal((await bob.get('/api/me/stats')).body.stats.online.won, 1);
});

test('games against the computer are checked, then counted separately', async () => {
  const ann = await player(t.app);
  const ok = await ann.post('/api/games/cpu', {
    difficulty: 'casual',
    starter: 'X',
    moves: [0, 3, 1, 4, 2],
    seconds: 12,
    result: 'O', // ignored: the server works it out
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.result, 'X');

  const fake = await ann.post('/api/games/cpu', {
    difficulty: 'hard',
    starter: 'X',
    moves: [0, 8, 1, 7, 2],
    seconds: 5,
  });
  assert.equal(fake.status, 400);

  const s = (await ann.get('/api/me/stats')).body.stats;
  assert.deepEqual(s.computer, {
    played: 1,
    won: 1,
    lost: 0,
    drawn: 0,
    unbeatable: { played: 0, drawn: 0 },
  });
  assert.equal(s.online.played, 0, 'computer games are not online games');
  const [g] = (await ann.get('/api/me/games')).body.games;
  assert.equal(g.mode, 'cpu');
  assert.equal(g.opponent, null);
  assert.equal(g.difficulty, 'casual');
  assert.equal(g.seconds, 12);
});

test('history pages through games with a cursor', async () => {
  const ann = await player(t.app);
  for (let i = 0; i < 5; i++) {
    await ann.post('/api/games/cpu', {
      difficulty: 'casual',
      starter: 'X',
      moves: [0, 3, 1, 4, 2],
    });
  }
  const p1 = (await ann.get('/api/me/games?limit=2')).body;
  const p2 = (await ann.get(`/api/me/games?limit=2&cursor=${p1.next}`)).body;
  const p3 = (await ann.get(`/api/me/games?limit=2&cursor=${p2.next}`)).body;
  const ids = [...p1.games, ...p2.games, ...p3.games].map((g) => g.id);
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
  assert.deepEqual(
    ids,
    [...ids].sort((x, y) => y - x),
  );
  assert.equal(p3.next, null);
});

test('a new player has empty stats; stats need a session', async () => {
  const ann = await player(t.app);
  const s = (await ann.get('/api/me/stats')).body;
  assert.equal(s.stats.online.played, 0);
  assert.equal(s.stats.online.winRate, null);
  assert.deepEqual(s.opponents, { total: 0, top: [] });
  assert.equal((await client(t.app).get('/api/me/stats')).status, 401);
  assert.equal((await client(t.app).get('/api/me/games')).status, 401);
});
