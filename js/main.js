// The game page: local play (against the computer or on the same screen),
// the status line, and wiring. The board is drawn by board.js and online
// matches are run by online.js; both share the position in game.js.

import { emptyBoard, gameResult, nextToVanish, other, playOn } from './rules.js';
import { hintMove, pickMove, pickVanishMove } from './ai.js';
import { canPlayOnline, currentUser, initAccount, isGuest, leaveGuest } from './account.js';
import { initLobby } from './lobby.js';
import { initStats, recordCpuGame, recordGuestGame } from './stats.js';
import { initLeaderboard } from './leaderboard.js';
import { initReplay } from './replay.js';
import { checkAchievements } from './achievements-ui.js';
import { setSound, sound, soundOn } from './sound.js';
import { onLangChange, t } from './i18n.js';
import { initLanguage } from './language.js';
import { initMonitor } from './monitor.js';
import {
  celebrate,
  clearBoard,
  clearHighlight,
  drawWin,
  highlight,
  initBoard,
  renderSquares,
  syncMarks,
  tally,
} from './board.js';
import { game, saveSettings, settings, zeroScores } from './game.js';
import {
  initPuzzle,
  puzzleCanMove,
  puzzleMove,
  puzzleStatus,
  renderPuzzle,
  startPuzzle,
} from './puzzle-play.js';
import {
  abandonMatch,
  askNextRound,
  canMove,
  goOffline,
  goOnline,
  inMatch,
  initOnline,
  matchMoves,
  online,
  onlineLocked,
  onlineStatus,
  opponent,
  playerLabel as onlineLabel,
  renderOnline,
  renderReactions,
  sendMove,
  sendToLobby,
  setNetMessage,
  variant,
} from './online.js';

// First: report errors from here on, and pick the language before
// anything writes to the page
initMonitor();
initLanguage();

// Keypad layout: 7 8 9 on top, 1 2 3 on the bottom
const KEYMAP = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

// Any element by id, typed loosely: the pages hold forms, dialogs and inputs
const $ = (id) => /** @type {any} */ (document.getElementById(id));
const statusEl = $('status');

let cpuTimer = null;
// The round in progress, recorded when a game against the computer ends
let round = { moves: [], starter: 'X', diff: 'casual', variant: 'classic', startedAt: 0 };

function isHumanTurn() {
  if (game.over) return false;
  if (settings.mode === 'cpu') return game.turn === 'X';
  if (settings.mode === 'pvp') return true;
  if (settings.mode === 'puzzle') return puzzleCanMove();
  return canMove();
}

function statusHTML() {
  const tag = (m) => `<span class="${m.toLowerCase()}">${m}</span>`;
  if (settings.mode === 'puzzle') return puzzleStatus();
  const w = gameResult(game.board, online() ? matchMoves() : round.moves.length, variant());
  if (online()) return onlineStatus(w, tag);

  if (w && w.p === 'D') return t("<mark>Cat's game.</mark> Nobody wins.");
  if (w) {
    if (settings.mode === 'cpu') {
      return w.p === 'X'
        ? t('<mark>You win!</mark> Nice line.')
        : t('<mark>Computer wins.</mark> Go again?');
    }
    return t('<mark>{mark} wins!</mark>', { mark: tag(w.p) });
  }
  if (settings.mode === 'cpu') {
    return game.turn === 'X'
      ? t('Your move, {mark}', { mark: tag('X') })
      : t('Computer is thinking…');
  }
  return t('{mark} to play', { mark: tag(game.turn) });
}

function playerLabel(p) {
  if (settings.mode === 'cpu') return p === 'X' ? t('You · X') : t('Computer · O');
  if (online()) return onlineLabel(p);
  return t('Player {mark}', { mark: p });
}

