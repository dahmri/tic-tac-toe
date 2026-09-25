import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mistakes, outcome } from '../../js/analysis.js';
import { emptyBoard } from '../../js/rules.js';

test('the empty board is a draw with best play', () => {
  assert.equal(outcome(emptyBoard(), 'X', 'X'), 0);
});

test('finds the move that lost the game, and the one that would have held', () => {
  // X 4 (centre), O 1 (an edge: a mistake that loses), X 0, O 8 (forced), X 6 (fork), ...
  const game = { squares: [4, 1, 0, 8, 6, 3, 2], starter: 'X' };
  const o = mistakes({ ...game, symbol: 'O' });
  assert.equal(o[0].move, 1);
  assert.equal(o[0].played, 1);
  assert.deepEqual(o[0].best.sort(), [0, 2, 6, 8], 'a corner holds the draw');
  assert.equal(o[0].from, 'draw');
  assert.equal(o[0].to, 'loss');
  assert.deepEqual(mistakes({ ...game, symbol: 'X' }), [], 'X played perfectly');
});

test('missing a win counts too', () => {
  // X 0, O 3, X 1, O 4: X could win at 2 but plays 8; O then wins at 5
  const m = mistakes({ squares: [0, 3, 1, 4, 8, 5], starter: 'X', symbol: 'X' });
  assert.equal(m[0].move, 4);
  assert.deepEqual(m[0].best, [2]);
  assert.equal(m[0].from, 'win');
  assert.equal(m[0].to, 'loss');
});
