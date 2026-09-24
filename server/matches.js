// Live matches, kept in Redis so either player's server instance can
// handle their moves.
//
//   match:<id>     the match as JSON (see match.js), expires 1 h after the last move
//   ingame:<uid>   the match a player is in, which also stops new invitations
//   mt:deadlines   sorted set: match id -> when the player to move runs out
//                  of time. Every instance sweeps it each second; ZREM
//                  decides which one handles a match.
//
// Updates use compare-and-set: a change is saved only if nobody else changed
// the match in between, otherwise it is retried on the fresh copy. Two
// clicks can't both land.

import { randomUUID } from 'node:crypto';
import { applyMove, leave, newMatch, nextRound, symbolOf, timeUp, TURN_MS } from './match.js';

const TTL = 3600; // seconds
const ENDED_TTL = 120; // keep a finished match briefly so a reload still shows the result
const matchKey = (id) => `match:${id}`;
const playerKey = (userId) => `ingame:${userId}`;
const DEADLINES = 'mt:deadlines';

// What players are sent: the match plus how long the player to move has
// left, in ms (not a time: players' clocks may be wrong)
export const withClock = (match, now = Date.now()) =>
  match && { ...match, turnLeft: match.deadline ? Math.max(0, match.deadline - now) : null };

export class MatchError extends Error {}

export function createMatches(redis, { bus, onRoundFinished = async () => {}, turnMs = TURN_MS }) {
  redis.defineCommand('ttCasSet', {
    numberOfKeys: 1,
    lua: `if redis.call('GET', KEYS[1]) == ARGV[1] then
            redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]) return 1 end
          return 0`,
  });
  // Puts both players in the match only if neither is already in one
  redis.defineCommand('ttClaimPlayers', {
    numberOfKeys: 2,
    lua: `if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
          redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
          redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
          return 1`,
  });
  redis.defineCommand('ttReleasePlayer', {
    numberOfKeys: 1,
    lua: `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`,
  });

  const notify = (match) => {
    const msg = { t: 'match', match: withClock(match) };
    return Promise.all([bus.send(match.players.X.id, msg), bus.send(match.players.O.id, msg)]);
  };

  const clock = (match) =>
    match.deadline && !match.over && !match.ended
      ? redis.zadd(DEADLINES, match.deadline, match.id)
      : redis.zrem(DEADLINES, match.id);

  async function get(id) {
    const raw = await redis.get(matchKey(id));
    return raw ? JSON.parse(raw) : null;
  }

  // Applies change(match) -> { match, finished } | { error } atomically
  async function update(id, change) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const raw = await redis.get(matchKey(id));
      if (!raw) throw new MatchError('This game has ended.');
      const result = change(JSON.parse(raw));
      if (result.error) throw new MatchError(result.error);
      const { match, finished } = result;
      if (match.version === JSON.parse(raw).version) return match; // nothing changed

      const ttl = match.ended ? ENDED_TTL : TTL;
      if (!(await redis.ttCasSet(matchKey(id), raw, JSON.stringify(match), ttl))) continue;

      const players = [match.players.X.id, match.players.O.id];
      if (match.ended) {
        await Promise.all(players.map((p) => redis.ttReleasePlayer(playerKey(p), id)));
      } else {
        await Promise.all(players.map((p) => redis.expire(playerKey(p), TTL)));
      }
      await clock(match);
      if (finished) await onRoundFinished(finished);
      await notify(match);
      return match;
    }
    throw new MatchError('The game is busy. Try again.');
  }

  return {
    get,

    // Starts a match between the inviter (X) and the invited player (O)
    async start(x, o, variant = 'classic') {
      const match = newMatch({ id: randomUUID(), x, o, variant, turnMs });
      const claimed = await redis.ttClaimPlayers(playerKey(x.id), playerKey(o.id), match.id, TTL);
      if (!claimed) throw new MatchError('One of you is already in a game.');
      await redis.set(matchKey(match.id), JSON.stringify(match), 'EX', TTL);
      await clock(match);
      await notify(match);
      return match;
    },

    // The match a player is in right now, if any
    async current(userId) {
      const id = await redis.get(playerKey(userId));
      const match = id ? await get(id) : null;
      return match && symbolOf(match, userId) ? withClock(match) : null;
    },

    async isPlaying(userId) {
      return (await redis.exists(playerKey(userId))) === 1;
    },

    move: (id, userId, square) => update(id, (m) => applyMove(m, userId, square)),
    nextRound: (id, userId) => update(id, (m) => nextRound(m, userId)),
    leave: (id, userId) => update(id, (m) => leave(m, userId)),

    // Ends rounds whose player to move ran out of time
    async sweep(now = Date.now()) {
      const due = await redis.zrangebyscore(DEADLINES, '-inf', now, 'LIMIT', 0, 50);
      for (const id of due) {
        if (!(await redis.zrem(DEADLINES, id))) continue; // another instance has it
        try {
          const match = await update(id, (m) => timeUp(m, now));
          // A move landed just before: its new deadline still needs watching
          if (match.deadline && !match.over && !match.ended) await clock(match);
        } catch (err) {
          if (!(err instanceof MatchError)) throw err;
        }
      }
    },
  };
}
