// UI: renders the board, handles input, keeps score, runs online sessions.

import { winner, emptyBoard, other } from './rules.js';
import { pickMove } from './ai.js';
import { hostGame, joinGame } from './net.js';
import { normalizeCode, codeFromHash, inviteLink } from './room.js';
import { stateMessage, parseState, parseMove } from './protocol.js';

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

const state = load();
let board;
let turn;
let over;
let busy = false;
let cpuTimer = null;
// Online session: { role: 'host' | 'guest', code, status, session }
// status: 'starting' | 'waiting' | 'connecting' | 'connected' | 'closed'
let net = null;

const zeroScores = () => ({ X: 0, O: 0, D: 0 });
const online = () => state.mode === 'online';
const isGuest = () => online() && net?.role === 'guest';
const connected = () => net?.status === 'connected';
const mySymbol = () => (net?.role === 'guest' ? 'O' : 'X');

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
  // Online scores belong to the session, not this browser
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
  return connected() && turn === mySymbol();
}

function statusHTML() {
  const tag = (t) => `<span class="${t.toLowerCase()}">${t}</span>`;

  if (online() && !connected()) {
    if (!net) return 'Start a game, or join a friend with their code.';
    if (net.status === 'starting') return 'Setting up a game…';
    if (net.status === 'waiting') return `Waiting for your friend… code <mark>${net.code}</mark>`;
    if (net.status === 'connecting') return 'Connecting…';
    return 'The game has ended.';
  }

  const w = winner(board);
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
        : `<mark>Your friend wins.</mark> Go again?`;
    }
    return `<mark>${tag(w.p)} wins!</mark>`;
  }
  if (state.mode === 'cpu')
    return turn === 'X' ? `Your move, ${tag('X')}` : 'Computer is thinking…';
  if (online()) return turn === mySymbol() ? `Your move, ${tag(turn)}` : 'Your friend is thinking…';
  return `${tag(turn)} to play`;
}

