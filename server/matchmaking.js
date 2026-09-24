// Quick match: "find me an opponent". Waiting players sit in a Redis
// queue ordered by rating, so every server instance shares it:
//
//   mm:queue   sorted set: user id -> rating (classic rules)
//   mm:since   hash: user id -> when they started waiting (ms)
//   mm:queue:vanish, mm:since:vanish   the same for the vanish variant
//   mm:variant hash: user id -> the rules they are waiting to play
//
// Players only meet others who want the same rules.
// A player is paired with the waiting player closest to their rating,
// within 100 points at first. The gap allowed grows by 10 points for every
// second either of them has waited, so nobody waits forever. The instance
// holding a waiting player's connection searches again every few seconds.
//
// Pairing is one Lua script: two instances can never take the same player,
// and players who started a game meanwhile, or whose server crashed, are
// dropped. A player reloading the page keeps their place but isn't paired
// until they are connected again; if they don't come back they leave the
// queue (routes/live.js).

import { MatchError } from './matches.js';
import { ONLINE_WINDOW_MS } from './presence.js';
import { isVariant } from '../js/rules.js';

const queueKey = (variant) => (variant === 'vanish' ? 'mm:queue:vanish' : 'mm:queue');
const sinceKey = (variant) => (variant === 'vanish' ? 'mm:since:vanish' : 'mm:since');
const VARIANT = 'mm:variant';
const ALL = [
  ['mm:queue', 'mm:since'],
  ['mm:queue:vanish', 'mm:since:vanish'],
];
export const BASE_GAP = 100; // rating points
export const GAP_PER_SECOND = 10;
const STALE_MS = 10 * 60_000; // disconnected and waiting this long: gone

