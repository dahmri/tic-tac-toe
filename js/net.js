// Online play over a direct browser-to-browser (WebRTC) connection, using
// PeerJS and its free public server only to introduce the two players.
// The host's peer id is derived from the room code, so the code is all a
// friend needs to connect.

import { newRoomCode, peerIdFor } from './room.js';

const PING_MS = 4000;
const TIMEOUT_MS = 12000;
const JOIN_TIMEOUT_MS = 15000;

const ERRORS = {
  'peer-unavailable': 'No game found with that code. Check it and try again.',
  network: 'Lost the connection. Check your internet and try again.',
  'socket-error': 'Lost the connection. Check your internet and try again.',
  'server-error': 'The matchmaking server is unavailable. Try again in a minute.',
  'browser-incompatible':
    'This browser does not support online play. Try a recent Chrome, Firefox or Safari.',
  'unavailable-id': 'Could not create a game code. Try again.',
};

function describe(err) {
  return ERRORS[err?.type] || 'Something went wrong with the connection. Try again.';
}

function peerLibraryMissing(cb) {
  if (typeof window.Peer === 'function') return false;
  cb.onError('Online play could not load. Check your internet connection and reload the page.');
  return true;
}

// Wraps an open data connection with a heartbeat so a closed laptop lid or
// dropped network is noticed even when the browser never fires `close`.
function wire(conn, { onData, onClose }) {
  let lastSeen = Date.now();
  let closed = false;
  const send = (msg) => {
    if (conn.open) conn.send(msg);
  };
  const timer = setInterval(() => {
    if (Date.now() - lastSeen > TIMEOUT_MS) finish();
    else send({ type: 'ping' });
  }, PING_MS);

  function stop() {
    closed = true;
    clearInterval(timer);
    try {
      conn.close();
    } catch {
      /* already closed */
    }
  }
  function finish() {
    if (closed) return;
    stop();
    onClose();
  }

  conn.on('data', (msg) => {
    lastSeen = Date.now();
    if (msg && typeof msg === 'object' && msg.type !== 'ping') onData(msg);
  });
  conn.on('close', finish);
  conn.on('error', finish);
  return { send, close: stop };
}

// Callbacks: onReady(code), onConnect(), onData(msg), onLeave(), onError(message)
// The host keeps its code after a friend leaves, so someone can rejoin.
export function hostGame(cb) {
  let peer = null;
  let link = null;
  let destroyed = false;

  function start(attempt) {
    const code = newRoomCode();
    peer = new window.Peer(peerIdFor(code));
    peer.on('open', () => cb.onReady(code));
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (link) {
          conn.send({ type: 'full' });
          setTimeout(() => conn.close(), 300);
          return;
        }
        link = wire(conn, {
          onData: cb.onData,
          onClose: () => {
            link = null;
            cb.onLeave();
          },
        });
        cb.onConnect();
      });
    });
    peer.on('disconnected', () => {
      if (!destroyed) peer.reconnect();
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attempt < 3) {
        peer.destroy();
        start(attempt + 1);
      } else {
        cb.onError(describe(err));
      }
    });
  }

  if (!peerLibraryMissing(cb)) start(0);

  return {
    send: (msg) => link?.send(msg),
    leave() {
      destroyed = true;
      link?.close();
      peer?.destroy();
    },
  };
}

// Callbacks: onConnect(), onData(msg), onLeave(), onError(message)
export function joinGame(code, cb) {
  let link = null;
  let failed = false;
  let peer = null;
  let joinTimer = null;

  const fail = (message) => {
    if (failed) return;
    failed = true;
    clearTimeout(joinTimer);
    cb.onError(message);
  };

  if (!peerLibraryMissing(cb)) {
    peer = new window.Peer();
    joinTimer = setTimeout(() => {
      if (!link)
        fail(
          "Couldn't reach that game. Ask your friend to check the code, or try another network.",
        );
    }, JOIN_TIMEOUT_MS);

    peer.on('open', () => {
      const conn = peer.connect(peerIdFor(code), { reliable: true });
      conn.on('open', () => {
        clearTimeout(joinTimer);
        link = wire(conn, {
          onData: (msg) =>
            msg.type === 'full' ? fail('That game already has two players.') : cb.onData(msg),
          onClose: () => {
            if (!failed) cb.onLeave();
          },
        });
        cb.onConnect();
      });
    });
    peer.on('error', (err) => fail(describe(err)));
  }

  return {
    send: (msg) => link?.send(msg),
    leave() {
      failed = true;
      clearTimeout(joinTimer);
      link?.close();
      peer?.destroy();
    },
  };
}
