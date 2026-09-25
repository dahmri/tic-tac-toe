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
    for (const difficulty of ['casual', 'medium', 'hard']) {
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

test('vanish games: real ones are accepted, and the computer must take its wins', async () => {
  const { emptyPosition, gameResult, playOn } = await import('../../js/rules.js');
  const { pickVanishMove } = await import('../../js/ai.js');
  for (let n = 0; n < 30; n++) {
    const difficulty = ['casual', 'medium', 'hard'][n % 3];
    const starter = n % 2 ? 'O' : 'X';
    let position = emptyPosition();
    let turn = starter;
    const moves = [];
    let result = null;
    while (!result) {
      const i =
        turn === 'X'
          ? pickVanishMove(position, 'X', 'casual')
          : pickVanishMove(position, 'O', difficulty);
      position = playOn(position, i, turn, 'vanish');
      moves.push(i);
      result = gameResult(position.board, moves.length, 'vanish');
      turn = other(turn);
    }
    const checked = checkCpuGame({ difficulty, starter, moves, variant: 'vanish' });
    assert.equal(checked.error, undefined, `${checked.error} ${JSON.stringify(moves)}`);
    assert.equal(checked.result, result.p);
  }
  // X: 0, O: 3, X: 1, O: 4 — O ignores its win at 5, plays 8
  const lazy = checkCpuGame({
    difficulty: 'casual',
    starter: 'O',
    moves: [3, 0, 4, 1, 8, 2],
    variant: 'vanish',
  });
  assert.equal(lazy.error, 'Not a move the computer makes.');
});

test('medium always blocks in classic games', () => {
  // X threatens 0 1 _; medium O must block at 2
  const r = checkCpuGame({ difficulty: 'medium', starter: 'X', moves: [0, 4, 1, 8, 2] });
  assert.equal(r.error, 'Not a move the computer makes.');
});

test('ultimate games: real ones are accepted, illegal moves refused', async () => {
  const { emptyUltimate, pickUltimateMove, playUltimate } = await import('../../js/ultimate.js');
  for (let n = 0; n < 5; n++) {
    let pos = emptyUltimate('X');
    const moves = [];
    while (!pos.result) {
      const m = pickUltimateMove(pos, pos.turn === 'X' ? 'casual' : 'medium');
      pos = playUltimate(pos, m);
      moves.push(m);
    }
    const checked = checkCpuGame({
      difficulty: 'medium',
      starter: 'X',
      moves,
      variant: 'ultimate',
    });
    assert.equal(checked.error, undefined);
    assert.equal(checked.result, pos.result.p);
  }
  // O answers in the wrong board
  const bad = checkCpuGame({
    difficulty: 'casual',
    starter: 'X',
    moves: [40, 0, 1, 2, 3],
    variant: 'ultimate',
  });
  assert.equal(bad.error, 'Illegal move.');
});