function render() {
  const humanTurn = isHumanTurn();
  renderSquares({
    board: game.board,
    turn: game.turn,
    playable: humanTurn && !game.busy,
    // Under the 3-mark rules, the mark that goes when the player to move plays
    fading: game.over ? -1 : nextToVanish(game, game.turn, variant()),
  });

  statusEl.innerHTML = statusHTML();
  $('lblX').textContent = playerLabel('X');
  $('lblO').textContent = playerLabel('O');
  $('diffGroup').hidden = settings.mode !== 'cpu';
  $('diff-hard').textContent = settings.variant === 'vanish' ? t('Hard') : t('Unbeatable');
  // An online match keeps the rules it started with
  const puzzle = settings.mode === 'puzzle';
  $('rulesRow').hidden = inMatch() || onlineLocked() || puzzle;
  $('ruleNote').hidden = variant() !== 'vanish';
  document
    .querySelectorAll('[data-variant]')
    .forEach((/** @type {HTMLElement} */ b) =>
      b.setAttribute('aria-pressed', String(b.dataset.variant === settings.variant)),
    );
  $('hintBtn').hidden = online() || puzzle;
  $('hintBtn').disabled = !humanTurn || game.busy;
  document
    .querySelectorAll('[data-mode]')
    .forEach((/** @type {HTMLElement} */ b) =>
      b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode)),
    );
  document
    .querySelectorAll('[data-diff]')
    .forEach((/** @type {HTMLElement} */ b) =>
      b.setAttribute('aria-pressed', String(b.dataset.diff === settings.diff)),
    );

  renderOnline();
  $('board').hidden = online() && !inMatch();
  $('scores').hidden = (online() && !inMatch()) || puzzle;
  $('next').disabled = (online() && !inMatch()) || (online() && !game.over);
  $('reset').hidden = online();
  $('next').closest('.actions').hidden = (online() && !inMatch()) || puzzle;
  renderPuzzle(puzzle);

  tally($('tX'), settings.scores.X);
  tally($('tO'), settings.scores.O);
  tally($('tD'), settings.scores.D);
}

/* ---------- Local play ---------- */

function place(i, p) {
  Object.assign(game, playOn(game, i, p, settings.variant));
  syncMarks(game.board);
  clearHighlight();
  // A game counts at the difficulty and rules it started with, from its first move
  if (!round.moves.length) {
    round = { ...round, diff: settings.diff, variant: settings.variant, startedAt: Date.now() };
  }
  round.moves.push(i);
  sound.mark(p);
  const w = gameResult(game.board, round.moves.length, settings.variant);
  if (w) {
    game.over = true;
    if (w.p === 'D') sound.draw();
    else if (settings.mode === 'cpu' && w.p === 'O') sound.lose();
    else {
      sound.win();
      celebrate();
    }
    const unchanged = settings.diff === round.diff && settings.variant === round.variant;
    if (settings.mode === 'cpu' && unchanged) {
      const played = {
        difficulty: round.diff,
        variant: round.variant,
        starter: round.starter,
        moves: round.moves,
        seconds: Math.round((Date.now() - round.startedAt) / 1000),
      };
      // Guests' games are kept in the browser in case they sign up
      if (currentUser()) recordCpuGame(played);
      else if (isGuest()) recordGuestGame(played);
    }
    settings.scores[w.p]++;
    settings.starter = other(settings.starter); // alternate who opens the next round
    saveSettings();
    if (w.line) drawWin(w.line);
  } else {
    game.turn = other(p);
  }
  render();
}

function humanMove(i) {
  if (game.board[i] || !isHumanTurn() || game.busy) return;
  if (online()) {
    sendMove(i);
    render();
    return;
  }
  if (settings.mode === 'puzzle') return puzzleMove(i);
  place(i, game.turn);
  maybeCpu();
}

function maybeCpu() {
  if (game.over || settings.mode !== 'cpu' || game.turn !== 'O') return;
  game.busy = true;
  render();
  cpuTimer = setTimeout(
    () => {
      cpuTimer = null;
      game.busy = false;
      const square =
        settings.variant === 'vanish'
          ? pickVanishMove(game, 'O', settings.diff)
          : pickMove(game.board, 'O', settings.diff);
      place(square, 'O');
    },
    420 + Math.random() * 250,
  );
}

// Clears the board locally without telling anyone
function resetBoard() {
  clearTimeout(cpuTimer);
  cpuTimer = null;
  game.board = emptyBoard();
  game.marks = { X: [], O: [] };
  game.turn = settings.starter;
  game.over = false;
  game.busy = false;
  round = {
    moves: [],
    starter: game.turn,
    diff: settings.diff,
    variant: settings.variant,
    startedAt: Date.now(),
  };
  clearBoard();
  if (settings.mode === 'puzzle') startPuzzle();
}

