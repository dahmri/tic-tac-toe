// Service worker: makes the game installable and playable offline (as a
// guest, or against the computer and on the same screen).
//
// Pages, scripts and styles are fetched from the network first, so a
// deploy shows up at once; the cached copy is only used when the network
// fails. The API and the live connection are never cached. The build
// (scripts/build.mjs) fills in the version and the files to cache up front.
//
// It also shows notifications (server/push.js): an invitation, or your turn,
// while the game isn't on screen. A click brings the game forward.

const VERSION = 'dev';
const PRECACHE = ['./'];
const CACHE = `pencil-ttt-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (request.mode === 'navigate' && (await cache.match('./')));
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/') || url.pathname === '/ws') return;
    if (url.pathname === '/version.json') return;
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    /* not ours: show the default below */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Pencil Tic-Tac-Toe', {
      body: data.body || '',
      tag: data.tag, // a newer one of the same kind replaces the last
      renotify: !!data.tag,
      icon: 'icons/icon-192.png',
      data: { url: data.url || './' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const page = pages.find((c) => new URL(c.url).origin === self.location.origin);
      if (page) return page.focus();
      return self.clients.openWindow(event.notification.data?.url || './');
    })(),
  );
});
