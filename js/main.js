// UI: renders the board, handles input, keeps score, and runs online
// matches (played on the game server) through the live connection.

import { winner, emptyBoard, other } from './rules.js';
import { pickMove } from './ai.js';
import { currentUser, initAccount, isGuest, leaveGuest } from './account.js';
import { avatarEmoji } from './avatars.js';
import { connectLive } from './live.js';
import { countryFlag } from './countries.js';
import {
  handleLobbyMessage,
  initLobby,
  lobbyError,
  resetLobby,
  setLastOpponent,
  setLobby,
} from './lobby.js';
import { initStats, recordCpuGame, signed } from './stats.js';
import { initLeaderboard } from './leaderboard.js';
import { setSound, sound, soundOn } from './sound.js';

const STORAGE_KEY = 'pencil-ttt';
const MODES = ['cpu', 'pvp', 'online'];
const CENTER = (i) => [50 + (i % 3) * 100, 50 + Math.floor(i / 3) * 100];
const X_PATHS = ['M22 22 C40 40 58 60 79 79', 'M78 21 C60 40 42 58 22 80'];
const O_PATH = 'M52 17 C73 16 85 33 83 51 C81 72 65 84 47 83 C28 81 16 65 18 46 C20 29 34 18 56 21';
// Keypad layout: 7 8 9 on top, 1 2 3 on the bottom
const KEYMAP = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

const $ = (id) => document.getElementById(id);
const boardEl = $('board');
const statusEl = $('status');
const winEl = $('winline');
const confettiEl = $('confetti');
const STAR = 'M0 -12 L3 -3 L12 -3 L5 3 L8 12 L0 6 L-8 12 L-5 3 L-12 -3 L-3 -3 Z';
const SPIRAL = 'M0 0 C4 -4 9 1 5 6 C0 11 -9 5 -6 -3 C-2 -12 12 -10 12 1';

const zeroScores = () => ({ X: 0, O: 0, D: 0 });

const state = load();
let board;
let turn;
let over;
let busy = false;
let cpuTimer = null;
// The round in progress, recorded when a game against the computer ends
let round = { moves: [], starter: 'X', diff: 'casual', startedAt: 0 };

// Online: the live connection, the signed-in player, and the current match
// exactly as the server last sent it (the server is the referee)
let live = null;
let liveStatus = 'offline'; // 'connecting' | 'online' | 'offline'
let me = null;
let match = null;
// Latest known ratings, by player id, and the points each player won or
// lost in the round that just ended ({ match, round, change: { id: n } })
const ratings = new Map();
let lastRound = null;

const online = () => state.mode === 'online';
// Guests can pick Online, but only see what an account would unlock
const guestLocked = () => online() && isGuest();
const inMatch = () => !!match && !match.ended;
const mySymbol = () => (match && match.players.O.id === me?.id ? 'O' : 'X');
const opponent = () => (match ? match.players[other(mySymbol())] : null);
const ratingOf = (p) => ratings.get(p.id) ?? p.rating;

function load() {
  const base = { mode: 'cpu', diff: 'casual', scores: zeroScores(), starter: 'X' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.scores) {
      const s = { ...base, ...saved };
      if (!MODES.includes(s.mode)) s.mode = 'cpu';
      if (s.mode === 'online') {
        s.scores = zeroScores();
        s.starter = 'X';
      }
      return s;
    }
  } catch {
    /* storage unavailable: start fresh */
  }
  return base;
}