function playerLabel(p) {
  if (state.mode === 'cpu') return p === 'X' ? 'You · X' : 'Computer · O';
  if (online()) return p === mySymbol() ? `You · ${p}` : `Friend · ${p}`;
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
    if (!v) c.innerHTML = humanTurn ? markSVG(turn, 'ghost') : '';
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
  $('lobby').hidden = !!net;
  $('roomInfo').hidden = !net;
  if (net) {
    $('roomCode').textContent = net.code || '······';
    $('roomRole').textContent =
      net.role === 'host' ? 'You are X and open the first round.' : 'You are O.';
    $('invite').value = net.code ? inviteLink(location, net.code) : '';
    $('shareRow').hidden = net.role !== 'host' || !net.code;
  }
  const locked = online() && !connected();
  $('next').disabled = locked;
  $('reset').disabled = locked;

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
  const w = winner(board);
  if (w) {
    over = true;
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
  if (isGuest()) {
    net.session.send({ type: 'move', i }); // the host applies it and sends back the new state
    busy = true;
    render();
    return;
  }
  place(i, turn);
  broadcast();
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
  if (online() && !connected()) return;
  if (isGuest()) {
    net.session.send({ type: 'new-round' });
    return;
  }
  resetBoard();
  render();
  broadcast();
  maybeCpu();
}

function resetScores() {
  if (online() && !connected()) return;
  if (isGuest()) {
    net.session.send({ type: 'reset' });
    return;
  }
  state.scores = zeroScores();
  state.starter = 'X';
  save();
  newRound();
}

function setMode(mode) {
  if (state.mode === mode) return;
  leaveOnline();
  state.mode = mode;
  state.scores = zeroScores();
  state.starter = 'X';
  save();
  resetBoard();
  render();
  maybeCpu();
}

/* ---------- Online play ---------- */

function setNetMessage(text) {
  $('netMsg').textContent = text || '';
}

// Host only: send the whole game to the guest after every change
function broadcast() {
  if (online() && net?.role === 'host' && connected()) {
    net.session.send(
      stateMessage({ board, turn, over, scores: state.scores, starter: state.starter }),
    );
  }
}

function onHostMessage(msg) {
  if (msg.type === 'move') {
    const i = parseMove(msg);
    if (i >= 0 && !over && turn === 'O' && !board[i]) place(i, 'O');
    broadcast(); // also resyncs the guest after a rejected move
  } else if (msg.type === 'new-round') {
    newRound();
  } else if (msg.type === 'reset') {
    resetScores();
  }
}

function onGuestMessage(msg) {
  const s = parseState(msg);
  if (!s) return;
  if (board.some((v, i) => v && v !== s.board[i])) resetBoard(); // a new round started
  board = s.board;
  turn = s.turn;
  over = s.over;
  busy = false;
  state.scores = s.scores;
  state.starter = s.starter;
  board.forEach((v, i) => {
    if (v && cells[i].dataset.mark !== v) drawMark(i, v);
  });
  const w = winner(board);
  if (w?.line && !boardEl.classList.contains('won')) drawWin(w.line);
  render();
}

function startOnline(role, code) {
  leaveOnline();
  state.scores = zeroScores();
  state.starter = 'X';
  resetBoard();
  setNetMessage('');
  net = { role, code, status: role === 'host' ? 'starting' : 'connecting', session: null };
  const current = net;
  const live =
    (fn) =>
    (...args) => {
      if (net === current) fn(...args);
    }; // ignore stale sessions

  const callbacks = {
    onReady: live((c) => {
      current.code = c;
      current.status = 'waiting';
      render();
    }),
    onConnect: live(() => {
      current.status = 'connected';
      setNetMessage('');
      if (role === 'host') {
        resetBoard();
        broadcast();
      }
      render();
    }),
    onData: live(role === 'host' ? onHostMessage : onGuestMessage),
    onLeave: live(() => {
      state.scores = zeroScores();
      state.starter = 'X';
      resetBoard();
      if (role === 'host') {
        current.status = 'waiting';
        setNetMessage('Your friend left. Share the code again to keep playing.');
      } else {
        current.status = 'closed';
        setNetMessage('The host left the game.');
      }
      render();
    }),
    onError: live((message) => {
      if (role === 'guest' || current.status === 'starting') leaveOnline();
      setNetMessage(message);
      render();
    }),
  };

  current.session = role === 'host' ? hostGame(callbacks) : joinGame(code, callbacks);
  render();
}

function leaveOnline() {
  if (!net) return;
  net.session?.leave();
  net = null;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (online()) {
    state.scores = zeroScores();
    resetBoard();
  }
}

async function copyInvite() {
  const field = $('invite');
  try {
    await navigator.clipboard.writeText(field.value);
    $('copyLink').textContent = 'Copied';
    setTimeout(() => {
      $('copyLink').textContent = 'Copy link';
    }, 1600);
  } catch {
    field.focus();
    field.select();
  }
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

$('hostBtn').addEventListener('click', () => startOnline('host', null));
$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = normalizeCode($('joinCode').value);
  if (!code) {
    setNetMessage('Codes are 6 letters and numbers, like K7PQ2M.');
    return;
  }
  startOnline('guest', code);
});
$('leave').addEventListener('click', () => {
  leaveOnline();
  setNetMessage('');
  render();
});
$('copyLink').addEventListener('click', copyInvite);

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof HTMLInputElement) return; // typing a code
  if (e.key in KEYMAP) humanMove(KEYMAP[e.key]);
  else if (e.key === 'n' || e.key === 'N') newRound();
});

window.addEventListener('beforeunload', () => net?.session?.leave());

resetBoard();
render();
maybeCpu();

// Opened from an invite link: jump straight into the game
const invited = codeFromHash(location.hash);
if (invited) {
  if (!online()) {
    state.mode = 'online';
    save();
  }
  startOnline('guest', invited);
}
