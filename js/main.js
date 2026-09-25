// The game page: local play (against the computer or on the same screen),
// the status line, and wiring. The board is drawn by board.js and online
// matches are run by online.js; both share the position in game.js.

import { emptyBoard, gameResult, nextToVanish, other, playOn } from './rules.js';
import { hintMove, pickMove, pickVanishMove } from './ai.js';
import {
  emptyUltimate,
  isLegal as ultimateLegal,
  pickUltimateMove,
  playUltimate,
} from './ultimate.js';
import { createUltimateBoard } from './ultimate-board.js';
import { canPlayOnline, currentUser, initAccount, isGuest, leaveGuest } from './account.js';
import { initLobby } from './lobby.js';
import { initArena } from './arena-ui.js';
import { initTheme } from './theme.js';
import { initMenu } from './menu.js';
import { captureInvite, claimInvite } from './share.js';
import { followRoute, initRoutes } from './routes.js';
import { initStats, recordCpuGame, recordGuestGame } from './stats.js';
import { initLeaderboard } from './leaderboard.js';
import { initReplay, openReplay } from './replay.js';
import { checkAchievements } from './achievements-ui.js';
import { setSound, sound, soundOn } from './sound.js';
import { onLangChange, t } from './i18n.js';
import { initLanguage } from './language.js';
import { initMonitor } from './monitor.js';
import { initLegal } from './legal.js';
import { initPlayerMenu } from './player-menu.js';
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
  lostRound,
  watchPlayer,
  watching,
  matchMoves,
  onBoardMoves,
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
await initLanguage();

// Keypad layout: 7 8 9 on top, 1 2 3 on the bottom
const KEYMAP = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

// Any element by id, typed loosely: the pages hold forms, dialogs and inputs
const $ = (id) => /** @type {any} */ (document.getElementById(id));
const statusEl = $('status');

let cpuTimer = null;
// The Ultimate board (shown instead of the classic one under its rules)
const ubAt = $('uboard');
const ub = createUltimateBoard(ubAt, { onPlay: (i) => humanMove(i) });
const ultimate = () => variant() === 'ultimate';
// The round in progress, recorded when a game against the computer ends
let round = { moves: [], starter: 'X', diff: 'casual', variant: 'classic', startedAt: 0 };

function isHumanTurn() {
  if (game.over) return false;
  if (settings.mode === 'cpu') return game.turn === 'X';
  if (settings.mode === 'pvp') return true;
  if (settings.mode === 'puzzle') return puzzleCanMove();
  return canMove();
}

// The square played last on the board (local game, or online match)
const lastMove = () => (online() ? onBoardMoves().at(-1) : round.moves.at(-1)) ?? -1;

// The result on the board, whatever the rules: { p, line? } or null
function result() {
  if (ultimate()) return game.upos?.result ?? null;
  return gameResult(game.board, online() ? matchMoves() : round.moves.length, variant());
}

function statusHTML() {
  const tag = (m) => `<span class="${m.toLowerCase()}">${m}</span>`;
  if (settings.mode === 'puzzle') return puzzleStatus();
  const w = result();
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
  // One board or the other, by the rules on it
  const onUltimate = ultimate() && !!game.upos;
  if (onUltimate) {
    ub.render(game.upos, { playable: humanTurn && !game.busy, last: lastMove() });
  }
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
  // Only the classic computer can't be beaten
  $('diff-hard').textContent = settings.variant === 'classic' ? t('Unbeatable') : t('Hard');
  // An online match keeps the rules it started with
  const puzzle = settings.mode === 'puzzle';
  $('rulesRow').hidden = inMatch() || watching() || onlineLocked() || puzzle;
  $('ruleNote').hidden = variant() === 'classic';
  $('guideBtn').hidden = variant() === 'classic';
  $('ruleNote').textContent =
    variant() === 'vanish'
      ? t('You keep only your last 3 marks: the faded one vanishes when you play again.')
      : t(
          'Win three small boards in a row. The square you play sends your opponent to that board.',
        );
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
  // Online, the board shows a match: one's own, or one being watched
  const noBoard = online() && !inMatch() && !watching();
  $('board').hidden = noBoard || onUltimate;
  $('uboardWrap').hidden = noBoard || !onUltimate;
  $('scores').hidden = noBoard || puzzle;
  $('next').disabled = (online() && !inMatch()) || (online() && !game.over);
  $('reset').hidden = online();
  $('next').closest('.actions').hidden = (online() && !inMatch()) || puzzle;
  document.body.classList.toggle('spectating', watching());
  renderPuzzle(puzzle);
  $('whyBtn').hidden = !lostGame();

  tally($('tX'), settings.scores.X);
  tally($('tO'), settings.scores.O);
  tally($('tD'), settings.scores.D);
}

