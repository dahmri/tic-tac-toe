// The Leaderboard dialog: the best ratings in the world or in one country,
// and where you stand.

import { api } from './api.js';
import { avatarEmoji, avatarName } from './avatars.js';
import { countryFlag, countryName, sortedCountries } from './countries.js';

const PAGE = 20;
const FILTER_KEY = 'pencil-ttt-leaderboard-country';

const $ = (id) => document.getElementById(id);
let shown = 0;
let meId = null;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function row(p) {
  const tr = el('tr', p.id === meId ? 'me' : '');
  tr.append(el('td', 'num rank', String(p.rank)));
  const name = el('th');
  name.scope = 'row';
  const who = el('span', 'who-line');
  const flag = el('span', 'flag', countryFlag(p.country));
  flag.setAttribute('aria-hidden', 'true');
  const avatar = el('span', 'avatar', avatarEmoji(p.avatar));
  avatar.title = avatarName(p.avatar);
  who.append(avatar, flag, el('span', 'name', p.username));
  name.append(who);
  tr.append(name);
  for (const n of [p.rating, p.won, p.played]) tr.append(el('td', 'num', String(n)));
  return tr;
}

async function load(more) {
  const country = $('lbCountry').value;
  const query = new URLSearchParams({ offset: more ? shown : 0, limit: PAGE });
  if (country) query.set('country', country);
  $('lbMsg').textContent = '';
  try {
    const res = await api('GET', `/api/leaderboard?${query}`);
    if ($('lbCountry').value !== country) return; // the choice changed meanwhile
    const body = $('lbTable').tBodies[0];
    if (!more) body.replaceChildren();
    body.append(...res.players.map(row));
    shown = body.children.length;
    $('lbTable').hidden = shown === 0;
    $('lbEmpty').hidden = shown > 0;
    $('lbEmpty').textContent = country
      ? `Nobody from ${countryName(country)} has played online yet.`
      : 'Nobody has played online yet. Be the first!';
    $('lbMore').hidden = shown >= res.total;
    const where = country ? countryName(country) : 'the world';
    $('lbMe').textContent = res.me
      ? `You are #${res.me.rank} in ${where}, rated ${res.me.rating}.`
      : country && !more
        ? ''
        : meId === null
          ? 'Make a free account and play online to join the leaderboard.'
          : 'Play an online game to get on the leaderboard.';
  } catch (err) {
    $('lbMsg').textContent = err.message;
  }
}

function open() {
  shown = 0;
  $('leaderboardDialog').showModal();
  load(false);
}

// `me()` returns the signed-in player, to highlight their row
export function initLeaderboard(me) {
  const filter = $('lbCountry');
  for (const { code, name } of sortedCountries()) {
    filter.add(new Option(`${countryFlag(code)} ${name}`, code));
  }
  try {
    filter.value = localStorage.getItem(FILTER_KEY) || '';
  } catch {
    /* storage unavailable */
  }
  filter.addEventListener('change', () => {
    try {
      localStorage.setItem(FILTER_KEY, filter.value);
    } catch {
      /* ignore */
    }
    load(false);
  });
  $('leaderboardBtn').addEventListener('click', () => {
    meId = me()?.id ?? null;
    open();
  });
  $('lbMore').addEventListener('click', () => load(true));
  $('leaderboardDialog')
    .querySelector('[data-close]')
    .addEventListener('click', () => $('leaderboardDialog').close());
}
