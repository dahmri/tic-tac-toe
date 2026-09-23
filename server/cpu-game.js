// Checks a game played against the computer before it counts in the
// statistics. The browser runs these games, so the server replays the moves
// and decides the result itself instead of trusting it:
//
// - every move is legal, turns alternate, and the game really ended;
// - the computer's moves are ones it could have made. "Unbeatable" must
//   play perfectly; "Casual" always takes a winning move when it has one.
//
// The player is X, the computer O.

import { emptyBoard, other, winner } from '../js/rules.js';
import { bestMoves, findWinningMove } from '../js/ai.js';

const fail = (error) => ({ error });

export function checkCpuGame({ difficulty, starter, moves }) {
  if (difficulty !== 'casual' && difficulty !== 'hard') return fail('Unknown difficulty.');
  if (starter !== 'X' && starter !== 'O') return fail('Unknown first player.');
  if (!Array.isArray(moves) || moves.length < 5 || moves.length > 9) {
    return fail('Not a finished game.');
  }

  const board = emptyBoard();
  let turn = starter;
  let result = null;
  for (const square of moves) {
    if (result) return fail('Moves after the end of the game.');
    if (!Number.isInteger(square) || square < 0 || square > 8 || board[square]) {
      return fail('Illegal move.');
    }
    if (turn === 'O') {
      const allowed =
        difficulty === 'hard'
          ? bestMoves(board, 'O')
          : findWinningMove(board, 'O') >= 0
            ? winningSquares(board, 'O')
            : null; // casual may play anywhere else
      if (allowed && !allowed.includes(square)) return fail('Not a move the computer makes.');
    }
    board[square] = turn;
    result = winner(board)?.p ?? null;
    turn = other(turn);
  }
  if (!result) return fail('Not a finished game.');
  return { result };
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
