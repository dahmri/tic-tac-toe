import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyUltimate,
  isLegal,
  legalMoves,
  pickUltimateMove,
  playUltimate,
  replayUltimate,
} from '../../js/ultimate.js';

test('the first move is free; then the square sends the opponent to that board', () => {
  const start = emptyUltimate();
  assert.equal(legalMoves(start).length, 81);
  const pos = playUltimate(start, 4 * 9 + 2); // centre board, top-right square
  assert.equal(pos.turn, 'O');
  assert.equal(pos.active, 2);
  assert.ok(isLegal(pos, 2 * 9 + 5));
  assert.ok(!isLegal(pos, 4 * 9 + 0), 'must play on board 2');
  assert.ok(!isLegal(pos, 4 * 9 + 2), 'taken');
  assert.deepEqual(
    legalMoves(pos),
    Array.from({ length: 9 }, (_, c) => 18 + c),
  );
});

test('winning a small board; being sent to a decided board frees the choice', () => {
  // Square by square, checking the rules as they apply
  let pos = emptyUltimate();
  const play = (sq) => {
    assert.ok(isLegal(pos, sq), `legal: ${sq}`);
    pos = playUltimate(pos, sq);
  };
  play(0 * 9 + 1); // X on board 0, sends O to board 1
  play(1 * 9 + 0); // O on board 1, sends X to board 0
  play(0 * 9 + 2); // X, sends O to 2
  play(2 * 9 + 0); // O, sends X to 0
  play(0 * 9 + 0); // X wins board 0 (0 1 2); sends O to board 0, now decided
  assert.equal(pos.smalls[0], 'X');
  assert.equal(pos.active, -1, 'free choice');
  assert.ok(!isLegal(pos, 0 * 9 + 5), 'a decided board is closed');
  assert.ok(isLegal(pos, 8 * 9 + 8));
});

test('three small boards in a row win the game', () => {
  const pos = emptyUltimate();
  pos.smalls = ['X', 'X', null, null, 'O', null, null, 'O', null];
  // X wins board 2 with its last square
  pos.cells[18] = 'X';
  pos.cells[19] = 'X';
  pos.active = 2;
  const after = playUltimate(pos, 20);
  assert.equal(after.smalls[2], 'X');
  assert.deepEqual(after.result, { p: 'X', line: [0, 1, 2] });
  assert.deepEqual(legalMoves(after), []);
});

test('replaying moves gives the same position; the computer only plays legal moves', () => {
  let pos = emptyUltimate();
  const moves = [];
  for (let n = 0; n < 40 && !pos.result; n++) {
    const m = pickUltimateMove(pos, n % 2 ? 'hard' : 'casual');
    assert.ok(isLegal(pos, m));
    pos = playUltimate(pos, m);
    moves.push(m);
  }
  assert.deepEqual(replayUltimate(moves), pos);
});

test('the computer takes a winning move and is quick about it', () => {
  const pos = emptyUltimate();
  pos.smalls = ['O', 'O', null, null, 'X', null, null, 'X', null];
  pos.cells[18] = 'O';
  pos.cells[19] = 'O';
  pos.active = 2;
  pos.turn = 'O';
  assert.equal(pickUltimateMove(pos, 'medium'), 20);
  const start = Date.now();
  pickUltimateMove(playUltimate(emptyUltimate(), 40), 'hard');
  assert.ok(Date.now() - start < 1500, 'a move within a second or so');
});
