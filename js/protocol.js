// Messages exchanged in online play. The host owns the game: the guest
// sends requests (move, new round, reset scores) and the host answers with
// the full game state after every change. Anything received from the other
// computer is untrusted and validated here before use.

const isPlayer = v => v === 'X' || v === 'O';
const isCount = v => Number.isInteger(v) && v >= 0;

export function stateMessage({ board, turn, over, scores, starter }) {
  return { type: 'state', board: board.slice(), turn, over, scores: { ...scores }, starter };
}

// Returns a clean state object, or null if the message is malformed.
export function parseState(msg) {
  if (!msg || msg.type !== 'state') return null;
  const { board, turn, over, scores, starter } = msg;
  if (!Array.isArray(board) || board.length !== 9) return null;
  if (!board.every(v => v === null || isPlayer(v))) return null;
  if (!isPlayer(turn) || !isPlayer(starter) || typeof over !== 'boolean') return null;
  if (!scores || !isCount(scores.X) || !isCount(scores.O) || !isCount(scores.D)) return null;
  return { board: board.slice(), turn, over, starter, scores: { X: scores.X, O: scores.O, D: scores.D } };
}

// Square index from a guest's move request, or -1 if it isn't a legal square.
export function parseMove(msg) {
  const i = msg?.i;
  return msg?.type === 'move' && Number.isInteger(i) && i >= 0 && i < 9 ? i : -1;
}