function save() {
  // Online scores belong to the match, not this browser
  const data = online() ? { ...state, scores: zeroScores(), starter: 'X' } : state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

// Build the nine squares
const cells = [];
for (let i = 0; i < 9; i++) {
  const b = document.createElement('button');
  b.className = 'cell';
  b.type = 'button';
  b.id = 'cell-' + i;
  b.addEventListener('click', () => humanMove(i));
  boardEl.appendChild(b);
  cells.push(b);
}

function markSVG(p, cls) {
  if (p === 'X') {
    return `<svg class="mx ${cls}" viewBox="0 0 100 100" aria-hidden="true">
      <path class="draw" pathLength="1" d="${X_PATHS[0]}"/><path class="draw d2" pathLength="1" d="${X_PATHS[1]}"/></svg>`;
  }
  return `<svg class="mo ${cls}" viewBox="0 0 100 100" aria-hidden="true">
    <path class="draw" pathLength="1" d="${O_PATH}"/></svg>`;
}

function drawMark(i, p) {
  cells[i].dataset.mark = p;
  cells[i].innerHTML = markSVG(p, '');
}

function isHumanTurn() {
  if (over) return false;
  if (state.mode === 'cpu') return turn === 'X';
  if (state.mode === 'pvp') return true;
  return inMatch() && liveStatus === 'online' && turn === mySymbol();
}

function statusHTML() {
  const tag = (t) => `<span class="${t.toLowerCase()}">${t}</span>`;

  if (guestLocked()) return '';
  if (online() && !inMatch()) {
    if (liveStatus !== 'online') return 'Connecting…';
    return 'Find an opponent, or invite a player.';
  }

  const w = winner(board);
  const rival = opponent()?.username;
  if (online() && over) {
    const change = roundChange();
    const points = change === null ? '' : ` ${deltaHTML(change)}`;
    if (match.forfeit) {
      return match.result === mySymbol()
        ? `<mark>You win!</mark> ${rival} left.${points}`
        : `<mark>${rival} wins.</mark>${points}`;
    }
    if (w && w.p === 'D') return `<mark>Cat's game.</mark> Nobody wins.${points}`;
    if (w) {
      return w.p === mySymbol()
        ? `<mark>You win!</mark> Nice line.${points}`
        : `<mark>${rival} wins.</mark> Go again?${points}`;
    }
  }
  if (w && w.p === 'D') return `<mark>Cat's game.</mark> Nobody wins.`;
  if (w) {
    if (state.mode === 'cpu') {
      return w.p === 'X'
        ? `<mark>You win!</mark> Nice line.`
        : `<mark>Computer wins.</mark> Go again?`;
    }
    return `<mark>${tag(w.p)} wins!</mark>`;
  }
  if (state.mode === 'cpu')
    return turn === 'X' ? `Your move, ${tag('X')}` : 'Computer is thinking…';
  if (online()) {
    if (liveStatus !== 'online') return 'Reconnecting…';
    return turn === mySymbol() ? `Your move, ${tag(turn)}` : `${rival} is thinking…`;
  }
  return `${tag(turn)} to play`;
}

// My rating points for the round on the board, once the server has sent them
function roundChange() {
  if (!lastRound || lastRound.match !== match?.id || lastRound.round !== match.round) return null;
  return lastRound.change[me.id] ?? null;
}

function deltaHTML(n) {
  const cls = n > 0 ? 'delta up' : n < 0 ? 'delta down' : 'delta';
  return `<span class="${cls}" title="Rating points">${signed(n)}</span>`;
}

function renderMe() {
  const chip = $('meRating');
  const rating = me ? ratingOf(me) : null;
  chip.hidden = !rating;
  chip.textContent = rating ? String(rating) : '';
}

function playerLabel(p) {
  if (state.mode === 'cpu') return p === 'X' ? 'You · X' : 'Computer · O';
  if (online()) {
    if (!inMatch()) return `Player ${p}`;
    return p === mySymbol() ? `You · ${p}` : `${match.players[p].username} · ${p}`;
  }
  return `Player ${p}`;
}

function render() {
  const humanTurn = isHumanTurn();
  cells.forEach((c, i) => {
    const v = board[i];
    const row = Math.floor(i / 3) + 1;
    const col = (i % 3) + 1;
    c.disabled = !!v || !humanTurn || busy;
    c.setAttribute('aria-label', `Row ${row}, column ${col}: ${v || 'empty'}`);
    if (!v) c.innerHTML = humanTurn && !busy ? markSVG(turn, 'ghost') : '';
  });

  statusEl.innerHTML = statusHTML();
  $('lblX').textContent = playerLabel('X');
  $('lblO').textContent = playerLabel('O');
  $('diffGroup').hidden = state.mode !== 'cpu';
  document
    .querySelectorAll('[data-mode]')
    .forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
  document
    .querySelectorAll('[data-diff]')
    .forEach((b) => b.setAttribute('aria-pressed', b.dataset.diff === state.diff));

  $('guestLocked').hidden = !guestLocked();
  $('onlinePanel').hidden = !online() || guestLocked();
  $('lobby').hidden = inMatch();
  $('roomInfo').hidden = !inMatch();
  $('board').hidden = online() && !inMatch();
  document.querySelector('.scores').hidden = online() && !inMatch();
  if (inMatch()) {
    const rival = opponent();
    $('opponentName').textContent =
      `${avatarEmoji(rival.avatar)} ${countryFlag(rival.country)} ${rival.username}`;
    const chip = document.createElement('span');
    chip.className = 'rating-chip';
    chip.title = 'Rating';
    chip.textContent = String(ratingOf(rival));
    $('opponentName').append(' ', chip);
    $('roomRole').textContent =
      mySymbol() === 'X' ? 'You are X and open the first round.' : 'You are O.';
  }
  const locked = online() && !inMatch();
  $('next').disabled = locked || (online() && !over);
  $('reset').hidden = online();
  $('next').closest('.actions').hidden = online() && !inMatch();

  setLobby({ visible: online() && !guestLocked() && !$('gameView').hidden, inMatch: inMatch() });
  renderMe();

  tally($('tX'), state.scores.X);
  tally($('tO'), state.scores.O);
  tally($('tD'), state.scores.D);
}

// Scores as tally marks: four uprights and a slash per gate of five
function tally(el, n) {
  el.setAttribute('aria-label', String(n));
  if (n === 0) {
    el.innerHTML = '<span class="zero">—</span>';
    return;
  }
  const groups = Math.min(Math.ceil(n / 5), 4);
  let html = '';
  for (let g = 0; g < groups; g++) {
    const k = Math.min(5, n - g * 5);
    let paths = '';
    for (let j = 0; j < Math.min(k, 4); j++) {
      const x = 5 + j * 7;
      const wobble = (j % 2 ? 1 : -1) * 0.8;
      paths += `<path d="M${x} 3 L${x + wobble} 25"/>`;
    }
    if (k === 5) paths += '<path d="M1 19 L30 8"/>';
    html += `<svg viewBox="0 0 32 28" aria-hidden="true">${paths}</svg>`;
  }
  if (n > 20) html += `<span class="n">${n}</span>`;
  el.innerHTML = html;
}

function place(i, p) {
  board[i] = p;
  drawMark(i, p);
  // A game counts at the difficulty it started with, from its first move
  if (!round.moves.length) round = { ...round, diff: state.diff, startedAt: Date.now() };
  round.moves.push(i);
  sound.mark(p);
  const w = winner(board);
  if (w) {
    over = true;
    if (w.p === 'D') sound.draw();
    else if (state.mode === 'cpu' && w.p === 'O') sound.lose();
    else {
      sound.win();
      celebrate();
    }
    // Guests' games aren't recorded: they have no stats
    if (state.mode === 'cpu' && state.diff === round.diff && currentUser()) {
      recordCpuGame({
        difficulty: round.diff,
        starter: round.starter,
        moves: round.moves,
        seconds: Math.round((Date.now() - round.startedAt) / 1000),
      });
    }
    state.scores[w.p]++;
    state.starter = other(state.starter); // alternate who opens the next round
    save();
    if (w.line) drawWin(w.line);
  } else {
    turn = other(p);
  }
  render();
}

function drawWin(line) {
  const [x1, y1] = CENTER(line[0]);
  const [x2, y2] = CENTER(line[2]);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ex = ((x2 - x1) / len) * 38;
  const ey = ((y2 - y1) / len) * 38;
  const bend = 4;
  winEl.innerHTML = `<path class="draw" pathLength="1"
    d="M${x1 - ex} ${y1 - ey} Q${(x1 + x2) / 2 + bend} ${(y1 + y2) / 2 - bend} ${x2 + ex} ${y2 + ey}"/>`;
  boardEl.classList.add('won');
  line.forEach((i) => cells[i].classList.add('hit'));
}

// Pencil stars and spirals around the board, for the player's own wins.
// Built through the DOM: the page's CSP doesn't allow inline style attributes.
function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const shapes = [];
  for (let k = 0; k < 10; k++) {
    const angle = (k / 10) * Math.PI * 2 + Math.random() * 0.5;
    const r = 95 + Math.random() * 45;
    // Keep them on the board: on a phone it fills the screen's width
    const at = (v) => Math.min(Math.max(150 + v * r, 16), 284).toFixed(1);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', k % 3 === 2 ? SPIRAL : STAR);
    path.setAttribute('transform', `translate(${at(Math.cos(angle))} ${at(Math.sin(angle))})`);
    path.classList.add(`c${k % 3}`);
    path.style.animationDelay = `${(0.55 + Math.random() * 0.45).toFixed(2)}s`;
    shapes.push(path);
  }
  confettiEl.replaceChildren(...shapes);
}

