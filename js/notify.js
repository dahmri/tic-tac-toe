// Notifications on this device (web push, server/push.js): turned on or
// off from the profile. The service worker (sw.js) shows them.

import { api } from './api.js';
import { lang, t } from './i18n.js';

const $ = (id) => /** @type {any} */ (document.getElementById(id));
const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let key = null;

// The VAPID key as the bytes PushManager wants
function keyBytes(base64url) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscription() {
  const reg = await navigator.serviceWorker.ready;
  return { reg, sub: await reg.pushManager.getSubscription() };
}

function show(on, text = '') {
  $('notifyBtn').hidden = on === null;
  $('notifyBtn').textContent = on ? t('Turn off notifications') : t('Turn on notifications');
  $('notifyBtn').dataset.on = on ? '1' : '';
  $('notifyMsg').textContent = text;
}

// Shows whether notifications are on here (called when the profile opens)
export async function refreshNotifications() {
  try {
    ({ key } = await api('GET', '/api/push/key'));
    if (!key || !supported()) {
      return show(null, t("Notifications aren't available on this device."));
    }
    const { sub } = await subscription();
    const on =
      !!sub &&
      Notification.permission === 'granted' &&
      (await api('POST', '/api/push/status', { endpoint: sub.endpoint })).on;
    show(on);
  } catch {
    show(null);
  }
}

async function turnOn() {
  if ((await Notification.requestPermission()) !== 'granted') {
    return show(false, t("Notifications are blocked for this site in your browser's settings."));
  }
  const { reg, sub: old } = await subscription();
  const sub =
    old ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key),
    }));
  await api('POST', '/api/push', { subscription: sub.toJSON(), lang: lang() });
  show(true, t("Notifications are on: we'll tell you about invitations and your turn."));
}

async function turnOff() {
  const { sub } = await subscription();
  if (sub) {
    await api('DELETE', '/api/push', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  show(false, t('Notifications are off.'));
}

export function initNotifications() {
  $('notifyBtn').addEventListener('click', async () => {
    $('notifyBtn').disabled = true;
    try {
      await ($('notifyBtn').dataset.on ? turnOff() : turnOn());
    } catch (err) {
      $('notifyMsg').textContent = t(err.message);
    } finally {
      $('notifyBtn').disabled = false;
    }
  });
}
