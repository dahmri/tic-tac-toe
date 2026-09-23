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