function humanMove(i) {
  if (board[i] || !isHumanTurn() || busy) return;
  if (online()) {
    // The server checks the move and sends everyone the new board
    busy = live.send({ t: 'move', match: match.id, square: i });
    render();
    return;
  }
  place(i, turn);
  maybeCpu();
}

function maybeCpu() {
  if (over || state.mode !== 'cpu' || turn !== 'O') return;
  busy = true;
  render();
  cpuTimer = setTimeout(
    () => {
      cpuTimer = null;
      busy = false;
      place(pickMove(board, 'O', state.diff), 'O');
    },
    420 + Math.random() * 250,
  );
}

// Clears the board locally without telling anyone
function resetBoard() {
  clearTimeout(cpuTimer);
  cpuTimer = null;
  board = emptyBoard();
  turn = state.starter;
  round = { moves: [], starter: turn, diff: state.diff, startedAt: Date.now() };
  over = false;
  busy = false;
  winEl.innerHTML = '';
  confettiEl.replaceChildren();
  boardEl.classList.remove('won');
  cells.forEach((c) => {
    c.classList.remove('hit');
    delete c.dataset.mark;
    c.innerHTML = '';
  });
}

function newRound() {
  if (online()) {
    if (inMatch() && over) live.send({ t: 'next-round', match: match.id });
    return;
  }
  resetBoard();
  render();
  maybeCpu();
}

