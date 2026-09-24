// The board on the page: nine squares, hand-drawn marks, the winning line,
// the celebration and the tally-mark scores. It knows nothing about the
// rules: main.js and online.js tell it what to draw.

import { markSVG } from './marks.js';
import { t } from './i18n.js';

const CENTER = (i) => [50 + (i % 3) * 100, 50 + Math.floor(i / 3) * 100];
const STAR = 'M0 -12 L3 -3 L12 -3 L5 3 L8 12 L0 6 L-8 12 L-5 3 L-12 -3 L-3 -3 Z';
const SPIRAL = 'M0 0 C4 -4 9 1 5 6 C0 11 -9 5 -6 -3 C-2 -12 12 -10 12 1';

const $ = (id) => document.getElementById(id);
const boardEl = $('board');
const winEl = $('winline');
const confettiEl = $('confetti');
const cells = [];

// Builds the nine squares; onPlay(i) runs when one is clicked
export function initBoard(onPlay) {
  for (let i = 0; i < 9; i++) {
    const b = document.createElement('button');
    b.className = 'cell';
    b.type = 'button';
    b.id = 'cell-' + i;
    b.addEventListener('click', () => onPlay(i));
    boardEl.appendChild(b);
    cells.push(b);
  }
}

function drawMark(i, p) {
  cells[i].dataset.mark = p;
  cells[i].innerHTML = markSVG(p, '');
}

// Brings the squares in line with `board`: draws new marks (with the
// pencil) and erases ones that vanished under the 3-mark rules
export function syncMarks(board) {
  board.forEach((v, i) => {
    if (!v && cells[i].dataset.mark) {
      delete cells[i].dataset.mark;
      cells[i].innerHTML = '';
    } else if (v && cells[i].dataset.mark !== v) drawMark(i, v);
  });
}

// Every square's state: who can click, the preview mark, the fading mark
export function renderSquares({ board, turn, playable, fading }) {
  cells.forEach((c, i) => {
    const v = board[i];
    const row = Math.floor(i / 3) + 1;
    const col = (i % 3) + 1;
    c.disabled = !!v || !playable;
    c.classList.toggle('fading', i === fading);
    const label = t('Row {row}, column {col}: {value}', { row, col, value: v || t('empty') });
    c.setAttribute('aria-label', i === fading ? `${label} ${t('(vanishes next)')}` : label);
    if (!v) c.innerHTML = playable ? markSVG(turn, 'ghost') : '';
  });
}

export const isWon = () => boardEl.classList.contains('won');

export function drawWin(line) {
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
export function celebrate() {
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

// An empty board: no marks, no line, no stars
export function clearBoard() {
  winEl.innerHTML = '';
  confettiEl.replaceChildren();
  boardEl.classList.remove('won');
  cells.forEach((c) => {
    c.classList.remove('hit', 'hinted', 'fading');
    delete c.dataset.mark;
    c.innerHTML = '';
  });
}

export function highlight(i) {
  clearHighlight();
  cells[i].classList.add('hinted');
}

export function clearHighlight() {
  cells.forEach((c) => c.classList.remove('hinted'));
}

// Scores as tally marks: four uprights and a slash per gate of five
export function tally(el, n) {
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
