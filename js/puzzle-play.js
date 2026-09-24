// Playing the daily puzzle (js/puzzle.js): the player is X and has two
// moves to win. The first try of the day counts: for a signed-in player
// the server checks and keeps it; a guest's results stay in the browser.
// After that, "Practice again" replays it without counting.

import { dayKey, defend, puzzleFor, streaks } from './puzzle.js';
import { winner } from './rules.js';
import { findWinningMove } from './ai.js';
import { api } from './api.js';
import { currentUser } from './account.js';
import { t } from './i18n.js';
import { sound } from './sound.js';
import { celebrate, clearBoard, drawWin, highlight, syncMarks } from './board.js';
import { game } from './game.js';

const LOCAL_KEY = 'pencil-ttt-puzzles';
const $ = (id) => document.getElementById(id);

let puzzle = null;
let moves = [];
// 'first' (find the move) | 'reply' (O answers) | 'second' (finish) | 'solved' | 'failed'
let phase = 'first';
let practice = false;
// Today's record: { played, solved, streak, bestStreak, totalSolved }
let record = null;
let hooks = { render() {} };

/* ---------- Results: the server for players, the browser for guests ---------- */

function localResults() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  } catch {
    return {};
  }
}

function localRecord(day) {
  const results = localResults();
  const solvedDays = Object.keys(results).filter((d) => results[d]);
  const { current, best } = streaks(solvedDays, day);
  return {
    played: day in results,
    solved: !!results[day],
    streak: current,
    bestStreak: best,
    totalSolved: solvedDays.length,
  };
}

async function loadRecord() {
  const day = puzzle.day;
  record = currentUser()
    ? await api('GET', `/api/puzzle?day=${day}`).catch(() => null)
    : localRecord(day);
  if (puzzle.day !== day) return;
  practice = !!record?.played;
  hooks.render();
}

async function saveResult(solved) {
  if (practice || !puzzle) return;
  practice = true;
  if (currentUser()) {
    record = await api('POST', `/api/puzzle/${puzzle.day}`, { moves }).catch(() => record);
  } else {
    const results = localResults();
    results[puzzle.day] ??= solved;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(results));
    } catch {
      /* not remembered */
    }
    record = localRecord(puzzle.day);
  }
  hooks.render();
}

/* ---------- Playing ---------- */

export function startPuzzle() {
  puzzle = puzzleFor(dayKey());
  moves = [];
  phase = 'first';
  game.board = puzzle.board.slice();
  game.marks = { X: [], O: [] };
  game.turn = 'X';
  game.over = false;
  game.busy = false;
  clearBoard();
  syncMarks(game.board);
  loadRecord();
}

export const puzzleCanMove = () => phase === 'first' || phase === 'second';

function place(i, p) {
  game.board[i] = p;
  moves.push(i);
  syncMarks(game.board);
  sound.mark(p);
}

function finish(solved) {
  phase = solved ? 'solved' : 'failed';
  game.over = true;
  game.busy = false;
  const w = winner(game.board);
  if (w?.line) drawWin(w.line);
  if (solved) {
    sound.win();
    celebrate();
  } else {
    sound.lose();
    highlight(puzzle.solutions[0]);
  }
  saveResult(solved);
}

export function puzzleMove(i) {
  if (!puzzleCanMove() || game.board[i]) return;
  if (phase === 'first') {
    place(i, 'X');
    const good = puzzle.solutions.includes(i);
    phase = 'reply';
    game.busy = true;
    game.turn = 'O';
    setTimeout(() => {
      // A good move: O blocks one threat, and can't block the other.
      // A miss: O wins at once if it can, or blocks.
      const win = findWinningMove(game.board, 'O');
      place(!good && win >= 0 ? win : defend(game.board), 'O');
      game.busy = false;
      game.turn = 'X';
      if (!good) return finish(false);
      phase = 'second';
      hooks.render();
    }, 450);
  } else {
    place(i, 'X');
    finish(winner(game.board)?.p === 'X');
  }
  hooks.render();
}

export function puzzleStatus() {
  if (!puzzle) return '';
  const answer = puzzle.solutions[0];
  switch (phase) {
    case 'first':
      return t('Daily puzzle: win in 2 moves. You play {mark}.', {
        mark: '<span class="x">X</span>',
      });
    case 'reply':
      return t('Computer is thinking…');
    case 'second':
      return t('<mark>Good move!</mark> Now finish it.');
    case 'solved':
      return t('<mark>Solved!</mark> 🧩');
    default:
      return t('<mark>Not this time.</mark> The winning move was row {row}, column {col}.', {
        row: Math.floor(answer / 3) + 1,
        col: (answer % 3) + 1,
      });
  }
}

// The line under the board: streak, and whether this try counts
export function renderPuzzle(visible) {
  $('puzzleInfo').hidden = !visible;
  if (!visible) return;
  const parts = [];
  if (record) {
    parts.push(
      t('🔥 Streak: {n} · Best: {best} · Solved: {total}', {
        n: record.streak,
        best: record.bestStreak,
        total: record.totalSolved,
      }),
    );
  }
  if (practice && (phase === 'first' || phase === 'second')) {
    parts.push(t("Practice: only the day's first try counts. New puzzle tomorrow!"));
  } else if (phase === 'solved' || phase === 'failed') {
    parts.push(t('New puzzle tomorrow!'));
  }
  $('puzzleNote').textContent = parts.join(' ');
  $('puzzleAgain').hidden = !(phase === 'solved' || phase === 'failed');
}

export function initPuzzle(callbacks) {
  hooks = { ...hooks, ...callbacks };
  $('puzzleAgain').addEventListener('click', () => {
    startPuzzle();
    hooks.render();
  });
}
