// Computer opponent. Both strategies take an injectable `rng` so tests
// can make them deterministic.

import { LINES, winner, empties, other, nextToVanish, playOn } from './rules.js';

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

// Always takes a win and blocks a loss; otherwise plays the best move most
// of the time, and slips now and then
export function mediumMove(board, me, rng = Math.random) {
  const win = findWinningMove(board, me);
  if (win >= 0) return win;
  const block = findWinningMove(board, other(me));
  if (block >= 0) return block;
  if (rng() < 0.7) return bestMove(board, me, rng);
  const open = empties(board);
  return open[Math.floor(rng() * open.length)];
}

export function pickMove(board, me, difficulty, rng = Math.random) {
  if (difficulty === 'hard') return bestMove(board, me, rng);
  if (difficulty === 'medium') return mediumMove(board, me, rng);
  return casualMove(board, me, rng);
}

/* ---------- The vanish variant (three marks each) ---------- */
// The game can go on forever, so perfect play is out of reach: the
// computer looks a few moves ahead instead. Positions come from rules.js.

// Squares where `p` wins at once (their oldest mark vanishing included)
export function vanishWinningMoves(position, p) {
  return empties(position.board).filter(
    (i) => winner(playOn(position, i, p, 'vanish').board)?.p === p,
  );
}

// Lines two marks from done, for `me` minus for the opponent; a mark that
// is about to vanish counts for less
function vanishHeuristic(position, me, toMove) {
  let score = 0;
  for (const p of ['X', 'O']) {
    const fading = nextToVanish(position, p, 'vanish');
    for (const line of LINES) {
      const cells = line.map((i) => position.board[i]);
      if (cells.includes(other(p))) continue;
      const mine = line.filter((i) => position.board[i] === p && i !== fading).length;
      const value = mine === 2 ? (p === toMove ? 6 : 3) : mine;
      score += p === me ? value : -value;
    }
  }
  return score;
}

function vanishSearch(position, toMove, me, depth, ply, alpha, beta) {
  const w = winner(position.board);
  if (w) return w.p === me ? 1000 - ply : ply - 1000;
  if (depth === 0) return vanishHeuristic(position, me, toMove);
  const maximizing = toMove === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const i of empties(position.board)) {
    const next = playOn(position, i, toMove, 'vanish');
    const s = vanishSearch(next, other(toMove), me, depth - 1, ply + 1, alpha, beta);
    if (maximizing) {
      best = Math.max(best, s);
      alpha = Math.max(alpha, s);
    } else {
      best = Math.min(best, s);
      beta = Math.min(beta, s);
    }
    if (beta <= alpha) break;
  }
  return best;
}

// The best moves `depth` plies deep (all equally good)
export function vanishBestMoves(position, me, depth = 6) {
  let bestScore = -Infinity;
  let moves = [];
  for (const i of empties(position.board)) {
    const next = playOn(position, i, me, 'vanish');
    const s = vanishSearch(next, other(me), me, depth - 1, 1, -Infinity, Infinity);
    if (s > bestScore) {
      bestScore = s;
      moves = [i];
    } else if (s === bestScore) moves.push(i);
  }
  return moves;
}

const VANISH_DEPTH = { casual: 0, medium: 2, hard: 7 };

export function pickVanishMove(position, me, difficulty, rng = Math.random) {
  const any = (list) => list[Math.floor(rng() * list.length)];
  const wins = vanishWinningMoves(position, me);
  if (wins.length) return any(wins);
  if (difficulty === 'casual') {
    const blocks = vanishWinningMoves(position, other(me));
    if (blocks.length && rng() < 0.6) return any(blocks);
    return any(empties(position.board));
  }
  return any(vanishBestMoves(position, me, VANISH_DEPTH[difficulty] ?? 2));
}

// The move to suggest to a player asking for a hint
export function hintMove(position, me, variant, rng = Math.random) {
  if (variant === 'vanish') return pickVanishMove(position, me, 'hard', rng);
  return bestMove(position.board, me, rng);
}
