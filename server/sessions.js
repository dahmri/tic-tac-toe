// Login sessions, kept in Redis so every server instance sees them.
// The browser holds a random token in an HttpOnly cookie; Redis maps the
// token's hash to the user id and forgets it after 30 days without use.
//
//   sess:<hash>      the user id
//   usess:<id>       set of the user's session hashes
//   sessmeta:<hash>  hash: device ("Firefox on Windows"), created, seen (ms)
//
// The device is read from the browser's user agent; no IP address is kept.
// A session is shown to its owner by the first 12 characters of its hash,
// which can't be turned back into the token.

import { hashToken, newToken } from './security.js';

export const SESSION_TTL = 30 * 24 * 3600; // seconds
export const COOKIE = 'sid';
const SEEN_EVERY_MS = 60_000; // "last seen" is updated at most this often

const sessionKey = (hash) => `sess:${hash}`;
const userKey = (userId) => `usess:${userId}`;
const metaKey = (hash) => `sessmeta:${hash}`;
const publicId = (hash) => hash.slice(0, 12);

// "Chrome on macOS", from a user agent string
export function deviceName(ua = '') {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'A browser';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  return os ? `${browser} on ${os}` : browser;
}

export function createSessions(redis) {
  // Logs out the given sessions (hashes) of one user
  async function drop(userId, hashes) {
    if (!hashes.length) return;
    await redis
      .multi()
      .del(...hashes.map(sessionKey), ...hashes.map(metaKey))
      .srem(userKey(userId), ...hashes)
      .exec();
  }

  return {
    async create(userId, userAgent = '', now = Date.now()) {
      const token = newToken();
      const hash = hashToken(token);
      await redis
        .multi()
        .set(sessionKey(hash), String(userId), 'EX', SESSION_TTL)
        .hset(metaKey(hash), 'device', deviceName(userAgent), 'created', now, 'seen', now)
        .expire(metaKey(hash), SESSION_TTL)
        .sadd(userKey(userId), hash)
        .expire(userKey(userId), SESSION_TTL)
        .exec();
      return token;
    },

    // The user id for a token, or null. Each use extends the session.
    async userId(token, now = Date.now()) {
      if (typeof token !== 'string' || token.length < 40 || token.length > 60) return null;
      const hash = hashToken(token);
      const [[, id], [, seen]] = await redis
        .multi()
        .getex(sessionKey(hash), 'EX', SESSION_TTL)
        .hget(metaKey(hash), 'seen')
        .exec();
      if (!id) return null;
      if (now - Number(seen || 0) > SEEN_EVERY_MS) {
        await redis
          .multi()
          .hset(metaKey(hash), 'seen', now)
          .expire(metaKey(hash), SESSION_TTL)
          .exec();
      }
      return Number(id);
    },

    // The user's sessions, newest activity first; `current` marks the
    // one asking
    async list(userId, currentToken) {
      const current = currentToken ? hashToken(currentToken) : null;
      const hashes = await redis.smembers(userKey(userId));
      const m = redis.multi();
      for (const h of hashes) m.exists(sessionKey(h)).hgetall(metaKey(h));
      const res = hashes.length ? await m.exec() : [];
      const live = [];
      const gone = [];
      hashes.forEach((h, i) => {
        if (!res[i * 2][1]) return gone.push(h);
        const meta = res[i * 2 + 1][1] || {};
        live.push({
          id: publicId(h),
          device: meta.device || 'A browser',
          created: Number(meta.created) || null,
          seen: Number(meta.seen) || null,
          current: h === current,
        });
      });
      if (gone.length) await redis.srem(userKey(userId), ...gone);
      return live.sort((a, b) => Number(b.current) - Number(a.current) || b.seen - a.seen);
    },

    // Logs out one session, by the id list() gave
    async destroyById(userId, id) {
      const hashes = await redis.smembers(userKey(userId));
      await drop(
        userId,
        hashes.filter((h) => publicId(h) === id),
      );
    },

    async destroy(token, userId) {
      await drop(userId, [hashToken(token)]);
    },

    // Logs the user out everywhere, except the session doing the asking
    // (pass no token to log them out everywhere)
    async destroyOthers(userId, keepToken) {
      const keep = keepToken ? hashToken(keepToken) : null;
      await drop(
        userId,
        (await redis.smembers(userKey(userId))).filter((h) => h !== keep),
      );
    },
  };
}
