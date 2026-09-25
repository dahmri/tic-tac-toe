// Game analysis: with perfect play from both sides, what each position was
// worth to a player (a win, a draw or a loss), and where their moves threw
// some of it away. Classic games only: the 3-mark game can go on forever,
// so it has no perfect answer to compare with.

import { emptyBoard, empties, other, winner } from './rules.js';

const WORTH = { 1: 'win', 0: 'draw', '-1': 'loss' };
const memo = new Map();

// The outcome for `me` with best play from here, `toMove` to play:
// 1 (win), 0 (draw) or -1 (loss)
export function outcome(board, toMove, me) {
  const key = board.map((v) => v || '.').join('') + toMove + me;
  if (memo.has(key)) return memo.get(key);
  const w = winner(board);
  let value;
  if (w) value = w.p === 'D' ? 0 : w.p === me ? 1 : -1;
  else {
    const values = empties(board).map((i) => {
      const next = board.slice();
      next[i] = toMove;
      return outcome(next, other(toMove), me);
    });
    value = toMove === me ? Math.max(...values) : Math.min(...values);
  }
  memo.set(key, value);
  return value;
}

// The moves by `symbol` that made their outcome worse, in order:
// [{ move (0-based index in the game), played, best: [squares], from, to }]
export function mistakes({ squares, starter, symbol }) {
  const board = emptyBoard();
  let turn = starter;
  const found = [];
  squares.forEach((square, move) => {
    if (turn === symbol && !winner(board)) {
      const before = outcome(board, turn, symbol);
      const after = board.slice();
      after[square] = turn;
      const now = outcome(after, other(turn), symbol);
      if (now < before) {
        const best = empties(board).filter((i) => {
          const b = board.slice();
          b[i] = turn;
          return outcome(b, other(turn), symbol) === before;
        });
        found.push({ move, played: square, best, from: WORTH[before], to: WORTH[now] });
      }
    }
    board[square] = turn;
    turn = other(turn);
  });
  return found;
}
