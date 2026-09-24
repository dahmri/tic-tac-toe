// Replays a finished game from the history, move by move. Games are stored
// as the list of squares played plus who went first and the rules, so the
// board at any step is rebuilt with rules.js.

import { gameResult, replay } from './rules.js';
import { markSVG } from './marks.js';
import { t } from './i18n.js';

const STEP_MS = 800;
const $ = (id) => document.getElementById(id);

let game = null; // { squares, starter, variant, title }
let step = 0;
let timer = null;
let cells = [];

function stop() {
  clearInterval(timer);
  timer = null;
  $('replayPlay').textContent = t('▶ Play');
  $('replayPlay').setAttribute('aria-label', t('Play'));
}

function show(n) {
  step = Math.max(0, Math.min(n, game.squares.length));
  const moves = game.squares.slice(0, step);
  const { board } = replay(moves, game.starter, game.variant);
  const last = moves.at(-1);
  const end = step === game.squares.length ? gameResult(board, step, game.variant) : null;
  cells.forEach((c, i) => {
    const v = board[i];
    // Only the newest mark is drawn with the pencil; the rest are already there
    c.innerHTML = v ? markSVG(v, i === last ? '' : 'still') : '';
    c.classList.toggle('hit', !!end?.line?.includes(i));
    const row = Math.floor(i / 3) + 1;
    const col = (i % 3) + 1;
    c.setAttribute(
      'aria-label',
      t('Row {row}, column {col}: {value}', { row, col, value: v || t('empty') }),
    );
  });
  $('replayBoard').classList.toggle('won', !!end?.line);
  $('replayStep').textContent = step
    ? t('Move {n} of {total}', { n: step, total: game.squares.length })
    : t('Start: {mark} moves first', { mark: game.starter });
  $('replayBack').disabled = $('replayFirst').disabled = step === 0;
  $('replayNext').disabled = $('replayLast').disabled = step === game.squares.length;
}

function play() {
  if (timer) return stop();
  if (step === game.squares.length) show(0);
  $('replayPlay').textContent = t('⏸ Pause');
  $('replayPlay').setAttribute('aria-label', t('Pause'));
  timer = setInterval(() => {
    show(step + 1);
    if (step === game.squares.length) stop();
  }, STEP_MS);
}

// g: a history entry ({ squares, starter, variant }) and a title for it
export function openReplay(g, title) {
  game = { squares: g.squares, starter: g.starter || 'X', variant: g.variant || 'classic' };
  $('replayWho').textContent = title;
  $('replayDialog').showModal();
  stop();
  show(0);
  play();
}

export function initReplay() {
  const board = $('replayBoard');
  cells = Array.from({ length: 9 }, () => {
    const c = document.createElement('div');
    c.className = 'cell';
    c.setAttribute('role', 'img');
    board.append(c);
    return c;
  });
  const wire = (id, fn) =>
    $(id).addEventListener('click', () => {
      if (id !== 'replayPlay') stop();
      fn();
    });
  wire('replayFirst', () => show(0));
  wire('replayBack', () => show(step - 1));
  wire('replayPlay', play);
  wire('replayNext', () => show(step + 1));
  wire('replayLast', () => show(game.squares.length));
  $('replayDialog').addEventListener('close', stop);
  $('replayDialog')
    .querySelector('[data-close]')
    .addEventListener('click', () => $('replayDialog').close());
}
