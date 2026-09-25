// The Stats dialog: your totals, streaks, opponents, games against the
// computer, and your recent games. Also records finished games against the
// computer (the server checks them before they count).

import { api } from './api.js';
import { avatarEmoji, avatarName } from './avatars.js';
import { countryFlag } from './countries.js';
import { openReplay } from './replay.js';
import { lang, onLangChange, t } from './i18n.js';
import { checkAchievements, renderBadges } from './achievements-ui.js';

// Any element by id, typed loosely: the pages hold forms, dialogs and inputs
const $ = (id) => /** @type {any} */ (document.getElementById(id));
let nextCursor = null;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const pct = (n) => (n === null ? '—' : `${n}%`);

// Rating points as "+16", "−16" or "±0"
export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
export function deltaEl(n) {
  const cls = n > 0 ? 'delta up' : n < 0 ? 'delta down' : 'delta';
  return el('span', cls, signed(n));
}
const dateFmt = () => new Intl.DateTimeFormat(lang(), { dateStyle: 'medium' });
const timeFmt = () => new Intl.DateTimeFormat(lang(), { dateStyle: 'medium', timeStyle: 'short' });

function tiles(box, items) {
  box.replaceChildren(
    ...items.map(([label, value]) => {
      const tile = el('div', 'tile');
      tile.append(el('span', 'tile-value', String(value)), el('span', 'tile-label', t(label)));
      return tile;
    }),
  );
}

function facts(box, items) {
  box.replaceChildren(
    ...items.flatMap(([term, value]) => [el('dt', '', t(term)), el('dd', '', value)]),
  );
}

function playerName(p) {
  const span = el('span', 'who-line');
  if (p.avatar) {
    const avatar = el('span', 'avatar', avatarEmoji(p.avatar));
    avatar.title = avatarName(p.avatar);
    span.append(avatar);
  }
  if (p.country) {
    const flag = el('span', 'flag', countryFlag(p.country));
    flag.setAttribute('aria-hidden', 'true');
    span.append(flag);
  }
  // Deleted accounts come back with no id
  span.append(el('span', 'name', p.id ? p.username : t('Deleted player')));
  return span;
}

// The rules' names, as on the rules buttons
export const RULES = { classic: 'Classic', vanish: '3 marks', ultimate: 'Ultimate' };

