// The live connection to the game server (WebSocket at /ws). Keeps
// reconnecting with a growing pause if the network drops, so a closed
// laptop lid or a server restart heals by itself.

import { lang } from './i18n.js';

const PING_MS = 25_000; // keeps proxies from closing an idle connection
const MAX_RETRY_MS = 15_000;

// Callbacks: onMessage(msg), onStatus('connecting' | 'online' | 'offline')
export function connectLive({ onMessage, onStatus }) {
  let ws = null;
  let retries = 0;
  let stopped = false;
  let pingTimer = null;
  let retryTimer = null;

  function open() {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    // The server's messages come back in the page's language
    ws = new WebSocket(`${scheme}://${location.host}/ws?lang=${lang()}`);
    onStatus(retries ? 'offline' : 'connecting');

    ws.addEventListener('open', () => {
      // Whether the page is on screen goes with every ping: no notifications
      // while it is (server/push.js)
      const beat = () => send({ t: 'visible', on: document.visibilityState === 'visible' });
      beat();
      pingTimer = setInterval(() => {
        send({ t: 'ping' });
        beat();
      }, PING_MS);
    });
    ws.addEventListener('message', (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === 'hello') {
        retries = 0;
        onStatus('online');
      }
      onMessage(msg);
    });
    ws.addEventListener('close', (e) => {
      // Logged out by the site (account suspended or deleted): start over
      if (e.code === 4401) return location.reload();
      clearInterval(pingTimer);
      if (stopped) return;
      onStatus('offline');
      const delay = Math.min(1000 * 2 ** retries++, MAX_RETRY_MS);
      retryTimer = setTimeout(open, delay);
    });
  }

  function send(msg) {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  // Hidden or back on screen: said at once, not at the next ping
  const onVisibility = () => send({ t: 'visible', on: document.visibilityState === 'visible' });
  document.addEventListener('visibilitychange', onVisibility);

  open();

  return {
    send,
    close() {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      ws?.close();
    },
  };
}
