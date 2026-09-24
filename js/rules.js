// Board rules. A board is an array of 9 cells, each 'X', 'O' or null,
// indexed left-to-right, top-to-bottom.

export const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // columns
  [0, 4, 8],
  [2, 4, 6], // diagonals
];

export function emptyBoard() {
  return Array(9).fill(null);
}

// Returns { p: 'X' | 'O', line } for a win, { p: 'D' } for a draw
// (a "cat's game"), or null while the game is still going.
export function winner(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { p: board[a], line };
    }
  }
  return board.every(Boolean) ? { p: 'D' } : null;
}

export function empties(board) {
  const out = [];
  board.forEach((v, i) => {
    if (!v) out.push(i);
  });
  return out;
}

export function other(player) {
  return player === 'X' ? 'O' : 'X';
}

/* ---------- Variants ---------- */

// 'classic': the usual game. 'vanish': each player keeps only their last
// three marks; a fourth makes their oldest one vanish, so the board never
// fills up and someone usually wins.
export const VARIANTS = ['classic', 'vanish'];
export const VANISH_KEEP = 3;
// A vanish game this long is called a draw (both sides defending forever)
export const VANISH_MAX_MOVES = 60;

export const isVariant = (v) => VARIANTS.includes(v);

// A position: the board plus each player's marks, oldest first
export const emptyPosition = () => ({ board: emptyBoard(), marks: { X: [], O: [] } });

// The square whose mark vanishes when `p` plays next, or -1
export function nextToVanish(position, p, variant) {
  const mine = position.marks[p];
  return variant === 'vanish' && mine.length === VANISH_KEEP ? mine[0] : -1;
}

// `p` plays `square` (which must be empty). Returns a new position.
export function playOn(position, square, p, variant) {
  const board = position.board.slice();
  const mine = [...position.marks[p], square];
  if (variant === 'vanish' && mine.length > VANISH_KEEP) board[mine.shift()] = null;
  board[square] = p;
  return { board, marks: { ...position.marks, [p]: mine } };
}

// Plays out a whole list of moves from an empty board
export function replay(moves, starter, variant) {
  let position = emptyPosition();
  let turn = starter;
  for (const square of moves) {
    position = playOn(position, square, turn, variant);
    turn = other(turn);
  }
  return { ...position, turn };
}

// Like winner(), plus the vanish variant's draw after too many moves
export function gameResult(board, moveCount, variant) {
  const w = winner(board);
  if (w) return w;
  return variant === 'vanish' && moveCount >= VANISH_MAX_MOVES ? { p: 'D' } : null;
}
