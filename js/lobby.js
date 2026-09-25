// The online lobby: who is online (filtered by country) and invitations
// to play, in both directions. Invitations show in every mode, so a player
// on "vs Computer" still hears from a friend.

import { api } from './api.js';
import { avatarEmoji, avatarName } from './avatars.js';
import { countryFlag, countryName, sortedCountries } from './countries.js';
import { sound } from './sound.js';
import { onLangChange, t } from './i18n.js';
import { checkAchievements } from './achievements-ui.js';

const PAGE = 20;
const REFRESH_MS = 10_000;
const FILTER_KEY = 'pencil-ttt-country-filter';

// Any element by id, typed loosely: the pages hold forms, dialogs and inputs
const $ = (id) => /** @type {any} */ (document.getElementById(id));

// Invitations: id -> { id, from|to, expires (local ms) }
const incoming = new Map();
const outgoing = new Map();

/** @type {{ send: (msg: object) => void, message: (text: string) => void, variant: () => string }} */
let actions = { send() {}, message() {}, variant: () => 'classic' };
// A translated sentence with an element (a player's name) where {who} is,
// wherever the language puts it
function sentence(template, node, vars) {
  const [before, after = ''] = t(template, vars).split('{who}');
  return [before, node, after].filter((part) => part !== '');
}
let active = false; // lobby on screen: keep the list fresh
let busy = false; // in a match: invitations wait
let players = [];
let total = 0;
let refreshTimer = null;
let tickTimer = null;
let loading = null;
// Quick match: waiting since (local ms), or 0 when not searching
let searchingSince = 0;
let searchTimer = null;
let lastOpponent = null; // offered again after a match ends
// Friends: players this player saved, with whether they're online now
let friends = [];
let friendIds = new Set();

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function who(p) {
  const span = el('span', 'who-line');
  const avatar = el('span', 'avatar', avatarEmoji(p.avatar));
  avatar.title = t(avatarName(p.avatar));
  span.append(avatar, el('span', 'flag', countryFlag(p.country)), el('strong', 'name', p.username));
  span.querySelector('.flag').setAttribute('aria-hidden', 'true');
  if (p.rating) {
    const chip = el('span', 'rating-chip', String(p.rating));
    chip.title = t('Rating');
    span.append(chip);
  }
  return span;
}

const secondsLeft = (inv) => Math.max(0, Math.ceil((inv.expires - Date.now()) / 1000));

/* ---------- Online players ---------- */

async function load({ more = false } = {}) {
  if (loading) return loading;
  const country = $('countryFilter').value;
  const offset = more ? players.length : 0;
  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(more ? PAGE : Math.max(PAGE, players.length)),
  });
  if (country) query.set('country', country);
  loading = api('GET', `/api/players/online?${query}`)
    .then((res) => {
      if ($('countryFilter').value !== country) return; // the filter changed meanwhile
      const seen = new Set(more ? players.map((p) => p.id) : []);
      const fresh = res.players.filter((p) => !seen.has(p.id));
      players = more ? [...players, ...fresh] : res.players;
      total = res.total;
      renderPlayers();
    })
    .catch((err) => actions.message(err.message))
    .finally(() => {
      loading = null;
    });
  return loading;
}

// "Playing", "Invited", or an Invite button
function inviteControl(p) {
  if (p.playing) return el('span', 'tag', t('Playing'));
  if ([...outgoing.values()].some((i) => i.to.id === p.id)) return el('span', 'tag', t('Invited'));
  const b = el('button', 'btn', t('Invite'));
  b.type = 'button';
  b.disabled = busy;
  b.setAttribute('aria-label', t('Invite {name}', { name: p.username }));
  b.addEventListener('click', () => {
    b.disabled = true;
    actions.message('');
    actions.send({ t: 'invite', to: p.id, variant: actions.variant() });
  });
  return b;
}

// ☆ adds a player to friends, ★ removes them
function starButton(p) {
  const on = friendIds.has(p.id);
  const b = el('button', 'btn ghostbtn star', on ? '★' : '☆');
  b.type = 'button';
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute(
    'aria-label',
    on
      ? t('Remove {name} from friends', { name: p.username })
      : t('Add {name} to friends', { name: p.username }),
  );
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      if (on) await api('DELETE', `/api/friends/${p.id}`);
      else {
        await api('POST', '/api/friends', { id: p.id });
        checkAchievements();
      }
      await loadFriends();
    } catch (err) {
      actions.message(err.message);
      b.disabled = false;
    }
  });
  return b;
}

