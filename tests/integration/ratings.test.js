import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, live, player, setup, startMatch, wait } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

const X_WINS = [0, 3, 1, 4, 2]; // the player who opens the round wins it
const DRAW = [0, 1, 2, 4, 3, 5, 7, 6, 8];
const board = (c, query = '') => c.get(`/api/leaderboard${query}`);

test('an online win moves both ratings, and both players hear about it', async () => {
  const ann = await player(t.app);
  const bob = await player(t.app);
  const m = await startMatch(t.app, ann, bob);
  assert.equal(m.a.hello.me.rating, 1200);

  await m.play(X_WINS);
  const [fromA, fromB] = await Promise.all([m.a.next('ratings'), m.b.next('ratings')]);
  assert.deepEqual(fromA, fromB);
  assert.equal(fromA.match, m.id);
  assert.equal(fromA.round, 1);
  assert.deepEqual(fromA.ratings, {
    [ann.user.id]: { rating: 1216, change: 16 },
    [bob.user.id]: { rating: 1184, change: -16 },
  });

  // A draw between unequal players moves the weaker one up
  await m.nextRound();
  await m.play(DRAW);
  const { ratings } = await m.a.next('ratings');
  assert.ok(ratings[bob.user.id].change > 0);
  assert.equal(ratings[ann.user.id].change, -ratings[bob.user.id].change);
  await m.close();
  await wait(50);

  const a = (await ann.get('/api/me/stats')).body.stats;
  assert.equal(a.rating, 1216 + ratings[ann.user.id].change);
  assert.equal(a.peakRating, 1216);
  const [draw, win] = (await ann.get('/api/me/games')).body.games;
  assert.equal(win.ratingChange, 16);
  assert.equal(draw.ratingChange, ratings[ann.user.id].change);
});

test('games against the computer never change the rating', async () => {
  const ann = await player(t.app);
  await ann.post('/api/games/cpu', { difficulty: 'casual', starter: 'X', moves: X_WINS });
  const s = (await ann.get('/api/me/stats')).body.stats;
  assert.equal(s.rating, 1200);
  assert.equal(s.rank, null, 'only online players are ranked');
  assert.equal((await ann.get('/api/me/games')).body.games[0].ratingChange, null);
});

test('the leaderboard ranks players, for the world or one country', async () => {
  // Iceland and New Zealand keep this test's players apart from the others
  const top = await player(t.app, { country: 'IS' });
  const mid = await player(t.app, { country: 'IS' });
  const low = await player(t.app, { country: 'NZ' });
  const idle = await player(t.app, { country: 'IS' });

  let m = await startMatch(t.app, top, mid);
  await m.play(X_WINS); // top 1216, mid 1184
  await m.leave();
  await m.close();
  m = await startMatch(t.app, mid, low);
  await m.play(X_WINS); // mid wins against low
  await m.leave();
  await m.close();
  await wait(50);

  const iceland = (await board(top, '?country=is')).body;
  assert.deepEqual(
    iceland.players.map((p) => [p.rank, p.username]),
    [
      [1, top.user.username],
      [2, mid.user.username],
    ],
  );
  assert.equal(iceland.total, 2, 'players who never played online are not ranked');
  assert.deepEqual(Object.keys(iceland.players[0]).sort(), [
    'country',
    'id',
    'played',
    'rank',
    'rating',
    'username',
    'won',
  ]);
  assert.equal(iceland.me.rank, 1);
  assert.equal(iceland.me.rating, 1216);
  assert.equal((await board(mid, '?country=IS')).body.me.rank, 2);
  assert.equal((await board(idle, '?country=IS')).body.me, null);
  assert.equal((await board(low, '?country=IS')).body.me, null, 'not on another country board');

  // The world board agrees with each player's rank in their stats
  const world = (await board(top, '?limit=50')).body;
  const mine = world.players.find((p) => p.id === low.user.id);
  const lowStats = (await low.get('/api/me/stats')).body.stats;
  assert.equal(mine.rank, lowStats.rank);
  assert.equal((await board(low)).body.me.rank, lowStats.rank);
  const ratings = world.players.map((p) => p.rating);
  assert.deepEqual(
    ratings,
    [...ratings].sort((a, b) => b - a),
  );

  // Paging
  const page2 = (await board(top, '?limit=1&offset=1')).body;
  assert.equal(page2.players.length, 1);
  assert.equal(page2.players[0].rank, 2);

  assert.equal((await board(top, '?country=ZZ')).status, 400);
  assert.equal((await board(client(t.app))).status, 401);
});

test('online players and new matches show the latest rating', async () => {
  const ann = await player(t.app);
  const bob = await player(t.app);
  const m = await startMatch(t.app, ann, bob);
  await m.play(X_WINS);
  await m.a.next('ratings');
  await m.leave();

  const viewer = await player(t.app);
  const listed = (await viewer.get('/api/players/online?limit=50')).body.players;
  assert.equal(listed.find((p) => p.id === ann.user.id).rating, 1216);
  assert.equal(listed.find((p) => p.id === bob.user.id).rating, 1184);

  // The same connections start a new match: the match has the new ratings
  m.a.send({ t: 'invite', to: bob.user.id });
  const { invite } = await m.b.next('invite');
  assert.equal(invite.from.rating, 1216);
  m.b.send({ t: 'invite-accept', id: invite.id });
  const { match } = await m.a.next('match');
  assert.equal(match.players.X.rating, 1216);
  assert.equal(match.players.O.rating, 1184);
  await m.close();

  // A fresh connection starts with the stored rating
  const again = await live(t.app, ann);
  assert.equal(again.hello.me.rating, 1216);
  await again.close();
});
