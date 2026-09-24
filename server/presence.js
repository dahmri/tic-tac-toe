// Who is online, in Redis so every server instance sees the same list.
//
//   online            sorted set: user id -> last time seen (ms)
//   online:<CC>       the same, per country, for the country filter
//   player:<id>       hash: public profile (username, country, rating)
//   conns:<id>        open connections across all instances
//
// A player is online while they have the game open in at least one tab.
// Each instance refreshes its players' "last seen" every 30 s; anyone not
// seen for 90 s (a crashed instance, a lost network) drops off the list.

import { START_RATING } from './rating.js';

export const ONLINE_WINDOW_MS = 90_000;
const CONNS_TTL = 120; // seconds; refreshed by the heartbeat

const setKey = (country) => (country ? `online:${country}` : 'online');

export function createPresence(redis) {
  // Closing a connection and taking the player offline must be one step:
  // otherwise a new tab (or a reload) connecting in between would be
  // counted, then wiped out, leaving the player connected but not listed
  redis.defineCommand('ttDisconnect', {
    numberOfKeys: 3,
    lua: `if redis.call('DECR', KEYS[1]) > 0 then return 0 end
          redis.call('DEL', KEYS[1])
          redis.call('ZREM', KEYS[2], ARGV[1])
          local country = redis.call('HGET', KEYS[3], 'country')
          if country then redis.call('ZREM', 'online:' .. country, ARGV[1]) end
          return 1`,
  });

  return {
    // A connection opened
    async connect(user, now = Date.now()) {
      await redis
        .multi()
        .hset(
          `player:${user.id}`,
          'username',
          user.username,
          'country',
          user.country,
          'rating',
          user.rating ?? START_RATING,
        )
        .incr(`conns:${user.id}`)
        .expire(`conns:${user.id}`, CONNS_TTL)
        .zadd('online', now, user.id)
        .zadd(setKey(user.country), now, user.id)
        .exec();
    },

    // A connection closed. Returns true if it was the player's last one.
    async disconnect(userId) {
      return (
        (await redis.ttDisconnect(`conns:${userId}`, 'online', `player:${userId}`, userId)) === 1
      );
    },

    async isConnected(userId) {
      return Number(await redis.get(`conns:${userId}`)) > 0;
    },

    // Called every 30 s by each instance for the players connected to it
    async heartbeat(users, now = Date.now()) {
      if (!users.length) return;
      const m = redis.multi();
      for (const u of users) {
        m.zadd('online', now, u.id).zadd(setKey(u.country), now, u.id);
        m.expire(`conns:${u.id}`, CONNS_TTL);
      }
      await m.exec();
    },

    // Keeps the public profile and country list in step with profile edits
    async updateProfile(user, previousCountry) {
      const m = redis
        .multi()
        .hset(`player:${user.id}`, 'username', user.username, 'country', user.country);
      if (previousCountry && previousCountry !== user.country) {
        const score = await redis.zscore(setKey(previousCountry), user.id);
        m.zrem(setKey(previousCountry), user.id);
        if (score !== null) m.zadd(setKey(user.country), score, user.id);
      }
      await m.exec();
    },

    // After a rated round
    async setRating(userId, rating) {
      if (await redis.exists(`player:${userId}`))
        await redis.hset(`player:${userId}`, 'rating', rating);
    },

    // One page of online players, most recently active first, optionally
    // in one country. `playing` marks players already in a game.
    async list({ country = null, offset = 0, limit = 30, excludeId = null, now = Date.now() }) {
      const key = setKey(country);
      const min = now - ONLINE_WINDOW_MS;
      // Drop anyone whose instance stopped reporting them
      await redis.zremrangebyscore(key, '-inf', `(${min}`);
      const [[, total], [, ids], [, selfScore]] = await redis
        .multi()
        .zcount(key, min, '+inf')
        .zrevrangebyscore(key, '+inf', min, 'LIMIT', offset, limit + 1)
        .zscore(key, excludeId ?? 0)
        .exec();

      const pageIds = ids
        .map(Number)
        .filter((id) => id !== excludeId)
        .slice(0, limit);
      const m = redis.multi();
      for (const id of pageIds)
        m.hmget(`player:${id}`, 'username', 'country', 'rating').exists(`ingame:${id}`);
      const res = pageIds.length ? await m.exec() : [];

      const players = pageIds
        .map((id, i) => {
          const [username, cc, rating] = res[i * 2][1];
          const playing = res[i * 2 + 1][1] === 1;
          return username
            ? { id, username, country: cc, rating: Number(rating) || START_RATING, playing }
            : null;
        })
        .filter(Boolean);
      const self = selfScore !== null && Number(selfScore) >= min ? 1 : 0;
      return { total: Math.max(total - self, 0), players };
    },

    async isOnline(userId, now = Date.now()) {
      const score = await redis.zscore('online', userId);
      return score !== null && Number(score) >= now - ONLINE_WINDOW_MS;
    },

    async profile(userId) {
      const [username, country, rating] = await redis.hmget(
        `player:${userId}`,
        'username',
        'country',
        'rating',
      );
      return username
        ? { id: userId, username, country, rating: Number(rating) || START_RATING }
        : null;
    },
  };
}
