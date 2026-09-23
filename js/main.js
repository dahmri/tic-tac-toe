// UI: renders the board, handles input, keeps score.

import { winner, emptyBoard, other } from './rules.js';
import { pickMove } from './ai.js';

const STORAGE_KEY = 'pencil-ttt';
const CENTER = i => [50 + (i % 3) * 100, 50 + Math.floor(i / 3) * 100];
const X_PATHS = ['M22 22 C40 40 58 60 79 79', 'M78 21 C60 40 42 58 22 80'];
const O_PATH = 'M52 17 C73 16 85 33 83 51 C81 72 65 84 47 83 C28 81 16 65 18 46 C20 29 34 18 56 21';
// Keypad layout: 7 8 9 on top, 1 2 3 on the bottom
const KEYMAP = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

const $ = id => document.getElementById(id);
const boardEl = $('board');
const statusEl = $('status');
const winEl = $('winline');

const state = load();
let board;
let turn;
let over;
let busy = false;

function load() {
  const base = { mode: 'cpu', diff: 'casual', scores: { X: 0, O: 0, D: 0 }, starter: 'X' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.scores) return { ...base, ...saved };
  } catch (e) { /* storage unavailable: start fresh */ }
  return base;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
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

function isHumanTurn() {
  return !over && (state.mode === 'pvp' || turn === 'X');
}

function render() {
  cells.forEach((c, i) => {
    const v = board[i];
    const row = Math.floor(i / 3) + 1;
    const col = (i % 3) + 1;
    c.disabled = !!v || !isHumanTurn() || busy;
    c.setAttribute('aria-label', `Row ${row}, column ${col}: ${v || 'empty'}`);
    if (!v) c.innerHTML = isHumanTurn() ? markSVG(turn, 'ghost') : '';
  });

  const tag = t => `<span class="${t.toLowerCase()}">${t}</span>`;
  const w = winner(board);
  if (w && w.p === 'D') {
    statusEl.innerHTML = `<mark>Cat's game.</mark> Nobody wins.`;
  } else if (w) {
    if (state.mode === 'cpu') {
      statusEl.innerHTML = w.p === 'X' ? `<mark>You win!</mark> Nice line.` : `<mark>Computer wins.</mark> Go again?`;
    } else {
      statusEl.innerHTML = `<mark>${tag(w.p)} wins!</mark>`;
    }
  } else if (state.mode === 'cpu') {
    statusEl.innerHTML = turn === 'X' ? `Your move, ${tag('X')}` : `Computer is thinking…`;
  } else {
    statusEl.innerHTML = `${tag(turn)} to play`;
  }

  $('lblX').textContent = state.mode === 'cpu' ? 'You · X' : 'Player X';
  $('lblO').textContent = state.mode === 'cpu' ? 'Computer · O' : 'Player O';
  $('diffGroup').hidden = state.mode !== 'cpu';
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
  document.querySelectorAll('[data-diff]').forEach(b => b.setAttribute('aria-pressed', b.dataset.diff === state.diff));

  tally($('tX'), state.scores.X);
  tally($('tO'), state.scores.O);
  tally($('tD'), state.scores.D);
}

// Scores as tally marks: four uprights and a slash per gate of five
function tally(el, n) {
  el.setAttribute('aria-label', String(n));
  if (n === 0) { el.innerHTML = '<span class="zero">—</span>'; return; }
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
  cells[i].innerHTML = markSVG(p, '');
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
  const ex = (x2 - x1) / len * 38;
  const ey = (y2 - y1) / len * 38;
  const bend = 4;
  winEl.innerHTML = `<path class="draw" pathLength="1"
    d="M${x1 - ex} ${y1 - ey} Q${(x1 + x2) / 2 + bend} ${(y1 + y2) / 2 - bend} ${x2 + ex} ${y2 + ey}"/>`;
  boardEl.classList.add('won');
  line.forEach(i => cells[i].classList.add('hit'));
}

function humanMove(i) {
  if (board[i] || !isHumanTurn() || busy) return;
  place(i, turn);
  maybeCpu();
}

function maybeCpu() {
  if (over || state.mode !== 'cpu' || turn !== 'O') return;
  busy = true;
  render();
  setTimeout(() => {
    busy = false;
    place(pickMove(board, 'O', state.diff), 'O');
  }, 420 + Math.random() * 250);
}

function newRound() {
  board = emptyBoard();
  turn = state.starter;
  over = false;
  busy = false;
  winEl.innerHTML = '';
  boardEl.classList.remove('won');
  cells.forEach(c => { c.classList.remove('hit'); c.innerHTML = ''; });
  render();
  maybeCpu();
}

function resetScores() {
  state.scores = { X: 0, O: 0, D: 0 };
  state.starter = 'X';
  save();
  newRound();
}

document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
  if (state.mode === b.dataset.mode) return;
  state.mode = b.dataset.mode;
  resetScores();
}));
document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => {
  if (state.diff === b.dataset.diff) return;
  state.diff = b.dataset.diff;
  save();
  render();
}));
$('next').addEventListener('click', newRound);
$('reset').addEventListener('click', resetScores);

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key in KEYMAP) humanMove(KEYMAP[e.key]);
  else if (e.key === 'n' || e.key === 'N') newRound();
});

newRound();
