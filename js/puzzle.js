// The daily puzzle: a classic position where X (the player) can force a
// win in two moves: whatever O answers to the first, the second wins.
// Everyone gets the same puzzle on the same day: it is generated from the
// date, so browser and server agree without storing anything.

import { emptyBoard, winner, empties } from './rules.js';
import { findWinningMove } from './ai.js';

// Days are the player's calendar day, as 'YYYY-MM-DD'
export function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const isDayKey = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

// The day `days` after `day` (negative: before)
export const shiftDay = (day, days) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

// Days solved in a row, ending on `day` (or the day before, if that day's
// puzzle isn't done yet), and the longest run ever
export function streaks(solvedDays, day) {
  const set = new Set(solvedDays);
  let current = 0;
  let cursor = set.has(day) ? day : shiftDay(day, -1);
  while (set.has(cursor)) {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  let best = 0;
  let run = 0;
  let previous = null;
  for (const d of [...set].sort()) {
    run = previous && shiftDay(previous, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    previous = d;
  }
  return { current, best };
}

// A small seeded random generator (mulberry32), seeded from the day
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let x = Math.imul(h ^ (h >>> 15), 1 | h);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const with_ = (board, i, p) => {
  const b = board.slice();
  b[i] = p;
  return b;
};

// Does X playing `move` win by force (every O answer loses)?
export function forcesWin(board, move) {
  if (board[move]) return false;
  const next = with_(board, move, 'X');
  if (winner(next)) return false; // that would be a win in one
  return empties(next).every((reply) => {
    const after = with_(next, reply, 'O');
    return !winner(after) && findWinningMove(after, 'X') >= 0;
  });
}

// The day's puzzle: { day, board, solutions } (the first moves that win)
export function puzzleFor(day) {
  const rng = seeded(`pencil-ttt:${day}`);
  for (let attempt = 0; attempt < 20000; attempt++) {
    const board = emptyBoard();
    const k = rng() < 0.5 ? 2 : 3; // marks each, X to move
    const free = [...Array(9).keys()];
    for (const p of [...Array(k).fill('X'), ...Array(k).fill('O')]) {
      board[free.splice(Math.floor(rng() * free.length), 1)[0]] = p;
    }
    if (winner(board) || findWinningMove(board, 'X') >= 0) continue;
    const solutions = empties(board).filter((m) => forcesWin(board, m));
    // A puzzle, not a giveaway: one or two good moves among several
    if (solutions.length >= 1 && solutions.length <= 2 && empties(board).length > 3) {
      return { day, board, solutions };
    }
  }
  throw new Error(`No puzzle found for ${day}`);
}

// O's answer to a winning first move: it blocks one of X's threats (it
// can't block both)
export function defend(board) {
  const block = findWinningMove(board, 'X');
  return block >= 0 ? block : empties(board)[0];
}

// Checks a whole attempt: [first, reply, second]. Solved if the first
// move forces the win, the reply is a legal O move, and the second wins.
export function checkAttempt(puzzle, moves) {
  if (!Array.isArray(moves) || moves.length < 1 || moves.length > 3) return { solved: false };
  const [first, reply, second] = moves;
  if (!Number.isInteger(first) || !puzzle.solutions.includes(first)) return { solved: false };
  if (moves.length < 3) return { solved: false };
  const afterFirst = with_(puzzle.board, first, 'X');
  if (!Number.isInteger(reply) || afterFirst[reply] || reply < 0 || reply > 8) {
    return { solved: false };
  }
  const afterReply = with_(afterFirst, reply, 'O');
  if (!Number.isInteger(second) || afterReply[second] || second < 0 || second > 8) {
    return { solved: false };
  }
  return { solved: winner(with_(afterReply, second, 'X'))?.p === 'X' };
}
