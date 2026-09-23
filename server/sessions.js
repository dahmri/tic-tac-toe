// Login sessions, kept in Redis so every server instance sees them.
// The browser holds a random token in an HttpOnly cookie; Redis maps the
// token's hash to the user id and forgets it after 30 days without use.

import { hashToken, newToken } from './security.js';

export const SESSION_TTL = 30 * 24 * 3600; // seconds
export const COOKIE = 'sid';

const sessionKey = (hash) => `sess:${hash}`;
const userKey = (userId) => `usess:${userId}`;

export function createSessions(redis) {
  return {
    async create(userId) {
      const token = newToken();
      const hash = hashToken(token);
      await redis
        .multi()
        .set(sessionKey(hash), String(userId), 'EX', SESSION_TTL)
        .sadd(userKey(userId), hash)
        .expire(userKey(userId), SESSION_TTL)
        .exec();
      return token;
    },

    // The user id for a token, or null. Each use extends the session.
    async userId(token) {
      if (typeof token !== 'string' || token.length < 40 || token.length > 60) return null;
      const id = await redis.getex(sessionKey(hashToken(token)), 'EX', SESSION_TTL);
      return id ? Number(id) : null;
    },

    async destroy(token, userId) {
      const hash = hashToken(token);
      await redis.multi().del(sessionKey(hash)).srem(userKey(userId), hash).exec();
    },

    // Logs the user out everywhere, except the session doing the asking
    async destroyOthers(userId, keepToken) {
      const keep = keepToken ? hashToken(keepToken) : null;
      const hashes = (await redis.smembers(userKey(userId))).filter((h) => h !== keep);
      if (!hashes.length) return;
      await redis
        .multi()
        .del(...hashes.map(sessionKey))
        .srem(userKey(userId), ...hashes)
        .exec();
    },
  };
}