function resetScores() {
  if (online()) return;
  state.scores = zeroScores();
  state.starter = 'X';
  save();
  newRound();
}

function setMode(mode) {
  if (state.mode === mode) return;
  if (inMatch()) {
    const ok = window.confirm(
      `Leave your game with ${opponent().username}? A round in progress counts as a loss.`,
    );
    if (!ok) return;
    live.send({ t: 'leave', match: match.id });
    match = null;
  }
  state.mode = mode;
  state.scores = zeroScores();
  state.starter = 'X';
  save();
  resetBoard();
  setNetMessage('');
  render();
  maybeCpu();
}

/* ---------- Online play ---------- */

function setNetMessage(text) {
  $('netMsg').textContent = text || '';
}

// Shows the match exactly as the server sent it
function showMatch(next) {
  const newMatch = !match || match.id !== next.id;
  const newRound = newMatch || match.round !== next.round;
  const wasOver = !newRound && over;
  // A single new mark is a move played live (a reload redraws them all)
  const fresh = newRound ? next.moves.length : next.moves.length - match.moves.length;
  if (newMatch && next.round === 1 && next.moves.length === 0) sound.matchFound();
  match = next;
  if (!online()) {
    state.mode = 'online';
    save();
  }
  if (newRound) resetBoard();
  board = next.board.slice();
  turn = next.turn;
  over = next.over;
  busy = false;
  state.scores = { ...next.score };
  board.forEach((v, i) => {
    if (v && cells[i].dataset.mark !== v) drawMark(i, v);
  });
  if (next.line && !boardEl.classList.contains('won')) drawWin(next.line);
  if (fresh === 1) sound.mark(next.board[next.moves.at(-1)]);
  if (next.over && !wasOver && fresh <= 1) {
    if (next.result === 'D') sound.draw();
    else if (next.result === mySymbol()) {
      sound.win();
      celebrate();
    } else sound.lose();
  }
}

