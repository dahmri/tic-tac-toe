// The weekly arena in the online lobby: when it runs, your points and rank,
// joining or pausing, and the standings dialog. The rules are in arena.js;
// games themselves arrive like any online match.

import { api } from './api.js';
import { avatarEmoji } from './avatars.js';
import { countryFlag } from './countries.js';
import { lang, onLangChange, t } from './i18n.js';

const $ = (id) => /** @type {any} */ (document.getElementById(id));
/** @type {{ send: (msg: any) => any, message: (text: string) => void, inMatch: () => boolean }} */
let actions = { send: () => {}, message: () => {}, inMatch: () => false };
let state = null;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const time = (iso) =>
  new Intl.DateTimeFormat(lang(), { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const day = (iso) =>
  new Intl.DateTimeFormat(lang(), { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(iso),
  );

function render() {
  if (!state) return;
  const { arena, me } = state;
  $('arenaWhen').textContent = arena.running
    ? t('On now, until {time}. Each game: 2 points for a win, 1 for a draw.', {
        time: time(arena.endsAt),
      })
    : t('Every Saturday. Next: {day}, {start} to {end}.', {
        day: day(arena.startsAt),
        start: time(arena.startsAt),
        end: time(arena.endsAt),
      });
  const joined = arena.running && !!me?.in;
  $('arenaJoin').hidden = !arena.running || joined;
  $('arenaPause').hidden = !joined;
  $('arenaMe').textContent = !me
    ? ''
    : [
        t('{points} points, #{rank} of {total}', { ...me, total: state.total }),
        joined && !actions.inMatch() ? t('Waiting for your next opponent…') : '',
        arena.running && !joined ? t('Paused.') : '',
      ]
        .filter(Boolean)
        .join(' ');
}

function row(p) {
  const tr = el('tr');
  tr.append(el('td', 'num rank', String(p.rank)));
  const name = el('th');
  name.scope = 'row';
  name.append(
    el('span', 'who-line', `${avatarEmoji(p.avatar)} ${countryFlag(p.country)} ${p.username}`),
  );
  tr.append(name);
  for (const n of [p.points, p.won, p.played]) tr.append(el('td', 'num', String(n)));
  return tr;
}

function renderStandings() {
  if (!state) return;
  const { arena, players, last } = state;
  $('arenaDay').textContent = arena.running
    ? t('Today, until {time}', { time: time(arena.endsAt) })
    : t('Next: {day}, {start}', { day: day(arena.startsAt), start: time(arena.startsAt) });
  $('arenaTable').hidden = players.length === 0;
  $('arenaEmpty').hidden = players.length > 0;
  $('arenaTable').tBodies[0].replaceChildren(...players.map(row));
  $('arenaPodium').hidden = last.podium.length === 0;
  $('arenaPodium').textContent = last.podium.length
    ? `${t('Last arena:')} ${last.podium
        .map((p, i) => `${['🥇', '🥈', '🥉'][i]} ${p.username} (${p.points})`)
        .join(' · ')}`
    : '';
}

// Fetches the arena again (the lobby does it as it refreshes, and the
// server says when your standing changed)
export async function refreshArena() {
  try {
    state = await api('GET', '/api/arena');
    render();
    if ($('arenaDialog').open) renderStandings();
  } catch {
    /* the next refresh will try again */
  }
}

export function initArena(callbacks) {
  actions = { ...actions, ...callbacks };
  $('arenaJoin').addEventListener('click', () => {
    actions.message('');
    actions.send({ t: 'arena-join' });
  });
  $('arenaPause').addEventListener('click', () => actions.send({ t: 'arena-pause' }));
  $('arenaStandingsBtn').addEventListener('click', async () => {
    $('arenaDialog').showModal();
    await refreshArena();
    renderStandings();
  });
  $('arenaDialog')
    .querySelector('[data-close]')
    .addEventListener('click', () => $('arenaDialog').close());
  onLangChange(() => {
    render();
    if ($('arenaDialog').open) renderStandings();
  });
}
