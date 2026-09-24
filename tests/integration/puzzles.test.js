import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, player, setup } from './helpers.js';
import { defend, puzzleFor } from '../../js/puzzle.js';
import { winner } from '../../js/rules.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

const today = new Date().toISOString().slice(0, 10);

// A winning attempt at `day`'s puzzle
function solve(day) {
  const p = puzzleFor(day);
  const b = p.board.slice();
  const first = p.solutions[0];
  b[first] = 'X';
  const reply = defend(b);
  b[reply] = 'O';
  const second = b.findIndex(
    (v, i) => !v && winner(Object.assign(b.slice(), { [i]: 'X' }))?.p === 'X',
  );
  return [first, reply, second];
}

test('the first try counts, is checked by the server, and builds a streak', async () => {
  const ann = await player(t.app);
  const before = await ann.get(`/api/puzzle?day=${today}`);
  assert.deepEqual(before.body, {
    played: false,
    solved: false,
    streak: 0,
    bestStreak: 0,
    totalSolved: 0,
  });

  const res = await ann.post(`/api/puzzle/${today}`, { moves: solve(today) });
  assert.equal(res.status, 200);
  assert.equal(res.body.attemptSolved, true);
  assert.equal(res.body.streak, 1);

  // Later tries don't change the day's result
  const miss = await ann.post(`/api/puzzle/${today}`, { moves: [0, 1, 2] });
  assert.equal(miss.body.attemptSolved, false);
  assert.equal(miss.body.solved, true);
  assert.equal(miss.body.totalSolved, 1);
});

test('a wrong answer counts as a miss; bad days and moves are refused', async () => {
  const bob = await player(t.app);
  const p = puzzleFor(today);
  const wrong = p.board.findIndex((v, i) => !v && !p.solutions.includes(i));
  const res = await bob.post(`/api/puzzle/${today}`, { moves: [wrong, 0, 1] });
  assert.equal(res.body.attemptSolved, false);
  assert.equal(res.body.played, true);
  assert.equal(res.body.solved, false);

  assert.equal((await bob.post('/api/puzzle/2020-01-01', { moves: [4] })).status, 400);
  assert.equal((await bob.post(`/api/puzzle/${today}`, { moves: ['x'] })).status, 400);
  assert.equal((await bob.post(`/api/puzzle/${today}`, { moves: [9] })).status, 400);
  assert.equal((await client(t.app).get(`/api/puzzle?day=${today}`)).status, 401);
});
