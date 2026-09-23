import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stateMessage, parseState, parseMove } from '../../js/protocol.js';

const game = () => ({
  board: ['X', null, 'O', null, 'X', null, null, null, null],
  turn: 'O',
  over: false,
  scores: { X: 2, O: 1, D: 3 },
  starter: 'X',
});

test('state survives a round trip', () => {
  const g = game();
  assert.deepEqual(parseState(stateMessage(g)), g);
});

test('state message is a copy, not shared with the game', () => {
  const g = game();
  const msg = stateMessage(g);
  g.board[1] = 'O';
  g.scores.X = 99;
  assert.equal(msg.board[1], null);
  assert.equal(msg.scores.X, 2);
});

test('malformed state is rejected', () => {
  const bad = [
    null,
    { type: 'move' },
    { ...stateMessage(game()), board: Array(8).fill(null) },
    { ...stateMessage(game()), board: ['Z', ...Array(8).fill(null)] },
    { ...stateMessage(game()), turn: 'Q' },
    { ...stateMessage(game()), over: 'no' },
    { ...stateMessage(game()), scores: { X: -1, O: 0, D: 0 } },
    { ...stateMessage(game()), scores: { X: 1, O: 0 } },
  ];
  for (const msg of bad) assert.equal(parseState(msg), null, JSON.stringify(msg));
});

test('parsed state drops unexpected fields', () => {
  const parsed = parseState({ ...stateMessage(game()), extra: '<script>' });
  assert.equal('extra' in parsed, false);
});

test('parseMove accepts only real squares', () => {
  assert.equal(parseMove({ type: 'move', i: 0 }), 0);
  assert.equal(parseMove({ type: 'move', i: 8 }), 8);
  assert.equal(parseMove({ type: 'move', i: 9 }), -1);
  assert.equal(parseMove({ type: 'move', i: -1 }), -1);
  assert.equal(parseMove({ type: 'move', i: 1.5 }), -1);
  assert.equal(parseMove({ type: 'move', i: '4' }), -1);
  assert.equal(parseMove({ type: 'new-round' }), -1);
  assert.equal(parseMove(null), -1);
});
