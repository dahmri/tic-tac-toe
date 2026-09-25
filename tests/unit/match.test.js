import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, close, leave, newMatch, nextRound, symbolOf } from '../../server/match.js';

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
    variant: 'classic',
    starter: 'X',
    arena: null,
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

test('vanish matches: a fourth mark wipes the oldest, and the round is recorded with its rules', () => {
  const m = newMatch({ id: 'v1', x: ann, o: bob, variant: 'vanish', now: 1000 });
  // X 0, O 3, X 1, O 4, X 8, O 6 -> X plays 7: X's 0 vanishes
  const { match } = play(m, [0, 3, 1, 4, 8, 6, 7]);
  assert.equal(match.board[0], null);
  assert.deepEqual(
    [1, 7, 8].map((i) => match.board[i]),
    ['X', 'X', 'X'],
  );
  assert.equal(match.over, false, '1 7 8 is not a line');
  // O plays 2: O's 3 vanishes, leaving 2 4 6, a diagonal
  const { match: after, finished } = play(match, [2]);
  assert.equal(after.result, 'O');
  assert.equal(finished.variant, 'vanish');
  assert.equal(finished.starter, 'X');
});

test('classic is the default and fills the board', () => {
  const m = fresh();
  assert.equal(m.variant, 'classic');
  const { match } = play(m, [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.equal(match.result, 'D');
});

test('running out of time gives the round to the other player', async () => {
  const { timeUp } = await import('../../server/match.js');
  const m = newMatch({ id: 't1', x: ann, o: bob, turnMs: 30_000, now: 1000 });
  assert.equal(m.deadline, 31_000);
  assert.equal(timeUp(m, 30_999).match, m, 'not yet');
  const { match, finished } = timeUp(m, 31_000);
  assert.equal(match.result, 'O');
  assert.equal(match.timeout, true);
  assert.equal(finished.forfeit, true);
  const moved = applyMove(m, 1, 4, 5000).match;
  assert.equal(moved.deadline, 35_000, 'each move restarts the clock');
  assert.equal(nextRound(match, 1, 40_000).match.deadline, 70_000);
});

test('ultimate matches: 81 squares, and moves must go to the board the last one sent you to', async () => {
  const m = newMatch({ id: 'u1', x: ann, o: bob, variant: 'ultimate', now: 1000 });
  assert.equal(m.board.length, 81);
  const first = applyMove(m, 1, 4 * 9 + 2, 2000); // X: centre board, square 2 -> O to board 2
  assert.equal(first.error, undefined);
  assert.equal(applyMove(first.match, 2, 0, 2000).error, 'Play in the highlighted board.');
  assert.equal(applyMove(first.match, 2, 2 * 9 + 4, 2000).error, undefined);
  assert.equal(applyMove(first.match, 2, 81, 2000).error, 'Not a square.');
});

test('an arena game is one round, then closes without anyone leaving', () => {
  const m = newMatch({ id: 'm2', x: ann, o: bob, arena: '2026-09-26', now: 1000 });
  assert.match(close(m).error, /Finish this round/);
  const { match, finished } = play(m, [0, 3, 1, 4, 2]);
  assert.equal(finished.arena, '2026-09-26');
  assert.match(nextRound(match, 1).error, /next opponent is found for you/);
  const closed = close(match).match;
  assert.equal(closed.ended, true);
  assert.equal(closed.leftBy, undefined);
  assert.equal(close(closed).match, closed, 'closing twice changes nothing');
});