function newRound() {
  if (online()) return askNextRound();
  if (settings.mode === 'puzzle') return;
  resetBoard();
  render();
  maybeCpu();
}

// Hints: the move the computer would play, for vs Computer and Same screen
function showHint() {
  if (online() || settings.mode === 'puzzle' || !isHumanTurn() || game.busy) return;
  const i = hintMove(game, game.turn, settings.variant);
  highlight(i);
  statusEl.innerHTML = t('Try row {row}, column {col}.', {
    row: Math.floor(i / 3) + 1,
    col: (i % 3) + 1,
  });
}

function setVariant(v) {
  if (settings.variant === v) return;
  settings.variant = v;
  saveSettings();
  if (online()) return render(); // for the next invitation or quick match
  resetBoard();
  render();
  maybeCpu();
}

function resetScores() {
  if (online()) return;
  settings.scores = zeroScores();
  settings.starter = 'X';
  saveSettings();
  newRound();
}

function setMode(mode) {
  if (settings.mode === mode) return;
  if (inMatch()) {
    const ok = window.confirm(
      t('Leave your game with {name}? A round in progress counts as a loss.', {
        name: opponent().username,
      }),
    );
    if (!ok) return;
    abandonMatch();
  }
  settings.mode = mode;
  settings.scores = zeroScores();
  settings.starter = 'X';
  saveSettings();
  resetBoard();
  setNetMessage('');
  render();
  maybeCpu();
}

/* ---------- Wiring ---------- */

initBoard(humanMove);
initOnline({ render, resetBoard });
initPuzzle({ render });

document
  .querySelectorAll('[data-mode]')
  .forEach((/** @type {HTMLElement} */ b) =>
    b.addEventListener('click', () => setMode(b.dataset.mode)),
  );
document.querySelectorAll('[data-diff]').forEach((/** @type {HTMLElement} */ b) =>
  b.addEventListener('click', () => {
    if (settings.diff === b.dataset.diff) return;
    settings.diff = b.dataset.diff;
    saveSettings();
    render();
  }),
);
document
  .querySelectorAll('[data-variant]')
  .forEach((/** @type {HTMLElement} */ b) =>
    b.addEventListener('click', () => setVariant(b.dataset.variant)),
  );
$('next').addEventListener('click', newRound);
$('hintBtn').addEventListener('click', showHint);
function renderSound() {
  $('soundBtn').setAttribute('aria-pressed', String(soundOn()));
  $('soundBtn').textContent = soundOn() ? '🔊' : '🔇';
}
$('soundBtn').addEventListener('click', () => {
  setSound(!soundOn());
  renderSound();
});
renderSound();
$('reset').addEventListener('click', resetScores);
// The locked panel's button: sign up as a guest, or the same as the email banner's
$('guestJoin').addEventListener('click', () =>
  currentUser() ? $('emailAction').click() : leaveGuest(),
);

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if ($('gameView').hidden || document.querySelector('dialog[open]')) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key in KEYMAP) humanMove(KEYMAP[e.key]);
  else if (e.key === 'n' || e.key === 'N') newRound();
  else if (e.key === 'h' || e.key === 'H') showHint();
});

initStats();
initReplay();

// Installable, and playable offline (see sw.js). Browsers only allow it
// over https or on localhost; elsewhere this quietly does nothing.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
initLeaderboard(currentUser);
initLobby({
  send: sendToLobby,
  variant: () => settings.variant,
  message: setNetMessage,
});

resetBoard();

// A new language: redraw everything this file and online.js wrote
onLangChange(() => {
  renderReactions();
  render();
});

initAccount({
  onSignIn() {
    checkAchievements(); // takes note of what's already earned
    resetBoard();
    if (canPlayOnline()) goOnline();
    render();
    maybeCpu();
  },
  // The email was confirmed (online opens) or changed (it closes until confirmed)
  onEmailState() {
    if (canPlayOnline()) goOnline();
    else {
      goOffline();
      setNetMessage('');
    }
    render();
  },
  onGuest() {
    goOffline();
    resetBoard();
    setNetMessage('');
    render();
    maybeCpu();
  },
  onSignOut() {
    goOffline();
    if (online()) settings.scores = zeroScores();
    resetBoard();
    setNetMessage('');
    render();
  },
});