function renderSummary({ stats, opponents }) {
  // This season's rating in each set of rules
  tiles(
    $('ratingTiles'),
    stats.ratings.map((r) => [RULES[r.variant], r.rating]),
  );
  facts($('ratingFacts'), [
    [
      'Rank this season',
      stats.ratings.map((r) => `${t(RULES[r.variant])} ${r.rank ? `#${r.rank}` : '—'}`).join(' · '),
    ],
    ['Best ever', String(stats.peakRating)],
  ]);
  const o = stats.online;
  tiles($('onlineTiles'), [
    ['Played', o.played],
    ['Won', o.won],
    ['Lost', o.lost],
    ['Drawn', o.drawn],
    ['Win rate', pct(o.winRate)],
  ]);
  const since = stats.firstPlayedAt ? dateFmt().format(new Date(stats.firstPlayedAt)) : '—';
  facts($('onlineFacts'), [
    ['Win streak', t('{now} now · best {best}', { now: o.currentStreak, best: o.bestStreak })],
    ['Win rate as X', t('{rate} of {n}', { rate: pct(o.asX.winRate), n: o.asX.played })],
    ['Win rate as O', t('{rate} of {n}', { rate: pct(o.asO.winRate), n: o.asO.played })],
    ['Fastest win', o.fastestWin ? t('{n} moves', { n: o.fastestWin }) : '—'],
    ['Opponents', String(opponents.total)],
    ['Won when they left or timed out', String(o.winsByForfeit)],
    ['Left or ran out of time', String(o.lossesByForfeit)],
    ['Playing since', since],
  ]);

  const table = $('opponentsTable');
  table.hidden = opponents.top.length === 0;
  $('opponentsEmpty').hidden = opponents.top.length > 0;
  table.tBodies[0].replaceChildren(
    ...opponents.top.map((p) => {
      const tr = el('tr');
      const name = el('th');
      name.scope = 'row';
      name.append(playerName(p));
      tr.append(name);
      for (const n of [p.played, p.won, p.lost, p.drawn]) tr.append(el('td', 'num', String(n)));
      return tr;
    }),
  );

  const c = stats.computer;
  tiles($('cpuTiles'), [
    ['Played', c.played],
    ['Won', c.won],
    ['Lost', c.lost],
    ['Drawn', c.drawn],
  ]);
  $('cpuNote').textContent = c.unbeatable.played
    ? t('Against Unbeatable: {drawn} draws in {n} games. Nobody beats it.', {
        drawn: c.unbeatable.drawn,
        n: c.unbeatable.played,
      })
    : t('Try Unbeatable: nobody has ever beaten it.');
}

const OUTCOME = { W: 'Won', L: 'Lost', D: 'Draw' };
const LEVEL = { casual: 'Casual', medium: 'Medium', hard: 'Unbeatable' };

function historyItem(g) {
  const li = el('li', 'history-item');
  const who = el('span', 'game-who');
  if (g.opponent) who.append(`${t('vs')} `, playerName(g.opponent));
  else {
    // In the 3-mark game the top level is "Hard": it isn't unbeatable there
    // Only the classic computer is unbeatable
    const level = g.variant !== 'classic' && g.difficulty === 'hard' ? 'Hard' : LEVEL[g.difficulty];
    who.append(t('vs Computer ({level})', { level: t(level ?? 'Casual') }));
  }
  const outcome = el('strong', `outcome o-${g.outcome}`, t(OUTCOME[g.outcome]));
  const detail = [t('as {mark}', { mark: g.symbol }), t('{n} moves', { n: g.moves })];
  if (g.variant === 'vanish') detail.unshift(t('3 marks'));
  if (g.variant === 'ultimate') detail.unshift(t('Ultimate'));
  if (g.forfeit) detail.push(g.outcome === 'W' ? t('they left') : t('you left'));
  const meta = el(
    'span',
    'game-meta',
    `${timeFmt().format(new Date(g.endedAt))} · ${detail.join(' · ')}`,
  );
  if (g.ratingChange !== null && g.ratingChange !== undefined) {
    meta.append(' · ', deltaEl(g.ratingChange));
  }
  li.append(outcome, who, meta);
  if (g.squares?.length) {
    const b = el('button', 'btn ghostbtn replay-btn', t('Replay'));
    b.type = 'button';
    const title = `${t(OUTCOME[g.outcome])} · ${who.textContent}`;
    b.setAttribute('aria-label', t('Replay: {title}', { title }));
    b.addEventListener('click', () => openReplay(g, title));
    li.append(b);
  }
  return li;
}

async function loadHistory(more) {
  const query = new URLSearchParams({ limit: '10' });
  if (more && nextCursor) query.set('cursor', nextCursor);
  const { games, next } = await api('GET', `/api/me/games?${query}`);
  nextCursor = next;
  const list = $('historyList');
  if (!more) list.replaceChildren();
  list.append(...games.map(historyItem));
  $('historyEmpty').hidden = list.children.length > 0;
  $('moreHistory').hidden = !next;
}

async function open() {
  const dialog = $('statsDialog');
  $('statsMsg').textContent = '';
  $('statsBody').hidden = true;
  dialog.showModal();
  try {
    const [summary, { achievements }] = await Promise.all([
      api('GET', '/api/me/stats'),
      api('GET', '/api/me/achievements'),
      loadHistory(false),
    ]);
    renderSummary(summary);
    renderBadges(achievements);
    $('statsBody').hidden = false;
  } catch (err) {
    $('statsMsg').textContent = t(err.message);
  }
}

// A finished game against the computer. Fire and forget: the game itself
// never waits for this.
export function recordCpuGame(game) {
  api('POST', '/api/games/cpu', game).then(checkAchievements, () => {});
}

// Guests' games wait in this browser, and join their stats if they sign up
const GUEST_GAMES_KEY = 'pencil-ttt-guest-games';
const GUEST_GAMES_MAX = 100;

export function recordGuestGame(game) {
  try {
    const games = JSON.parse(localStorage.getItem(GUEST_GAMES_KEY) || '[]');
    games.push({ ...game, endedAt: Date.now() });
    localStorage.setItem(GUEST_GAMES_KEY, JSON.stringify(games.slice(-GUEST_GAMES_MAX)));
  } catch {
    /* storage unavailable: nothing to carry over */
  }
}

// Sends the guest games to the new account; returns how many counted
export async function uploadGuestGames() {
  let games;
  try {
    games = JSON.parse(localStorage.getItem(GUEST_GAMES_KEY) || '[]');
    localStorage.removeItem(GUEST_GAMES_KEY);
  } catch {
    return 0;
  }
  let added = 0;
  for (const game of Array.isArray(games) ? games : []) {
    try {
      await api('POST', '/api/games/cpu', game);
      added++;
    } catch {
      /* a game the server doesn't accept is skipped */
    }
  }
  return added;
}

export function initStats() {
  // A new language: draw the open dialog again
  onLangChange(() => {
    if ($('statsDialog').open) open();
  });
  $('statsBtn').addEventListener('click', open);
  $('statsDialog')
    .querySelector('[data-close]')
    .addEventListener('click', () => $('statsDialog').close());
  $('moreHistory').addEventListener('click', () =>
    loadHistory(true).catch((err) => {
      $('statsMsg').textContent = err.message;
    }),
  );
}
