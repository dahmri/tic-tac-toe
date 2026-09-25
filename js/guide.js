// "How to play" guides for the 3-mark and Ultimate rules: a few steps on a
// small board, some to read and some to try. A "try" step waits for the
// right square; any other square gets a hint. Opened from the rule note.

import { markSVG } from './marks.js';
import { t } from './i18n.js';
import { LINES } from './rules.js';
import { emptyUltimate, isLegal, playUltimate, replayUltimate } from './ultimate.js';
import { createUltimateBoard } from './ultimate-board.js';

const $ = (id) => /** @type {any} */ (document.getElementById(id));

// 3 marks: squares 0-8. `x`, `o`: the marks on the board, oldest first;
// `fading`: the square shown as vanishing next; `target`: the square to
// tap, and `then` what the board looks like after it
const VANISH = [
  {
    text: 'In 3 marks, each player keeps only their last three marks on the board.',
    x: [0],
    o: [4],
  },
  {
    text: 'You have two marks. Place your third one: tap the bottom-left corner.',
    x: [0, 8],
    o: [4, 2],
    target: 6,
    then: { x: [0, 8, 6], o: [4, 2] },
    done: 'Three marks: from now on, each new one wipes out your oldest.',
  },
  {
    text: 'O played too. The faded X is your oldest mark: it vanishes when you play again.',
    x: [0, 8, 6],
    o: [4, 2, 3],
    fading: 0,
  },
  {
    text: 'Tap the bottom-middle square. Your oldest mark vanishes, but you make a line!',
    x: [0, 8, 6],
    o: [4, 2, 3],
    fading: 0,
    target: 7,
    then: { x: [8, 6, 7], o: [4, 2, 3] },
    done: 'Three in a row: you win!',
  },
  {
    text: 'The board never fills up, so a game goes on until someone makes a line. After 60 moves it is a draw.',
    x: [8, 6, 7],
    o: [4, 2, 3],
  },
];

// Ultimate: `moves` played so far (from an empty board, X first);
// `target` the square to tap, or 'any' for any allowed square
const ULTIMATE = [
  {
    text: 'Nine small boards make one big board. Win three small boards in a row to win the game.',
    moves: [],
  },
  {
    text: 'Your first move can go anywhere. Tap the centre square of the top-left board.',
    moves: [],
    target: 4,
    done: 'The square you pick sends your opponent to the matching board: a centre square sends O to the centre board.',
  },
  {
    text: 'O played the top-left square of the centre board, so you are sent to the top-left board. Tap its top-right corner.',
    moves: [4, 36],
    target: 2,
    done: 'That sends O to the top-right board.',
  },
  {
    text: 'O played there and sent you back. Finish your diagonal: tap the bottom-left corner of the top-left board.',
    moves: [4, 36, 2, 18],
    target: 6,
    done: 'Three in a row: the top-left board is yours!',
  },
  {
    text: 'O sent you back to the board you won. It is decided, so you may play in any open board: tap any square.',
    moves: [4, 36, 2, 18, 6, 54],
    target: 'any',
    done: 'A full small board with no line belongs to nobody.',
  },
  {
    text: 'Now win three small boards in a row. Good luck!',
    moves: [4, 36, 2, 18, 6, 54],
  },
];

const GUIDES = {
  vanish: { title: () => t('How to play: 3 marks'), steps: VANISH },
  ultimate: { title: () => t('How to play: Ultimate'), steps: ULTIMATE },
};

let guide = null;
let step = 0;
let solved = false;
let small = null; // the 3x3 board's squares
let ub = null; // the Ultimate board
let upos = null;

function smallBoard() {
  if (small) return small;
  const box = $('guideBoard');
  small = Array.from({ length: 9 }, (_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell';
    b.addEventListener('click', () => tap(i));
    box.append(b);
    return b;
  });
  return small;
}

function drawSmall({ x, o, fading = -1 }, target, playable) {
  const marks = Array(9).fill(null);
  for (const i of x) marks[i] = 'X';
  for (const i of o) marks[i] = 'O';
  const line = LINES.find((l) => l.every((i) => marks[i] === 'X'));
  smallBoard().forEach((b, i) => {
    const v = marks[i];
    b.dataset.mark = v || '';
    b.innerHTML = v ? markSVG(v, 'still') : '';
    b.disabled = !playable || !!v;
    b.classList.toggle('fading', i === fading);
    b.classList.toggle('hinted', playable && i === target);
    b.classList.toggle('won', !!line?.includes(i));
    const row = Math.floor(i / 3) + 1;
    const col = (i % 3) + 1;
    b.setAttribute(
      'aria-label',
      t('Row {row}, column {col}: {value}', { row, col, value: v || t('empty') }),
    );
  });
}

function render() {
  const s = guide.steps[step];
  const tryIt = s.target !== undefined && !solved;
  $('guideStep').textContent = t('Step {n} of {total}', {
    n: step + 1,
    total: guide.steps.length,
  });
  $('guideText').textContent = t(solved ? s.done || s.text : s.text);
  $('guideMsg').textContent = '';
  $('guideBack').disabled = step === 0;
  $('guideNext').disabled = tryIt;
  $('guideNext').textContent = step === guide.steps.length - 1 ? t('Done') : t('Next');
  if (guide === GUIDES.ultimate) {
    ub.render(upos, { playable: tryIt });
    ub.highlight(tryIt && s.target !== 'any' ? s.target : -1);
  } else {
    drawSmall(solved ? { ...s.then, fading: -1 } : s, s.target, tryIt);
  }
}

function tap(i) {
  const s = guide.steps[step];
  if (s.target === undefined || solved) return;
  const right = s.target === 'any' ? isLegal(upos, i) : i === s.target;
  if (!right) {
    $('guideMsg').textContent = t('Not that one: look for the highlighted square.');
    return;
  }
  if (guide === GUIDES.ultimate) upos = playUltimate(upos, i);
  solved = true;
  render();
  $('guideNext').focus();
}

function go(n) {
  step = n;
  solved = false;
  const s = guide.steps[step];
  if (guide === GUIDES.ultimate) upos = s.moves.length ? replayUltimate(s.moves) : emptyUltimate();
  render();
}

// Opens the guide for 'vanish' or 'ultimate'. The module loads the first
// time a guide is asked for (main.js), and wires its buttons then.
let wired = false;
export function openGuide(rules) {
  if (!wired) {
    wire();
    wired = true;
  }
  guide = GUIDES[rules];
  if (!guide) return;
  const ultimate = rules === 'ultimate';
  $('guideBoard').hidden = ultimate;
  $('guideUboard').hidden = !ultimate;
  if (ultimate && !ub) ub = createUltimateBoard($('guideUboard'), { onPlay: tap });
  $('guideTitle').textContent = guide.title();
  go(0);
  if (!$('guideDialog').open) $('guideDialog').showModal();
}

function wire() {
  $('guideBack').addEventListener('click', () => go(step - 1));
  $('guideNext').addEventListener('click', () => {
    if (step === guide.steps.length - 1) $('guideDialog').close();
    else go(step + 1);
  });
  $('guideDialog')
    .querySelector('[data-close]')
    .addEventListener('click', () => $('guideDialog').close());
}