function renderPlayers() {
  const list = $('playerList');
  const country = $('countryFilter').value;
  list.replaceChildren(
    ...players.map((p) => {
      const li = el('li', 'player');
      li.append(
        who(p),
        el('span', 'where', countryName(p.country)),
        starButton(p),
        inviteControl(p),
      );
      return li;
    }),
  );
  $('onlineCount').textContent = total ? `(${total})` : '';
  const empty = $('playersEmpty');
  empty.hidden = players.length > 0;
  empty.textContent = country
    ? t('No one from {country} is online right now.', { country: countryName(country) })
    : t('No one else is online right now. Invite a friend to sign up!');
  $('morePlayers').hidden = players.length >= total;
}

/* ---------- Friends ---------- */

export async function loadFriends() {
  try {
    ({ friends } = await api('GET', '/api/friends'));
    friendIds = new Set(friends.map((f) => f.id));
  } catch {
    return; // the lobby shows its own errors
  }
  renderFriends();
  renderPlayers();
  renderQuick();
}

function renderFriends() {
  $('friendList').replaceChildren(
    ...friends.map((f) => {
      const li = el('li', `player friend ${f.online ? 'is-online' : 'is-offline'}`);
      const status = f.playing ? t('Playing') : f.online ? t('Online') : t('Offline');
      li.append(who(f), el('span', 'where', status), starButton(f));
      if (f.online) li.append(inviteControl(f));
      return li;
    }),
  );
  const online = friends.filter((f) => f.online).length;
  $('friendsCount').textContent = friends.length ? `(${online}/${friends.length})` : '';
  $('friendsEmpty').hidden = friends.length > 0;
}

async function addFriend(e) {
  e.preventDefault();
  const input = $('friendName');
  const username = input.value.trim();
  if (!username) return;
  $('friendMsg').textContent = '';
  try {
    await api('POST', '/api/friends', { username });
    checkAchievements();
    input.value = '';
    await loadFriends();
  } catch (err) {
    $('friendMsg').textContent = t(err.message);
  }
}

/* ---------- Invitations ---------- */

function renderInvites() {
  const box = $('invites');
  const items = [];
  if (!busy) {
    for (const inv of incoming.values()) {
      const row = el('div', 'invite');
      row.dataset.id = inv.id;
      const text = el('span', 'invite-text');
      text.append(
        ...sentence(
          inv.variant === 'vanish'
            ? '{who} invites you to play (3 marks)'
            : '{who} invites you to play',
          who(inv.from),
        ),
      );
      const accept = el('button', 'btn primary', t('Accept'));
      const decline = el('button', 'btn', t('Decline'));
      accept.type = decline.type = 'button';
      accept.addEventListener('click', () => {
        accept.disabled = decline.disabled = true;
        actions.send({ t: 'invite-accept', id: inv.id });
      });
      decline.addEventListener('click', () => {
        incoming.delete(inv.id);
        renderInvites();
        actions.send({ t: 'invite-decline', id: inv.id });
      });
      row.append(text, el('span', 'timer', `${secondsLeft(inv)}s`), accept, decline);
      items.push(row);
    }
  }
  for (const inv of outgoing.values()) {
    const row = el('div', 'invite outgoing');
    row.dataset.id = inv.id;
    const text = el('span', 'invite-text');
    text.append(
      ...sentence(
        inv.variant === 'vanish' ? 'Waiting for {who} (3 marks)…' : 'Waiting for {who}…',
        who(inv.to),
      ),
    );
    const cancel = el('button', 'btn ghostbtn', t('Cancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      outgoing.delete(inv.id);
      renderInvites();
      renderPlayers();
      actions.send({ t: 'invite-cancel', id: inv.id });
    });
    row.append(text, el('span', 'timer', `${secondsLeft(inv)}s`), cancel);
    items.push(row);
  }
  box.replaceChildren(...items);
  box.hidden = items.length === 0;

  clearInterval(tickTimer);
  if (incoming.size || outgoing.size) tickTimer = setInterval(tick, 1000);
}

// Counts invitations down, and drops them when they run out
function tick() {
  let changed = false;
  for (const [id, inv] of incoming) {
    if (secondsLeft(inv) === 0) changed = incoming.delete(id);
  }
  for (const [id, inv] of outgoing) {
    if (secondsLeft(inv) === 0) {
      changed = outgoing.delete(id);
      actions.message(t("{name} didn't answer.", { name: inv.to.username }));
    }
  }
  if (changed) {
    renderInvites();
    renderPlayers();
    return;
  }
  document.querySelectorAll('#invites .invite').forEach((/** @type {HTMLElement} */ row) => {
    const inv = incoming.get(row.dataset.id) || outgoing.get(row.dataset.id);
    if (inv) row.querySelector('.timer').textContent = `${secondsLeft(inv)}s`;
  });
}

const withExpiry = (inv) => ({ ...inv, expires: Date.now() + inv.expiresIn });

/* ---------- Quick match and "invite again" ---------- */

