// UI: renders the board, handles input, keeps score, and runs online
// matches (played on the game server) through the live connection.

import { winner, emptyBoard, other } from './rules.js';
import { pickMove } from './ai.js';
import { initAccount } from './account.js';
import { connectLive } from './live.js';
import { countryFlag } from './countries.js';
import { handleLobbyMessage, initLobby, lobbyError, resetLobby, setLobby } from './lobby.js';
import { initStats, recordCpuGame } from './stats.js';

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

const online = () => state.mode === 'online';
const inMatch = () => !!match && !match.ended;
const mySymbol = () => (match && match.players.O.id === me?.id ? 'O' : 'X');
const opponent = () => (match ? match.players[other(mySymbol())] : null);

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

  if (online() && !inMatch()) {
    if (liveStatus !== 'online') return 'Connecting…';
    return 'Invite a player, or wait for an invitation.';
  }

  const w = winner(board);
  const rival = opponent()?.username;
  if (online() && match.forfeit && over) {
    return match.result === mySymbol()
      ? `<mark>You win!</mark> ${rival} left.`
      : `<mark>${rival} wins.</mark>`;
  }
  if (w && w.p === 'D') return `<mark>Cat's game.</mark> Nobody wins.`;
  if (w) {
    if (state.mode === 'cpu') {
      return w.p === 'X'
        ? `<mark>You win!</mark> Nice line.`
        : `<mark>Computer wins.</mark> Go again?`;
    }
    if (online()) {
      return w.p === mySymbol()
        ? `<mark>You win!</mark> Nice line.`
        : `<mark>${rival} wins.</mark> Go again?`;
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

  $('onlinePanel').hidden = !online();
  $('lobby').hidden = inMatch();
  $('roomInfo').hidden = !inMatch();
  $('board').hidden = online() && !inMatch();
  document.querySelector('.scores').hidden = online() && !inMatch();
  if (inMatch()) {
    const rival = opponent();
    $('opponentName').textContent = `${countryFlag(rival.country)} ${rival.username}`;
    $('roomRole').textContent =
      mySymbol() === 'X' ? 'You are X and open the first round.' : 'You are O.';
  }
  const locked = online() && !inMatch();
  $('next').disabled = locked || (online() && !over);
  $('reset').hidden = online();
  $('next').closest('.actions').hidden = online() && !inMatch();

  setLobby({ visible: online() && !$('gameView').hidden, inMatch: inMatch() });

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
  const w = winner(board);
  if (w) {
    over = true;
    if (state.mode === 'cpu' && state.diff === round.diff) {
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
  const newRound = !match || match.id !== next.id || match.round !== next.round;
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
    case 'error':
      busy = false;
      setNetMessage(msg.message);
      if (msg.re?.startsWith('invite')) lobbyError();
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
$('reset').addEventListener('click', resetScores);
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
  onSignOut() {
    goOffline();
    if (online()) state.scores = zeroScores();
    resetBoard();
    setNetMessage('');
    render();
  },
});
