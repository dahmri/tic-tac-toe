// Ultimate tic-tac-toe: nine small boards in a big one. Squares are
// numbered 0-80: small board b holds squares b*9 .. b*9+8, laid out like
// the classic board inside it.
//
// - The square you play (0-8 inside its small board) sends your opponent to
//   the small board with that number. If that board is already decided,
//   they may play in any undecided one. The very first move is free.
// - Three in a row on a small board wins it; a full one with no line is a
//   draw and belongs to nobody.
// - Three small boards in a row win the game. When every small board is
//   decided without that, it's a draw.

import { LINES, other } from './rules.js';

export const SIZE = 81;
export const boardOf = (square) => Math.floor(square / 9);
export const cellOf = (square) => square % 9;

// 'X' | 'O' | 'D' (drawn) | null for one small board of `cells` (81)
function smallResult(cells, b) {
  const at = (c) => cells[b * 9 + c];
  for (const [p, q, r] of LINES) {
    if (at(p) && at(p) === at(q) && at(p) === at(r)) return at(p);
  }
  for (let c = 0; c < 9; c++) if (!at(c)) return null;
  return 'D';
}

// The big board's result from the small ones: { p, line } | { p: 'D' } | null
function bigResult(smalls) {
  for (const line of LINES) {
    const [p, q, r] = line;
    if (
      (smalls[p] === 'X' || smalls[p] === 'O') &&
      smalls[p] === smalls[q] &&
      smalls[p] === smalls[r]
    ) {
      return { p: smalls[p], line };
    }
  }
  return smalls.every(Boolean) ? { p: 'D' } : null;
}

// A position: { cells, smalls, active, turn, result }. `active` is the small
// board the player to move must play in, or -1 for any.
export function emptyUltimate(starter = 'X') {
  return {
    cells: Array(SIZE).fill(null),
    smalls: Array(9).fill(null),
    active: -1,
    turn: starter,
    result: null,
  };
}

export function isLegal(pos, square) {
  if (pos.result || !Number.isInteger(square) || square < 0 || square >= SIZE) return false;
  if (pos.cells[square] || pos.smalls[boardOf(square)]) return false;
  return pos.active === -1 || boardOf(square) === pos.active;
}

export function legalMoves(pos) {
  const out = [];
  if (pos.result) return out;
  const boards = pos.active === -1 ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [pos.active];
  for (const b of boards) {
    if (pos.smalls[b]) continue;
    for (let c = 0; c < 9; c++) if (!pos.cells[b * 9 + c]) out.push(b * 9 + c);
  }
  return out;
}

// The position after the player to move plays `square` (must be legal)
export function playUltimate(pos, square) {
  const cells = pos.cells.slice();
  cells[square] = pos.turn;
  const smalls = pos.smalls.slice();
  const b = boardOf(square);
  smalls[b] = smallResult(cells, b);
  const next = cellOf(square);
  return {
    cells,
    smalls,
    active: smalls[next] ? -1 : next,
    turn: other(pos.turn),
    result: bigResult(smalls),
  };
}

export function replayUltimate(moves, starter = 'X') {
  let pos = emptyUltimate(starter);
  for (const m of moves) pos = playUltimate(pos, m);
  return pos;
}

/* ---------- The computer ---------- */
// Alpha-beta a few moves deep with a heuristic: small boards won (the
// centre and corners count more), and two-in-a-rows on the small boards
// and on the big one. Deep enough to play a sensible game quickly.

const BOARD_WEIGHT = [3, 2, 3, 2, 4, 2, 3, 2, 3];

function lineScore(values, me) {
  let score = 0;
  for (const [p, q, r] of LINES) {
    const line = [values[p], values[q], values[r]];
    if (line.includes('D')) continue;
    const mine = line.filter((v) => v === me).length;
    const theirs = line.filter((v) => v === other(me)).length;
    if (theirs === 0 && mine === 2) score += 1;
    if (mine === 0 && theirs === 2) score -= 1;
  }
  return score;
}

function evaluate(pos, me) {
  if (pos.result) return pos.result.p === 'D' ? 0 : pos.result.p === me ? 10_000 : -10_000;
  let score = 0;
  for (let b = 0; b < 9; b++) {
    const s = pos.smalls[b];
    if (s === me) score += 40 * BOARD_WEIGHT[b];
    else if (s === other(me)) score -= 40 * BOARD_WEIGHT[b];
    else if (!s) score += 3 * lineScore(pos.cells.slice(b * 9, b * 9 + 9), me);
  }
  score += 90 * lineScore(pos.smalls, me);
  return score;
}

function search(pos, depth, me, alpha, beta) {
  if (depth === 0 || pos.result) return evaluate(pos, me);
  const moves = legalMoves(pos);
  const maximizing = pos.turn === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of moves) {
    const s = search(playUltimate(pos, m), depth - 1, me, alpha, beta);
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

const DEPTH = { casual: 1, medium: 2, hard: 5 };

// The computer's move for the player to move
export function pickUltimateMove(pos, difficulty = 'medium', rng = Math.random) {
  const moves = legalMoves(pos);
  const me = pos.turn;
  // Casual wanders now and then
  if (difficulty === 'casual' && rng() < 0.35) return moves[Math.floor(rng() * moves.length)];
  // A free choice of board has many moves: look less deep there
  const depth = Math.max(1, (DEPTH[difficulty] ?? 2) - (moves.length > 20 ? 1 : 0));
  let bestScore = -Infinity;
  let best = [];
  for (const m of moves) {
    const s = search(playUltimate(pos, m), depth - 1, me, -Infinity, Infinity);
    if (s > bestScore) {
      bestScore = s;
      best = [m];
    } else if (s === bestScore) best.push(m);
  }
  return best[Math.floor(rng() * best.length)];
}
