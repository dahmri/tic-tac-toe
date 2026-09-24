import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, player, setup, startMatch } from './helpers.js';
import { ACHIEVEMENTS } from '../../js/achievements.js';
import { pickMove } from '../../js/ai.js';
import { emptyBoard, winner } from '../../js/rules.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

const earned = async (c) => {
  const { achievements } = (await c.get('/api/me/achievements')).body;
  return Object.fromEntries(achievements.map((a) => [a.id, a]));
};

test('a new player has none, with progress where there is a goal', async () => {
  const ann = await player(t.app);
  const a = await earned(ann);
  assert.equal(Object.keys(a).length, ACHIEVEMENTS.length);
  assert.ok(Object.values(a).every((x) => !x.earned));
  assert.deepEqual(a.games_100, { id: 'games_100', earned: false, count: 0 });
  assert.equal((await client(t.app).get('/api/me/achievements')).status, 401);
});

test('earned from games, friends and the computer', async () => {
  const [ann, bob] = await Promise.all([player(t.app), player(t.app)]);
  const m = await startMatch(t.app, ann, bob);
  await m.play([0, 3, 1, 4, 2]); // Ann wins online
  await m.leave();
  await m.close();
  // Bob holds Unbeatable to a draw (a real one: the server checks it)
  const board = emptyBoard();
  const moves = [];
  let turn = 'X';
  while (!winner(board)) {
    const i = pickMove(board, turn, 'hard');
    board[i] = turn;
    moves.push(i);
    turn = turn === 'X' ? 'O' : 'X';
  }
  await bob.post('/api/games/cpu', { difficulty: 'hard', starter: 'X', moves, seconds: 30 });

  const a = await earned(ann);
  assert.equal(a.first_win.earned, true);
  assert.equal(a.online_win.earned, true);
  assert.deepEqual(a.streak_3, { id: 'streak_3', earned: false, count: 1 });
  assert.equal(a.games_100.count, 1);
  const b = await earned(bob);
  assert.equal(b.unbeatable_draw.earned, true);
  assert.equal(b.first_win.earned, false);

  for (let i = 0; i < 5; i++) {
    const friend = await player(t.app);
    await ann.post('/api/friends', { id: friend.user.id });
  }
  assert.equal((await earned(ann)).friends_5.earned, true);
});
