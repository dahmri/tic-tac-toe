// The "⋯" menu next to a player: block or unblock them, or report them.
// Blocking works both ways (see server/safety.js): no invitations, no
// quick-match pairing, and neither sees the other in the lobby.

import { api } from './api.js';
import { avatarEmoji } from './avatars.js';
import { countryFlag } from './countries.js';
import { t } from './i18n.js';

const $ = (id) => /** @type {any} */ (document.getElementById(id));

let player = null;
let blocked = false;
let onChange = () => {};

function render() {
  $('pmWho').textContent =
    `${avatarEmoji(player.avatar)} ${countryFlag(player.country)} ${player.username}`;
  $('pmBlock').textContent = blocked ? t('Unblock') : t('Block');
  $('pmBlockNote').textContent = blocked
    ? t("You blocked this player. You don't see each other online.")
    : t(
        "Blocked players can't invite you or be matched with you, and you won't see each other online.",
      );
}

// Opens the menu for player p ({ id, username, country, avatar })
export async function openPlayerMenu(p, changed = () => {}) {
  player = p;
  onChange = changed;
  blocked = false;
  const form = $('reportForm');
  form.reset();
  form.hidden = true;
  $('pmMsg').textContent = '';
  render();
  $('playerDialog').showModal();
  try {
    const list = (await api('GET', '/api/blocks')).blocked;
    blocked = list.some((b) => b.id === p.id);
    render();
  } catch {
    /* shown as not blocked; the button still works */
  }
}

async function toggleBlock() {
  $('pmBlock').disabled = true;
  try {
    if (blocked) await api('DELETE', `/api/blocks/${player.id}`);
    else await api('POST', '/api/blocks', { id: player.id });
    blocked = !blocked;
    $('pmMsg').textContent = blocked ? t('Blocked.') : t('Unblocked.');
    render();
    onChange();
  } catch (err) {
    $('pmMsg').textContent = t(err.message);
  } finally {
    $('pmBlock').disabled = false;
  }
}

async function sendReport(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  if (!data.reason) {
    $('pmMsg').textContent = t('Choose a reason.');
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await api('POST', '/api/reports', {
      id: player.id,
      reason: data.reason,
      details: data.details,
    });
    if (data.alsoBlock && !blocked) {
      await api('POST', '/api/blocks', { id: player.id });
      blocked = true;
      onChange();
    }
    form.hidden = true;
    render();
    $('pmMsg').textContent = t('Thanks: your report has been sent.');
  } catch (err) {
    $('pmMsg').textContent = t(err.message);
  } finally {
    button.disabled = false;
  }
}

// A "⋯" button that opens the menu for p
export function menuButton(p, changed) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn ghostbtn more';
  b.textContent = '⋯';
  b.setAttribute('aria-label', t('More for {name}', { name: p.username }));
  b.addEventListener('click', () => openPlayerMenu(p, changed));
  return b;
}

export function initPlayerMenu() {
  $('pmBlock').addEventListener('click', toggleBlock);
  $('pmReport').addEventListener('click', () => {
    $('reportForm').hidden = false;
    $('reportForm').querySelector('input[name="reason"]').focus();
  });
  $('reportForm').addEventListener('submit', sendReport);
  $('playerDialog')
    .querySelector('[data-close]')
    .addEventListener('click', () => $('playerDialog').close());
}
