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
      pingTimer = setInterval(() => send({ t: 'ping' }), PING_MS);
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
    ws.addEventListener('close', () => {
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

  open();

  return {
    send,
    close() {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      ws?.close();
    },
  };
}
