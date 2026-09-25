// Draws an Ultimate tic-tac-toe position (ultimate.js): nine small boards
// of nine squares. The board the player must play in is highlighted; a
// small board that's won shows a big mark over it. Used for the game and
// for replays.

import { markSVG } from './marks.js';
import { t } from './i18n.js';
import { isLegal } from './ultimate.js';

// container: an empty element; onPlay(square) makes the squares clickable
export function createUltimateBoard(container, { onPlay = null } = {}) {
  container.classList.add('uboard');
  const minis = [];
  const squares = [];
  for (let b = 0; b < 9; b++) {
    const mini = document.createElement('div');
    mini.className = 'umini';
    for (let c = 0; c < 9; c++) {
      const sq = document.createElement(onPlay ? 'button' : 'div');
      sq.className = 'usq';
      const i = b * 9 + c;
      if (onPlay) {
        /** @type {HTMLButtonElement} */ (sq).type = 'button';
        sq.addEventListener('click', () => onPlay(i));
      } else sq.setAttribute('role', 'img');
      mini.append(sq);
      squares.push(sq);
    }
    const big = document.createElement('div');
    big.className = 'ubig';
    big.setAttribute('aria-hidden', 'true');
    mini.append(big);
    container.append(mini);
    minis.push(mini);
  }

  return {
    // pos: an Ultimate position; playable: whether the viewer may move;
    // last: the square played last (drawn with the pencil)
    render(pos, { playable = false, last = -1 } = {}) {
      minis.forEach((mini, b) => {
        const done = pos.smalls[b];
        mini.classList.toggle(
          'active',
          !pos.result && !done && (pos.active === -1 || pos.active === b),
        );
        mini.classList.toggle('won', done === 'X' || done === 'O');
        mini.classList.toggle('drawn', done === 'D');
        const big = mini.querySelector('.ubig');
        const want = done === 'X' || done === 'O' ? done : '';
        if (big.dataset.mark !== want) {
          big.dataset.mark = want;
          big.innerHTML = want ? markSVG(want, '') : '';
        }
        mini.classList.toggle('line', !!pos.result?.line?.includes(b));
      });
      squares.forEach((sq, i) => {
        const v = pos.cells[i];
        if (sq.dataset.mark !== (v || '')) {
          sq.dataset.mark = v || '';
          sq.innerHTML = v ? markSVG(v, i === last ? '' : 'still') : '';
        }
        const b = Math.floor(i / 9);
        const c = i % 9;
        sq.setAttribute(
          'aria-label',
          t('Board {b}, square {c}: {value}', { b: b + 1, c: c + 1, value: v || t('empty') }),
        );
        if (sq instanceof HTMLButtonElement) sq.disabled = !playable || !isLegal(pos, i);
      });
    },

    highlight(square) {
      squares.forEach((sq, i) => sq.classList.toggle('hinted', i === square));
    },

    clear() {
      squares.forEach((sq) => {
        sq.dataset.mark = '';
        sq.innerHTML = '';
        sq.classList.remove('hinted');
      });
      minis.forEach((mini) => {
        mini.className = 'umini';
        const big = mini.querySelector('.ubig');
        big.dataset.mark = '';
        big.innerHTML = '';
      });
    },
  };
}
