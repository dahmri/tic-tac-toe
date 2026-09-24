// Rules of an online match between two players: a series of rounds on one
// board, with a running score. Pure functions: they take a match and return
// a new one, so they are easy to test and safe to retry.
//
// The inviter plays X and opens the first round; after that the players
// take turns opening. The server is the referee: players only send the
// square they want, and every move is checked here.

import { emptyBoard, other, winner } from '../js/rules.js';

export function newMatch({ id, x, o, now = Date.now() }) {
  return {
    id,
    players: { X: x, O: o }, // { id, username, country, avatar, rating }
    board: emptyBoard(),
    turn: 'X',
    starter: 'X',
    round: 1,
    roundStartedAt: now,
    moves: [],
    over: false,
    result: null, // 'X' | 'O' | 'D' once the round is over
    line: null,
    forfeit: false,
    score: { X: 0, O: 0, D: 0 },
    ended: false, // true once a player has left
    version: 1,
  };
}

export function symbolOf(match, userId) {
  if (match.players.X.id === userId) return 'X';
  if (match.players.O.id === userId) return 'O';
  return null;
}

// What a finished round looks like for the history and statistics
function roundRecord(match, now) {
  return {
    matchId: match.id,
    round: match.round,
    xId: match.players.X.id,
    oId: match.players.O.id,
    result: match.result,
    forfeit: match.forfeit,
    moves: match.moves.slice(),
    startedAt: match.roundStartedAt,
    endedAt: now,
  };
}

const fail = (error) => ({ error });

// Returns { match } or { error }. When the move ends the round,
// { finished } holds the round's record.
export function applyMove(match, userId, square, now = Date.now()) {
  const p = symbolOf(match, userId);
  if (!p) return fail('You are not in this game.');
  if (match.ended) return fail('This game has ended.');
  if (match.over) return fail('This round is over.');
  if (match.turn !== p) return fail("It's not your turn.");
  if (!Number.isInteger(square) || square < 0 || square > 8) return fail('Not a square.');
  if (match.board[square]) return fail('That square is taken.');

  const board = match.board.slice();
  board[square] = p;
  const next = {
    ...match,
    board,
    moves: [...match.moves, square],
    turn: other(p),
    version: match.version + 1,
  };
  const w = winner(board);
  if (!w) return { match: next };

  next.over = true;
  next.result = w.p;
  next.line = w.line || null;
  next.score = { ...match.score, [w.p]: match.score[w.p] + 1 };
  return { match: next, finished: roundRecord(next, now) };
}

// Either player can start the next round once this one is over
export function nextRound(match, userId, now = Date.now()) {
  if (!symbolOf(match, userId)) return fail('You are not in this game.');
  if (match.ended) return fail('This game has ended.');
  if (!match.over) return fail('Finish this round first.');
  const starter = other(match.starter);
  return {
    match: {
      ...match,
      board: emptyBoard(),
      turn: starter,
      starter,
      round: match.round + 1,
      roundStartedAt: now,
      moves: [],
      over: false,
      result: null,
      line: null,
      forfeit: false,
      version: match.version + 1,
    },
  };
}

// A player leaves (or stays disconnected). A round in progress with at
// least one move counts as a win for the other player, so leaving can't be
// used to dodge a loss. An untouched board is simply abandoned.
export function leave(match, userId, now = Date.now()) {
  const p = symbolOf(match, userId);
  if (!p) return fail('You are not in this game.');
  if (match.ended) return { match };
  const next = { ...match, ended: true, leftBy: p, version: match.version + 1 };
  if (match.over || match.moves.length === 0) return { match: next };

  const w = other(p);
  next.over = true;
  next.result = w;
  next.forfeit = true;
  next.score = { ...match.score, [w]: match.score[w] + 1 };
  return { match: next, finished: roundRecord(next, now) };
}