// The game just lost against the computer or online, to analyse, or null
function lostGame() {
  if (online()) return lostRound();
  if (settings.mode !== 'cpu' || !game.over || round.variant !== 'classic') return null;
  const w = gameResult(game.board, round.moves.length, 'classic');
  return w?.p === 'O'
    ? { squares: round.moves, starter: round.starter, symbol: 'X', variant: 'classic' }
    : null;
}

/* ---------- Local play ---------- */

function place(i, p) {
  if (settings.variant === 'ultimate') {
    game.upos = playUltimate(game.upos, i);
    game.board = game.upos.cells;
  } else {
    Object.assign(game, playOn(game, i, p, settings.variant));
    syncMarks(game.board);
  }
  clearHighlight();
  // A game counts at the difficulty and rules it started with, from its first move
  if (!round.moves.length) {
    round = { ...round, diff: settings.diff, variant: settings.variant, startedAt: Date.now() };
  }
  round.moves.push(i);
  sound.mark(p);
  const w = result();
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
    if (w.line && settings.variant !== 'ultimate') drawWin(w.line);
  } else {
    game.turn = other(p);
  }
  render();
}

function humanMove(i) {
  if (game.board[i] || !isHumanTurn() || game.busy) return;
  if (ultimate() && !ultimateLegal(game.upos, i)) return;
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
        settings.variant === 'ultimate'
          ? pickUltimateMove(game.upos, settings.diff)
          : settings.variant === 'vanish'
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
  game.marks = { X: [], O: [] };
  game.turn = settings.starter;
  // Online, the match sets the board; locally, the chosen rules do
  game.upos = !online() && settings.variant === 'ultimate' ? emptyUltimate(game.turn) : null;
  game.board = game.upos ? game.upos.cells : emptyBoard();
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
  ub.clear();
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
  if (settings.variant === 'ultimate') {
    const i = pickUltimateMove(game.upos, 'hard');
    ub.highlight(i);
    statusEl.innerHTML = t('Try board {b}, square {c}.', {
      b: Math.floor(i / 9) + 1,
      c: (i % 9) + 1,
    });
    return;
  }
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
$('whyBtn').addEventListener('click', () => {
  const lost = lostGame();
  if (lost) openReplay(lost, t('Your last game'), { analyze: true });
});
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
  // Under the Ultimate rules the keys pick a square in the board to play in
  if (e.key in KEYMAP) {
    if (!ultimate()) humanMove(KEYMAP[e.key]);
    else if (game.upos?.active >= 0) humanMove(game.upos.active * 9 + KEYMAP[e.key]);
  } else if (e.key === 'n' || e.key === 'N') newRound();
  else if (e.key === 'h' || e.key === 'H') showHint();
});

initTheme();
captureInvite();
initMenu();
initStats();
// Admins only, so its code loads when first opened
$('adminBtn').addEventListener('click', () => import('./admin.js').then((m) => m.openAdmin()));
// The guides load when first opened
$('guideBtn').addEventListener('click', () =>
  import('./guide.js').then((m) => m.openGuide(variant())),
);
initRoutes();
initReplay();
initLegal();
initPlayerMenu();

// Installable, and playable offline (see sw.js). Browsers only allow it
// over https or on localhost; elsewhere this quietly does nothing.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
initLeaderboard(currentUser);
initArena({ send: sendToLobby, message: setNetMessage, inMatch });
initLobby({
  me: currentUser,
  send: sendToLobby,
  variant: () => settings.variant,
  watch: watchPlayer,
  message: setNetMessage,
});

resetBoard();

// A new language: redraw everything this file and online.js wrote
onLangChange(() => {
  renderReactions();
  render();
});

initAccount({
  onSignIn(user) {
    // Came through a friend's invite link: they're a friend now
    claimInvite(user).then((name) => {
      if (name) {
        setNetMessage(t('{name} is in your friends now: invite them from the lobby.', { name }));
      }
    });
    checkAchievements(); // takes note of what's already earned
    resetBoard();
    if (canPlayOnline()) goOnline();
    render();
    maybeCpu();
    followRoute(); // opened from a link: /#stats and the like
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
    followRoute();
  },
  onSignOut() {
    goOffline();
    if (online()) settings.scores = zeroScores();
    resetBoard();
    setNetMessage('');
    render();
  },
});