function setSearching(waiting) {
  if (waiting && !searchingSince) searchingSince = Date.now();
  if (!waiting) searchingSince = 0;
  renderQuick();
}

function renderQuick() {
  const searching = searchingSince > 0;
  $('quickIdle').hidden = searching;
  $('quickSearching').hidden = !searching;
  $('findMatch').disabled = busy;
  clearInterval(searchTimer);
  if (searching) {
    const show = () => {
      const s = Math.floor((Date.now() - searchingSince) / 1000);
      $('searchTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    show();
    searchTimer = setInterval(show, 1000);
  }

  const rematch = $('rematch');
  rematch.hidden = !lastOpponent || busy;
  if (lastOpponent) {
    const text = $('rematchText');
    text.replaceChildren(
      ...sentence('Last game: vs {who}', who(lastOpponent)),
      ' ',
      starButton(lastOpponent),
    );
    const invited = [...outgoing.values()].some((i) => i.to.id === lastOpponent.id);
    $('inviteAgain').disabled = invited;
  }
}

/* ---------- Public API ---------- */

// Handles lobby messages from the live connection; returns true if it did
export function handleLobbyMessage(msg) {
  switch (msg.t) {
    case 'hello':
      incoming.clear();
      for (const inv of msg.invites || []) incoming.set(inv.id, withExpiry(inv));
      setSearching(!!msg.waiting);
      break;
    case 'queue':
      setSearching(msg.waiting);
      return true;
    case 'invite':
      incoming.set(msg.invite.id, withExpiry(msg.invite));
      if (!busy) sound.invite();
      break;
    case 'invite-sent':
      outgoing.set(msg.invite.id, withExpiry(msg.invite));
      break;
    case 'invite-declined': {
      const inv = outgoing.get(msg.id);
      outgoing.delete(msg.id);
      if (inv) actions.message(t('{name} declined your invitation.', { name: msg.by }));
      break;
    }
    case 'invite-gone':
      incoming.delete(msg.id);
      outgoing.delete(msg.id);
      break;
    default:
      return false;
  }
  renderInvites();
  renderPlayers();
  renderQuick();
  return true;
}

// A failed request re-enables its button
export function lobbyError() {
  renderPlayers();
  renderInvites();
  renderQuick();
}

// The player a match that just ended was against, to invite them again
export function setLastOpponent(player) {
  lastOpponent = player;
  renderQuick();
}

// Visible and not in a match: poll the list. In a match: invitations wait.
export function setLobby({ visible, inMatch }) {
  if (busy !== inMatch) {
    busy = inMatch;
    if (inMatch) {
      outgoing.clear();
      searchingSince = 0;
      lastOpponent = null;
    }
    renderInvites();
    renderPlayers();
    renderQuick();
  }
  const nowActive = visible && !inMatch;
  if (nowActive === active) return;
  active = nowActive;
  clearInterval(refreshTimer);
  if (active) {
    load();
    loadFriends();
    refreshTimer = setInterval(() => {
      if (document.hidden) return;
      load();
      loadFriends();
    }, REFRESH_MS);
  }
}

export function resetLobby() {
  incoming.clear();
  outgoing.clear();
  players = [];
  friends = [];
  friendIds = new Set();
  renderFriends();
  total = 0;
  searchingSince = 0;
  lastOpponent = null;
  renderQuick();
  setLobby({ visible: false, inMatch: false });
  renderInvites();
  renderPlayers();
}

// The country filter: "All countries", then every country by name
function fillFilter() {
  const filter = $('countryFilter');
  const keep = filter.value;
  filter.replaceChildren(new Option(t('All countries'), ''));
  for (const { code, name } of sortedCountries()) {
    filter.add(new Option(`${countryFlag(code)} ${name}`, code));
  }
  filter.value = keep;
}

export function initLobby(callbacks) {
  actions = { ...actions, ...callbacks };
  const filter = $('countryFilter');
  fillFilter();
  onLangChange(() => {
    fillFilter();
    renderFriends();
    renderPlayers();
    renderInvites();
    renderQuick();
  });
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
    players = [];
    load();
  });
  $('morePlayers').addEventListener('click', () => load({ more: true }));
  $('addFriendForm').addEventListener('submit', addFriend);
  $('findMatch').addEventListener('click', () => {
    $('findMatch').disabled = true;
    actions.message('');
    actions.send({ t: 'queue-join', variant: actions.variant() });
  });
  $('cancelSearch').addEventListener('click', () => {
    setSearching(false);
    actions.send({ t: 'queue-leave' });
  });
  $('inviteAgain').addEventListener('click', () => {
    $('inviteAgain').disabled = true;
    actions.message('');
    actions.send({ t: 'invite', to: lastOpponent.id, variant: actions.variant() });
  });
  renderInvites();
  renderQuick();
}
