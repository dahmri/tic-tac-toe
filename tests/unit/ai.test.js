import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winner, empties, emptyBoard } from '../../js/rules.js';
import { bestMove, casualMove, findWinningMove } from '../../js/ai.js';

const parse = (s) => [...s].map((c) => (c === '.' ? null : c));
const first = () => 0;

test('findWinningMove spots an open line', () => {
  assert.equal(findWinningMove(parse('OO.XX....'), 'O'), 2);
  assert.equal(findWinningMove(parse('X........'), 'O'), -1);
});

test('unbeatable takes a win over a block', () => {
  assert.equal(bestMove(parse('OO.XX....'), 'O', first), 2);
});

test('unbeatable blocks a threat', () => {
  assert.equal(bestMove(parse('XX..O....'), 'O', first), 2);
});

test('casual always takes a win', () => {
  assert.equal(
    casualMove(parse('OO.XX....'), 'O', () => 0.99),
    2,
  );
});

test('casual blocks when the roll allows it', () => {
  assert.equal(
    casualMove(parse('XX..O....'), 'O', () => 0),
    2,
  );
});

// Play every possible sequence of human (X) moves against the unbeatable
// computer (O), with either side opening. O must never lose.
function explore(board, toMove, counts) {
  const w = winner(board);
  if (w) {
    counts[w.p]++;
    return;
  }
  if (toMove === 'O') {
    const b = board.slice();
    b[bestMove(b, 'O', first)] = 'O';
    explore(b, 'X', counts);
  } else {
    for (const i of empties(board)) {
      const b = board.slice();
      b[i] = 'X';
      explore(b, 'O', counts);
    }
  }
}

test('unbeatable never loses, whoever starts', () => {
  for (const starter of ['X', 'O']) {
    const counts = { X: 0, O: 0, D: 0 };
    explore(emptyBoard(), starter, counts);
    assert.equal(counts.X, 0, `X won ${counts.X} games when ${starter} started`);
    assert.ok(counts.O + counts.D > 0);
  }
});
