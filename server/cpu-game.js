// Checks a game played against the computer before it counts in the
// statistics. The browser runs these games, so the server replays the moves
// and decides the result itself instead of trusting it:
//
// - every move is legal, turns alternate, and the game really ended;
// - the computer's moves are ones it could have made. In classic games
//   "Unbeatable" must play perfectly, and every level takes a winning move
//   when it has one; "Medium" also always blocks. In the vanish variant
//   the computer looks ahead rather than playing perfectly, so only "takes
//   a win" is checked.
//
// The player is X, the computer O.

import {
  emptyPosition,
  gameResult,
  isVariant,
  other,
  playOn,
  VANISH_MAX_MOVES,
  winner,
} from '../js/rules.js';
import { bestMoves, vanishWinningMoves } from '../js/ai.js';

export const DIFFICULTIES = ['casual', 'medium', 'hard'];

const fail = (error) => ({ error });

export function checkCpuGame({ difficulty, starter, moves, variant = 'classic' }) {
  if (!DIFFICULTIES.includes(difficulty)) return fail('Unknown difficulty.');
  if (!isVariant(variant)) return fail('Unknown rules.');
  if (starter !== 'X' && starter !== 'O') return fail('Unknown first player.');
  const max = variant === 'vanish' ? VANISH_MAX_MOVES : 9;
  if (!Array.isArray(moves) || moves.length < 5 || moves.length > max) {
    return fail('Not a finished game.');
  }

  let position = emptyPosition();
  let turn = starter;
  let result = null;
  for (const [n, square] of moves.entries()) {
    if (result) return fail('Moves after the end of the game.');
    if (!Number.isInteger(square) || square < 0 || square > 8 || position.board[square]) {
      return fail('Illegal move.');
    }
    if (turn === 'O') {
      const allowed = computerChoices(position, difficulty, variant);
      if (allowed && !allowed.includes(square)) return fail('Not a move the computer makes.');
    }
    position = playOn(position, square, turn, variant);
    result = gameResult(position.board, n + 1, variant)?.p ?? null;
    turn = other(turn);
  }
  if (!result) return fail('Not a finished game.');
  return { result };
}

// The squares the computer (O) could pick here, or null for "any"
function computerChoices(position, difficulty, variant) {
  if (variant === 'vanish') {
    const wins = vanishWinningMoves(position, 'O');
    return wins.length ? wins : null;
  }
  if (difficulty === 'hard') return bestMoves(position.board, 'O');
  const wins = winningSquares(position.board, 'O');
  if (wins.length) return wins;
  if (difficulty === 'medium') {
    const blocks = winningSquares(position.board, 'X');
    if (blocks.length) return blocks;
  }
  return null;
}

function winningSquares(board, p) {
  const out = [];
  board.forEach((v, i) => {
    if (v) return;
    const b = board.slice();
    b[i] = p;
    if (winner(b)?.p === p) out.push(i);
  });
  return out;
}
