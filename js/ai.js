// Computer opponent. Both strategies take an injectable `rng` so tests
// can make them deterministic.

import { winner, empties, other } from './rules.js';

// Index of a move that wins immediately for `player`, or -1.
export function findWinningMove(board, player) {
  const b = board.slice();
  for (const i of empties(b)) {
    b[i] = player;
    const w = winner(b);
    b[i] = null;
    if (w && w.p === player) return i;
  }
  return -1;
}

// Score from `me`'s point of view: faster wins and slower losses score higher.
function minimax(board, toMove, me, depth) {
  const w = winner(board);
  if (w) {
    if (w.p === 'D') return 0;
    return w.p === me ? 10 - depth : depth - 10;
  }
  let best = toMove === me ? -Infinity : Infinity;
  for (const i of empties(board)) {
    board[i] = toMove;
    const s = minimax(board, other(toMove), me, depth + 1);
    board[i] = null;
    best = toMove === me ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

// Every move that plays perfectly (all equally good)
export function bestMoves(board, me) {
  const b = board.slice();
  let bestScore = -Infinity;
  let moves = [];
  for (const i of empties(b)) {
    b[i] = me;
    const s = minimax(b, other(me), me, 1);
    b[i] = null;
    if (s > bestScore) {
      bestScore = s;
      moves = [i];
    } else if (s === bestScore) moves.push(i);
  }
  return moves;
}

// Perfect play; picks randomly among equally good moves for variety.
export function bestMove(board, me, rng = Math.random) {
  const moves = bestMoves(board, me);
  return moves[Math.floor(rng() * moves.length)];
}

// Takes a win when it sees one, blocks most of the time, otherwise wanders.
export function casualMove(board, me, rng = Math.random, blockChance = 0.6) {
  const win = findWinningMove(board, me);
  if (win >= 0) return win;
  const block = findWinningMove(board, other(me));
  if (block >= 0 && rng() < blockChance) return block;
  const open = empties(board);
  return open[Math.floor(rng() * open.length)];
}

export function pickMove(board, me, difficulty, rng = Math.random) {
  return difficulty === 'hard' ? bestMove(board, me, rng) : casualMove(board, me, rng);
}
