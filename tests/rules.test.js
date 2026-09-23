import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winner, empties, emptyBoard, other, LINES } from '../js/rules.js';

const parse = s => [...s].map(c => (c === '.' ? null : c));

test('empty board has no result', () => {
  assert.equal(winner(emptyBoard()), null);
});

test('detects every winning line', () => {
  for (const line of LINES) {
    const b = emptyBoard();
    line.forEach(i => { b[i] = 'O'; });
    assert.deepEqual(winner(b), { p: 'O', line });
  }
});

test('full board with no line is a draw', () => {
  assert.deepEqual(winner(parse('XOXXOOOXX')), { p: 'D' });
});

test('a win on the last square beats a draw', () => {
  assert.equal(winner(parse('XOXOXOOXX')).p, 'X');
});

test('empties lists open squares in order', () => {
  assert.deepEqual(empties(parse('X.O.X....')), [1, 3, 5, 6, 7, 8]);
});

test('other swaps players', () => {
  assert.equal(other('X'), 'O');
  assert.equal(other('O'), 'X');
});
