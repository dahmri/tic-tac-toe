// The Stats dialog: your totals, streaks, opponents, games against the
// computer, and your recent games. Also records finished games against the
// computer (the server checks them before they count).

import { api } from './api.js';
import { avatarEmoji, avatarName } from './avatars.js';
import { countryFlag } from './countries.js';
import { openReplay } from './replay.js';

const $ = (id) => document.getElementById(id);
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
const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const timeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function tiles(box, items) {
  box.replaceChildren(
    ...items.map(([label, value]) => {
      const t = el('div', 'tile');
      t.append(el('span', 'tile-value', String(value)), el('span', 'tile-label', label));
      return t;
    }),
  );
}

function facts(box, items) {
  box.replaceChildren(
    ...items.flatMap(([term, value]) => [el('dt', '', term), el('dd', '', value)]),
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
  span.append(el('span', 'name', p.username));
  return span;
}

function renderSummary({ stats, opponents }) {
  tiles($('ratingTiles'), [
    ['Rating', stats.rating],
    ['Rank', stats.rank ? `#${stats.rank}` : '—'],
    ['Best', stats.peakRating],
  ]);
  const o = stats.online;
  tiles($('onlineTiles'), [
    ['Played', o.played],
    ['Won', o.won],
    ['Lost', o.lost],
    ['Drawn', o.drawn],
    ['Win rate', pct(o.winRate)],
  ]);
  const since = stats.firstPlayedAt ? dateFmt.format(new Date(stats.firstPlayedAt)) : '—';
  facts($('onlineFacts'), [
    ['Win streak', `${o.currentStreak} now · best ${o.bestStreak}`],
    ['Win rate as X', `${pct(o.asX.winRate)} of ${o.asX.played}`],
    ['Win rate as O', `${pct(o.asO.winRate)} of ${o.asO.played}`],
    ['Fastest win', o.fastestWin ? `${o.fastestWin} moves` : '—'],
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
    ? `Against Unbeatable: ${c.unbeatable.drawn} draws in ${c.unbeatable.played} games. Nobody beats it.`
    : 'Try Unbeatable: nobody has ever beaten it.';
}

const OUTCOME = { W: 'Won', L: 'Lost', D: 'Draw' };
const LEVEL = { casual: 'Casual', medium: 'Medium', hard: 'Unbeatable' };

function historyItem(g) {
  const li = el('li', 'history-item');
  const who = el('span', 'game-who');
  if (g.opponent) who.append('vs ', playerName(g.opponent));
  else {
    // In the 3-mark game the top level is "Hard": it isn't unbeatable there
    const level = g.variant === 'vanish' && g.difficulty === 'hard' ? 'Hard' : LEVEL[g.difficulty];
    who.append(`vs Computer (${level ?? 'Casual'})`);
  }
  const outcome = el('strong', `outcome o-${g.outcome}`, OUTCOME[g.outcome]);
  const detail = [`as ${g.symbol}`, `${g.moves} moves`];
  if (g.variant === 'vanish') detail.unshift('3 marks');
  if (g.forfeit) detail.push(g.outcome === 'W' ? 'they left' : 'you left');
  const meta = el(
    'span',
    'game-meta',
    `${timeFmt.format(new Date(g.endedAt))} · ${detail.join(' · ')}`,
  );
  if (g.ratingChange !== null && g.ratingChange !== undefined) {
    meta.append(' · ', deltaEl(g.ratingChange));
  }
  li.append(outcome, who, meta);
  if (g.squares?.length) {
    const b = el('button', 'btn ghostbtn replay-btn', 'Replay');
    b.type = 'button';
    const title = `${OUTCOME[g.outcome]} · ${who.textContent}`;
    b.setAttribute('aria-label', `Replay: ${title}`);
    b.addEventListener('click', () => openReplay(g, title));
    li.append(b);
  }
  return li;
}

async function loadHistory(more) {
  const query = new URLSearchParams({ limit: 10 });
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
    const [summary] = await Promise.all([api('GET', '/api/me/stats'), loadHistory(false)]);
    renderSummary(summary);
    $('statsBody').hidden = false;
  } catch (err) {
    $('statsMsg').textContent = err.message;
  }
}

// A finished game against the computer. Fire and forget: the game itself
// never waits for this.
export function recordCpuGame(game) {
  api('POST', '/api/games/cpu', game).catch(() => {});
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
