// Rules of an online match between two players: a series of rounds on one
// board, with a running score. Pure functions: they take a match and return
// a new one, so they are easy to test and safe to retry.
//
// The inviter plays X and opens the first round; after that the players
// take turns opening. The server is the referee: players only send the
// square they want, and every move is checked here. A match is played with
// one set of rules throughout: 'classic' or 'vanish' (see rules.js).
//
// Every move is on the clock: the player to move has `turnMs` (30 s by
// default). `deadline` is when their time runs out; timeUp() gives the
// round to their opponent after that. There's no clock between rounds.

import { boardSize, gameResult, other, playOn, replay } from '../js/rules.js';
import { isLegal, playUltimate, replayUltimate } from '../js/ultimate.js';

const emptyBoardFor = (variant) => Array(boardSize(variant)).fill(null);

// The board after `p` plays `square`, and the result if the round is over
function play(match, square, p) {
  const variant = match.variant ?? 'classic';
  if (variant === 'ultimate') {
    const pos = replayUltimate(match.moves, match.starter);
    if (!isLegal(pos, square)) return { error: 'Play in the highlighted board.' };
    const next = playUltimate(pos, square);
    return { board: next.cells, result: next.result };
  }
  const { board } = playOn(replay(match.moves, match.starter, variant), square, p, variant);
  return { board, result: gameResult(board, match.moves.length + 1, variant) };
}

export const TURN_MS = 30_000;

export function newMatch({ id, x, o, variant = 'classic', turnMs = TURN_MS, now = Date.now() }) {
  return {
    id,
    variant,
    turnMs,
    deadline: now + turnMs,
    players: { X: x, O: o }, // { id, username, country, avatar, rating }
    board: emptyBoardFor(variant),
    turn: 'X',
    starter: 'X',
    round: 1,
    roundStartedAt: now,
    moves: [],
    over: false,
    result: null, // 'X' | 'O' | 'D' once the round is over
    line: null,
    forfeit: false,
    timeout: false, // the round was lost on time
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
    variant: match.variant,
    starter: match.starter,
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
  const size = boardSize(match.variant ?? 'classic');
  if (!Number.isInteger(square) || square < 0 || square >= size) return fail('Not a square.');
  if (match.board[square]) return fail('That square is taken.');

  const played = play(match, square, p);
  if (played.error) return fail(played.error);
  const { board, result: w } = played;
  const next = {
    ...match,
    board,
    moves: [...match.moves, square],
    turn: other(p),
    deadline: now + (match.turnMs ?? TURN_MS),
    version: match.version + 1,
  };
  if (!w) return { match: next };

  next.over = true;
  next.deadline = null;
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
      board: emptyBoardFor(match.variant ?? 'classic'),
      turn: starter,
      starter,
      round: match.round + 1,
      roundStartedAt: now,
      moves: [],
      over: false,
      result: null,
      line: null,
      forfeit: false,
      timeout: false,
      deadline: now + (match.turnMs ?? TURN_MS),
      version: match.version + 1,
    },
  };
}

// The player to move ran out of time: the round goes to their opponent.
// Returns the match unchanged if nothing is due.
export function timeUp(match, now = Date.now()) {
  if (match.ended || match.over || !match.deadline || now < match.deadline) return { match };
  const w = other(match.turn);
  const next = {
    ...match,
    over: true,
    result: w,
    forfeit: true,
    timeout: true,
    deadline: null,
    score: { ...match.score, [w]: match.score[w] + 1 },
    version: match.version + 1,
  };
  return { match: next, finished: roundRecord(next, now) };
}

// A player leaves (or stays disconnected). A round in progress with at
// least one move counts as a win for the other player, so leaving can't be
// used to dodge a loss. An untouched board is simply abandoned.
export function leave(match, userId, now = Date.now()) {
  const p = symbolOf(match, userId);
  if (!p) return fail('You are not in this game.');
  if (match.ended) return { match };
  const next = { ...match, ended: true, leftBy: p, deadline: null, version: match.version + 1 };
  if (match.over || match.moves.length === 0) return { match: next };

  const w = other(p);
  next.over = true;
  next.result = w;
  next.forfeit = true;
  next.score = { ...match.score, [w]: match.score[w] + 1 };
  return { match: next, finished: roundRecord(next, now) };
}