export function createMatchmaking(redis, { presence, matches, stats, bus }) {
  // Returns the paired player's id, 0 if still waiting, or -1 if `me` is no
  // longer waiting (a retry after someone else paired them)
  redis.defineCommand('ttMatchmake', {
    numberOfKeys: 3,
    lua: `
      local me, rating, now = ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3])
      local retry, onlineSince = ARGV[4] == 'retry', tonumber(ARGV[5])
      local base, perMs = tonumber(ARGV[6]), tonumber(ARGV[7]) / 1000
      local staleMs = tonumber(ARGV[8])
      if retry and not redis.call('ZSCORE', KEYS[1], me) then return -1 end
      if redis.call('EXISTS', 'ingame:' .. me) == 1 then
        redis.call('ZREM', KEYS[1], me)
        redis.call('HDEL', KEYS[2], me)
        return -1
      end
      local mySince = tonumber(redis.call('HGET', KEYS[2], me) or now)

      local best, bestGap = nil, nil
      local function drop(id)
        redis.call('ZREM', KEYS[1], id)
        redis.call('HDEL', KEYS[2], id)
      end
      local function consider(list)
        for i = 1, #list, 2 do
          local id = list[i]
          if id ~= me then
            local conns = tonumber(redis.call('GET', 'conns:' .. id) or 0)
            local seen = tonumber(redis.call('ZSCORE', KEYS[3], id) or 0)
            local since = tonumber(redis.call('HGET', KEYS[2], id) or now)
            if redis.call('EXISTS', 'ingame:' .. id) == 1 then
              drop(id) -- started a game some other way
            elseif conns > 0 and seen < onlineSince then
              drop(id) -- their server stopped reporting them (a crash)
            elseif conns <= 0 then
              -- Page closed: most likely a reload, so keep their place but
              -- don't pair them until they're back. live.js removes them if
              -- they don't come back; this is the backstop.
              if now - since > staleMs then drop(id) end
            else
              local gap = math.abs(tonumber(list[i + 1]) - rating)
              local allowed = base + (now - math.min(since, mySince)) * perMs
              if gap <= allowed and (not bestGap or gap < bestGap) then
                best, bestGap = id, gap
              end
            end
          end
        end
      end
      -- The nearest ratings on each side are enough, however long the queue
      consider(redis.call('ZRANGEBYSCORE', KEYS[1], rating, '+inf', 'WITHSCORES', 'LIMIT', 0, 25))
      consider(redis.call('ZREVRANGEBYSCORE', KEYS[1], '(' .. rating, '-inf', 'WITHSCORES', 'LIMIT', 0, 25))

      if best then
        redis.call('ZREM', KEYS[1], best, me)
        redis.call('HDEL', KEYS[2], best, me)
        return tonumber(best)
      end
      if not retry then
        redis.call('ZADD', KEYS[1], rating, me)
        redis.call('HSETNX', KEYS[2], me, now)
      end
      return 0`,
  });

  const tell = (userId, waiting) => bus.send(userId, { t: 'queue', waiting });

  async function leave(userId) {
    const m = redis.multi();
    for (const [queue, since] of ALL) m.zrem(queue, userId).hdel(since, userId);
    const res = await m.hdel(VARIANT, userId).exec();
    if (res[0][1] || res[2][1]) await tell(userId, false);
  }

  // Starts a match with the player the queue paired us with. If either of
  // us started another game meanwhile, whoever is still free waits again.
  async function pair(me, otherId, variant) {
    const [a, b] = await Promise.all([presence.profile(me.id), presence.profile(otherId)]);
    const players = Math.random() < 0.5 ? [a || me, b] : [b, a || me];
    try {
      if (!b) throw new MatchError('That player is no longer online.');
      const match = await matches.start(...players, variant);
      await Promise.all([tell(me.id, false), tell(otherId, false)]);
      return match;
    } catch (err) {
      if (!(err instanceof MatchError)) throw err;
      for (const id of [me.id, otherId]) {
        if (!(await matches.isPlaying(id)) && (await presence.isOnline(id))) {
          await redis
            .multi()
            .zadd(queueKey(variant), await stats.rating(id), id)
            .hset(sinceKey(variant), id, Date.now())
            .hset(VARIANT, id, variant)
            .exec();
          await tell(id, true);
        }
      }
      return null;
    }
  }

  async function search(me, mode, now, variant) {
    const rating = await stats.rating(me.id);
    const found = await redis.ttMatchmake(
      queueKey(variant),
      sinceKey(variant),
      'online',
      me.id,
      rating,
      now,
      mode,
      now - ONLINE_WINDOW_MS,
      BASE_GAP,
      GAP_PER_SECOND,
      STALE_MS,
    );
    if (found === -1) return { waiting: false };
    if (found === 0) return { waiting: true };
    await redis.hdel(VARIANT, me.id, found);
    const match = await pair(me, found, variant);
    return match ? { waiting: false, match } : { waiting: true };
  }

  return {
    // Joins the queue, or starts a match straight away if someone suitable
    // is waiting
    async join(me, variant = 'classic', now = Date.now()) {
      if (!isVariant(variant)) throw new MatchError('Unknown rules.');
      if (await matches.isPlaying(me.id)) throw new MatchError('Finish your game first.');
      // Waiting for other rules? Switch queues.
      const before = await redis.hget(VARIANT, me.id);
      if (before && before !== variant) {
        await redis.multi().zrem(queueKey(before), me.id).hdel(sinceKey(before), me.id).exec();
      }
      const result = await search(me, 'join', now, variant);
      if (result.waiting) {
        await redis.hset(VARIANT, me.id, variant);
        await tell(me.id, true);
      }
      return result;
    },

    // Looks again for a player who is waiting (the gap allowed has grown)
    async retry(me, now = Date.now()) {
      const variant = (await redis.hget(VARIANT, me.id)) || 'classic';
      return search(me, 'retry', now, variant);
    },

    leave,

    async isWaiting(userId) {
      const [[, a], [, b]] = await redis
        .multi()
        .zscore(ALL[0][0], userId)
        .zscore(ALL[1][0], userId)
        .exec();
      return a !== null || b !== null;
    },
  };
}
