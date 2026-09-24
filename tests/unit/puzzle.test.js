import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAttempt, defend, forcesWin, puzzleFor, shiftDay, streaks } from '../../js/puzzle.js';
import { winner } from '../../js/rules.js';

const days = Array.from({ length: 60 }, (_, i) => shiftDay('2026-01-01', i));

test('every day has a real win-in-two puzzle, the same for everyone', () => {
  for (const day of days) {
    const p = puzzleFor(day);
    assert.deepEqual(puzzleFor(day), p, 'deterministic');
    const xs = p.board.filter((v) => v === 'X').length;
    assert.equal(xs, p.board.filter((v) => v === 'O').length, 'X to move');
    assert.equal(winner(p.board), null);
    assert.ok(p.solutions.length >= 1 && p.solutions.length <= 2);
    for (const m of p.solutions) assert.ok(forcesWin(p.board, m));
    // And the defence can't stop it
    const [m] = p.solutions;
    const after = p.board.slice();
    after[m] = 'X';
    const reply = defend(after);
    after[reply] = 'O';
    assert.equal(winner(after), null);
  }
  assert.notDeepEqual(puzzleFor(days[0]).board, puzzleFor(days[1]).board);
});

test('attempts are checked move by move', () => {
  const p = puzzleFor('2026-09-24');
  const [m] = p.solutions;
  const board = p.board.slice();
  board[m] = 'X';
  const r = defend(board);
  board[r] = 'O';
  const win = board.findIndex((v, i) => {
    if (v) return false;
    const b = board.slice();
    b[i] = 'X';
    return winner(b)?.p === 'X';
  });
  assert.deepEqual(checkAttempt(p, [m, r, win]), { solved: true });
  const wrong = p.board.findIndex((v, i) => !v && !p.solutions.includes(i));
  assert.deepEqual(checkAttempt(p, [wrong, 0, 1]), { solved: false });
  assert.deepEqual(checkAttempt(p, [m, r]), { solved: false }, 'unfinished');
  assert.deepEqual(checkAttempt(p, [m, m, win]), { solved: false }, 'reply on a taken square');
  assert.deepEqual(checkAttempt(p, 'nope'), { solved: false });
});

test('streaks: in a row up to today (or yesterday), and the best ever', () => {
  const solved = [
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
    '2026-09-20',
    '2026-09-22',
    '2026-09-23',
  ];
  assert.deepEqual(streaks(solved, '2026-09-23'), { current: 2, best: 3 });
  assert.deepEqual(streaks(solved, '2026-09-24'), { current: 2, best: 3 }, "today's not done yet");
  assert.deepEqual(streaks(solved, '2026-09-25'), { current: 0, best: 3 }, 'a day missed');
  assert.deepEqual(streaks([], '2026-09-25'), { current: 0, best: 0 });
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
});
