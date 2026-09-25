// Invite links: a player shares /?from=<their username>; whoever opens it
// sees who invited them, and once they have an account the inviter is
// added to their friends, ready to invite from the lobby.

import { api } from './api.js';
import { t } from './i18n.js';

const KEY = 'pencil-ttt-invited-by';
const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const $ = (id) => /** @type {any} */ (document.getElementById(id));

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

// On load: keep the inviter's name and tidy the address bar
export function captureInvite() {
  const url = new URL(location.href);
  const from = url.searchParams.get('from');
  if (from && USERNAME.test(from)) {
    try {
      localStorage.setItem(KEY, from);
    } catch {
      /* not kept: the link still opened the game */
    }
    url.searchParams.delete('from');
    history.replaceState(history.state, '', url);
  }
  const by = read();
  $('invitedBy').hidden = !by;
  if (by) $('invitedBy').textContent = t('{name} invited you to play. Welcome!', { name: by });
}

// Signed in: the inviter becomes a friend. Returns their name, or null.
export async function claimInvite(me) {
  const from = read();
  if (!from) return null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  $('invitedBy').hidden = true;
  if (from.toLowerCase() === me.username.toLowerCase()) return null;
  try {
    await api('POST', '/api/friends', { username: from });
    return from;
  } catch {
    return null; // gone, or already a friend
  }
}

// The share sheet where there is one, otherwise the clipboard
export async function shareInvite(me) {
  const url = `${location.origin}/?from=${encodeURIComponent(me.username)}`;
  const text = t('Play tic-tac-toe with me!');
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Pencil Tic-Tac-Toe', text, url });
      return '';
    }
    await navigator.clipboard.writeText(url);
    return t('Invite link copied: send it to a friend.');
  } catch (err) {
    if (err?.name === 'AbortError') return ''; // they closed the share sheet
    return t('Your invite link: {url}', { url });
  }
}
