import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, leave, newMatch, nextRound, symbolOf } from '../../server/match.js';

const ann = { id: 1, username: 'ann', country: 'FR' };
const bob = { id: 2, username: 'bob', country: 'MA' };
const fresh = () => newMatch({ id: 'm1', x: ann, o: bob, now: 1000 });

// Plays squares in order, alternating from whoever's turn it is
function play(match, squares) {
  let m = match;
  let last;
  for (const i of squares) {
    const player = m.turn === 'X' ? m.players.X.id : m.players.O.id;
    last = applyMove(m, player, i, 2000);
    assert.equal(last.error, undefined, last.error);
    m = last.match;
  }
  return { match: m, finished: last?.finished };
}

test('the inviter is X and opens the first round', () => {
  const m = fresh();
  assert.equal(symbolOf(m, 1), 'X');
  assert.equal(symbolOf(m, 2), 'O');
  assert.equal(symbolOf(m, 3), null);
  assert.equal(m.turn, 'X');
});

test('moves are refused out of turn, on taken squares, off the board, or from strangers', () => {
  const m = fresh();
  assert.match(applyMove(m, 2, 0).error, /not your turn/);
  assert.match(applyMove(m, 3, 0).error, /not in this game/);
  for (const bad of [-1, 9, 1.5, '4', null]) {
    assert.match(applyMove(m, 1, bad).error, /Not a square/, String(bad));
  }
  const after = applyMove(m, 1, 4).match;
  assert.match(applyMove(after, 2, 4).error, /taken/);
});

test('a move never changes the match it was given', () => {
  const m = fresh();
  const snapshot = JSON.stringify(m);
  applyMove(m, 1, 4);
  assert.equal(JSON.stringify(m), snapshot);
});

test('a win ends the round, scores it, and produces a record', () => {
  // X: 0 1 2 (top row), O: 3 4
  const { match, finished } = play(fresh(), [0, 3, 1, 4, 2]);
  assert.equal(match.over, true);
  assert.equal(match.result, 'X');
  assert.deepEqual(match.line, [0, 1, 2]);
  assert.deepEqual(match.score, { X: 1, O: 0, D: 0 });
  assert.deepEqual(finished, {
    matchId: 'm1',
    round: 1,
    xId: 1,
    oId: 2,
    result: 'X',
    forfeit: false,
    moves: [0, 3, 1, 4, 2],
    startedAt: 1000,
    endedAt: 2000,
  });
  assert.match(applyMove(match, 2, 5).error, /round is over/);
});

test('a full board with no line is a draw', () => {
  const { match, finished } = play(fresh(), [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.equal(match.result, 'D');
  assert.deepEqual(match.score, { X: 0, O: 0, D: 1 });
  assert.equal(finished.result, 'D');
});

test('the next round alternates who opens and keeps the score', () => {
  const first = play(fresh(), [0, 3, 1, 4, 2]).match;
  assert.match(nextRound(fresh(), 1).error, /Finish this round/);
  const second = nextRound(first, 2, 5000).match;
  assert.equal(second.round, 2);
  assert.equal(second.turn, 'O');
  assert.equal(second.roundStartedAt, 5000);
  assert.deepEqual(second.board, Array(9).fill(null));
  assert.deepEqual(second.score, { X: 1, O: 0, D: 0 });
  assert.equal(
    nextRound(second.over ? second : play(second, [0, 3, 1, 4, 2]).match, 1).match.turn,
    'X',
  );
});

test('leaving mid-round forfeits it to the other player', () => {
  const started = play(fresh(), [4]).match;
  const { match, finished } = leave(started, 1, 3000);
  assert.equal(match.ended, true);
  assert.equal(match.result, 'O');
  assert.equal(match.forfeit, true);
  assert.deepEqual(match.score, { X: 0, O: 1, D: 0 });
  assert.equal(finished.forfeit, true);
  assert.equal(finished.result, 'O');
  assert.match(applyMove(match, 2, 0).error, /ended/);
});

test('leaving before any move, or after a round ends, records nothing', () => {
  assert.equal(leave(fresh(), 2).finished, undefined);
  const done = play(fresh(), [0, 3, 1, 4, 2]).match;
  const { match, finished } = leave(done, 2);
  assert.equal(finished, undefined);
  assert.equal(match.ended, true);
  assert.deepEqual(match.score, { X: 1, O: 0, D: 0 });
});

test('versions only go up', () => {
  const m = fresh();
  const a = applyMove(m, 1, 0).match;
  const b = applyMove(a, 2, 1).match;
  assert.ok(m.version < a.version && a.version < b.version);
});
