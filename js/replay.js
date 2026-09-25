// Replays a finished game from the history, move by move. Games are stored
// as the list of squares played plus who went first and the rules, so the
// board at any step is rebuilt with rules.js. For classic games it can
// also show the player's first mistake (analysis.js).

import { gameResult, replay } from './rules.js';
import { mistakes } from './analysis.js';
import { replayUltimate } from './ultimate.js';
import { createUltimateBoard } from './ultimate-board.js';
import { markSVG } from './marks.js';
import { t } from './i18n.js';

const STEP_MS = 800;
// Any element by id, typed loosely: the pages hold forms, dialogs and inputs
const $ = (id) => /** @type {any} */ (document.getElementById(id));

let game = null; // { squares, starter, variant, symbol }
let step = 0;
let timer = null;
let cells = [];
let ub = null; // the Ultimate board, for games under those rules

function stop() {
  clearInterval(timer);
  timer = null;
  $('replayPlay').textContent = t('▶ Play');
  $('replayPlay').setAttribute('aria-label', t('Play'));
}

function show(n) {
  step = Math.max(0, Math.min(n, game.squares.length));
  const moves = game.squares.slice(0, step);
  const onUltimate = game.variant === 'ultimate';
  $('replayBoard').hidden = onUltimate;
  $('replayUBoard').hidden = !onUltimate;
  if (onUltimate) {
    ub.render(replayUltimate(moves, game.starter), { last: moves.at(-1) ?? -1 });
    return steps();
  }
  const { board } = replay(moves, game.starter, game.variant);
  const last = moves.at(-1);
  const end = step === game.squares.length ? gameResult(board, step, game.variant) : null;
  cells.forEach((c, i) => {
    const v = board[i];
    // Only the newest mark is drawn with the pencil; the rest are already there
    c.innerHTML = v ? markSVG(v, i === last ? '' : 'still') : '';
    c.classList.toggle('hit', !!end?.line?.includes(i));
    c.classList.remove('hinted', 'mistake');
    const row = Math.floor(i / 3) + 1;
    const col = (i % 3) + 1;
    c.setAttribute(
      'aria-label',
      t('Row {row}, column {col}: {value}', { row, col, value: v || t('empty') }),
    );
  });
  $('replayBoard').classList.toggle('won', !!end?.line);
  steps();
}

// The move counter and the buttons
function steps() {
  $('replayStep').textContent = step
    ? t('Move {n} of {total}', { n: step, total: game.squares.length })
    : t('Start: {mark} moves first', { mark: game.starter });
  $('replayBack').disabled = $('replayFirst').disabled = step === 0;
  $('replayNext').disabled = $('replayLast').disabled = step === game.squares.length;
  $('replayNote').textContent = '';
}

// Stops at the player's first mistake: the board just before it, the move
// they played marked, and the move that would have kept more lit up
function showMistake() {
  stop();
  const [first] = mistakes(game);
  if (!first) {
    show(game.squares.length);
    $('replayNote').textContent = t('No mistakes: you played this one perfectly.');
    return;
  }
  show(first.move);
  const place = (i) => ({ row: Math.floor(i / 3) + 1, col: (i % 3) + 1 });
  cells[first.played].classList.add('mistake');
  first.best.forEach((i) => cells[i].classList.add('hinted'));
  const played = place(first.played);
  const best = place(first.best[0]);
  $('replayNote').textContent = t(
    first.to === 'loss' && first.from === 'win'
      ? 'Move {n}: row {row}, column {col} turned a win into a loss. Row {bestRow}, column {bestCol} would have won.'
      : first.to === 'loss'
        ? 'Move {n}: row {row}, column {col} lost the game. Row {bestRow}, column {bestCol} would have held the draw.'
        : 'Move {n}: row {row}, column {col} gave away the win. Row {bestRow}, column {bestCol} would have won.',
    { n: first.move + 1, ...played, bestRow: best.row, bestCol: best.col },
  );
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

// g: a game ({ squares, starter, variant, symbol }), with symbol the
// player's own mark when known. `analyze` goes straight to their mistake.
export function openReplay(g, title, { analyze = false } = {}) {
  game = {
    squares: g.squares,
    starter: g.starter || 'X',
    variant: g.variant || 'classic',
    symbol: g.symbol ?? null,
  };
  $('replayWho').textContent = title;
  $('replayWhy').hidden = game.variant !== 'classic' || !game.symbol;
  ub.clear();
  $('replayDialog').showModal();
  stop();
  if (analyze && !$('replayWhy').hidden) return showMistake();
  show(0);
  play();
}

export function initReplay() {
  ub = createUltimateBoard($('replayUBoard'));
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
  $('replayWhy').addEventListener('click', showMistake);
  $('replayDialog').addEventListener('close', stop);
  $('replayDialog')
    .querySelector('[data-close]')
    .addEventListener('click', () => $('replayDialog').close());
}