function onMatch(next) {
  if (next.ended) {
    const rival = next.players[other(next.players.O.id === me.id ? 'O' : 'X')].username;
    const iLeft = next.leftBy === (next.players.O.id === me.id ? 'O' : 'X');
    if (match?.id === next.id || !match) {
      setNetMessage(
        iLeft
          ? ''
          : next.forfeit
            ? `${rival} left the game. You win the round.`
            : `${rival} left the game.`,
      );
      match = null;
      state.scores = zeroScores();
      resetBoard();
      setLastOpponent(next.players[next.players.O.id === me.id ? 'X' : 'O']);
    }
  } else {
    if (!match || match.id !== next.id) setNetMessage('');
    showMatch(next);
  }
  render();
}

function onLiveMessage(msg) {
  switch (msg.t) {
    case 'hello':
      me = msg.me;
      ratings.set(me.id, me.rating);
      if (msg.match && !msg.match.ended) showMatch(msg.match);
      else if (match) {
        match = null; // it ended while we were away
        resetBoard();
      }
      handleLobbyMessage(msg); // pending invitations
      break;
    case 'match':
      onMatch(msg.match);
      return;
    case 'ratings': {
      const change = {};
      for (const [id, r] of Object.entries(msg.ratings)) {
        ratings.set(Number(id), r.rating);
        change[id] = r.change;
      }
      lastRound = { match: msg.match, round: msg.round, change };
      break;
    }
    case 'error':
      busy = false;
      setNetMessage(msg.message);
      if (msg.re?.startsWith('invite') || msg.re?.startsWith('queue')) lobbyError();
      break;
    default:
      handleLobbyMessage(msg);
      return;
  }
  render();
}

function goOnline() {
  live?.close();
  live = connectLive({
    onMessage: onLiveMessage,
    onStatus: (status) => {
      liveStatus = status;
      render();
    },
  });
}

function goOffline() {
  live?.close();
  live = null;
  liveStatus = 'offline';
  me = null;
  match = null;
  ratings.clear();
  lastRound = null;
  resetLobby();
}

/* ---------- Wiring ---------- */

document
  .querySelectorAll('[data-mode]')
  .forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelectorAll('[data-diff]').forEach((b) =>
  b.addEventListener('click', () => {
    if (state.diff === b.dataset.diff) return;
    state.diff = b.dataset.diff;
    save();
    render();
  }),
);
$('next').addEventListener('click', newRound);
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
$('guestJoin').addEventListener('click', leaveGuest);
$('leave').addEventListener('click', () => {
  if (inMatch()) live.send({ t: 'leave', match: match.id });
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if ($('gameView').hidden || document.querySelector('dialog[open]')) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key in KEYMAP) humanMove(KEYMAP[e.key]);
  else if (e.key === 'n' || e.key === 'N') newRound();
});

initStats();
initLeaderboard(currentUser);
initLobby({
  send: (msg) => live?.send(msg),
  message: setNetMessage,
});

resetBoard();

initAccount({
  onSignIn() {
    resetBoard();
    goOnline();
    render();
    maybeCpu();
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
    if (online()) state.scores = zeroScores();
    resetBoard();
    setNetMessage('');
    render();
  },
});
