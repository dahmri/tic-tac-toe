import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCpuGame } from '../../server/cpu-game.js';
import { pickMove } from '../../js/ai.js';
import { emptyBoard, other, winner } from '../../js/rules.js';

// Plays a real game: the "player" picks with `human`, the computer with ai.js
function playGame(difficulty, starter, human) {
  const board = emptyBoard();
  const moves = [];
  let turn = starter;
  while (!winner(board)) {
    const i = turn === 'X' ? human(board) : pickMove(board, 'O', difficulty);
    board[i] = turn;
    moves.push(i);
    turn = other(turn);
  }
  return { difficulty, starter, moves, result: winner(board).p };
}
const firstFree = (b) => b.findIndex((v) => !v);
const randomFree = (b) => {
  const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  return free[Math.floor(Math.random() * free.length)];
};

test('real games against either computer are accepted with the right result', () => {
  for (let n = 0; n < 200; n++) {
    for (const difficulty of ['casual', 'hard']) {
      const game = playGame(difficulty, n % 2 ? 'O' : 'X', n % 3 ? randomFree : firstFree);
      const checked = checkCpuGame(game);
      assert.equal(checked.error, undefined, `${checked.error} ${JSON.stringify(game)}`);
      assert.equal(checked.result, game.result);
    }
  }
});

test('the result is worked out by the server, never taken from the browser', () => {
  // X: 0 1 2 wins; O plays 3 4 (a casual computer can do that)
  const r = checkCpuGame({
    difficulty: 'casual',
    starter: 'X',
    moves: [0, 3, 1, 4, 2],
    result: 'O',
  });
  assert.equal(r.result, 'X');
});

test('a win against Unbeatable is impossible, so it is refused', () => {
  // O ignores X's threats: not perfect play
  const r = checkCpuGame({ difficulty: 'hard', starter: 'X', moves: [0, 8, 1, 7, 2] });
  assert.match(r.error, /computer/);
});

test('Casual never misses a win it has', () => {
  // O could win with 5 (3 4 5) but plays 8
  const r = checkCpuGame({ difficulty: 'casual', starter: 'O', moves: [3, 0, 4, 1, 8, 2] });
  assert.match(r.error, /computer/);
});

test('illegal or unfinished games are refused', () => {
  const bad = [
    { moves: [0, 0, 1, 2, 3] }, // square taken twice
    { moves: [0, 3, 1, 4] }, // too short
    { moves: [0, 3, 1, 4, 6] }, // not finished
    { moves: [0, 3, 1, 4, 2, 5] }, // a move after the win
    { moves: [0, 3, 1, 4, 9] }, // off the board
    { moves: 'nope' },
    { moves: [0, 3, 1, 4, 2], difficulty: 'impossible' },
    { moves: [0, 3, 1, 4, 2], starter: 'Z' },
  ];
  for (const g of bad) {
    const r = checkCpuGame({ difficulty: 'casual', starter: 'X', ...g });
    assert.ok(r.error, JSON.stringify(g));
  }
});
