// The weekly arena (rules and schedule in js/arena.js). Players join while
// it runs; every couple of seconds one server instance pairs those waiting,
// closest in points first, never twice in a row against the same player.
// Each pairing is one classic game; the result scores points, the game
// closes after a moment to see it, and both wait for a new opponent.
//
//   arena:<id>:in          set: players in the arena (not paused)
//   arena:<id>:last:<uid>  their last opponent
//   arena:rest:<uid>       a breather between games: from the end of one
//                          until a while after it closes
//   arena:closing          sorted set: arena game -> when to close it
//   arena:sweep            lock: one instance pairs at a time
//
// Points and games are kept in arena_players (migration 016).

import { arenaAt, POINTS, previousArena } from '../js/arena.js';

const inKey = (id) => `arena:${id}:in`;
const lastKey = (id, uid) => `arena:${id}:last:${uid}`;
const restKey = (uid) => `arena:rest:${uid}`;

export class ArenaError extends Error {}

export function createArena({ db, redis, matches, presence, matchmaking, bus, config, log }) {
  const always = !!config.arenaAlways;
  // Between the end of a game and the next pairing
  const restMs = Math.max(1, config.arenaRestMs ?? 5000);
  const current = (now = Date.now()) => arenaAt(now, always);

  // Tells a player their arena standing changed
  const tell = (uid) => bus.send(uid, { t: 'arena' }).catch(() => {});

  // Pairs up players waiting in the arena, best scores together
  async function pairUp(arena) {
    const ids = (await redis.smembers(inKey(arena.id))).map(Number);
    const ready = [];
    for (const id of ids) {
      if (
        !(await redis.exists(restKey(id))) &&
        (await presence.isConnected(id)) &&
        !(await matches.isPlaying(id))
      ) {
        ready.push(id);
      }
    }
    if (ready.length < 2) return 0;
    const { rows } = await db.query(
      'SELECT user_id, points FROM arena_players WHERE arena = $1 AND user_id = ANY($2)',
      [arena.id, ready],
    );
    const points = new Map(rows.map((r) => [Number(r.user_id), r.points]));
    // Most points first; equal points in random order
    const queue = ready
      .map((id) => ({ id, points: points.get(id) ?? 0, r: Math.random() }))
      .sort((a, b) => b.points - a.points || a.r - b.r)
      .map((p) => p.id);
    let started = 0;
    while (queue.length >= 2) {
      const a = queue.shift();
      const last = Number(await redis.get(lastKey(arena.id, a)));
      // The nearest in points who isn't the last opponent (if there's anyone else)
      let i = queue.findIndex((b) => b !== last);
      if (i < 0) i = 0;
      const b = queue.splice(i, 1)[0];
      const [pa, pb] = await Promise.all([presence.profile(a), presence.profile(b)]);
      if (!pa || !pb) continue;
      const [x, o] = Math.random() < 0.5 ? [pa, pb] : [pb, pa];
      try {
        await Promise.all([matchmaking.leave(a), matchmaking.leave(b)]);
        await matches.start(x, o, 'classic', { arena: arena.id });
        started++;
      } catch (err) {
        log.warn({ err: err.message }, 'Arena pairing failed');
      }
    }
    return started;
  }

  return {
    current,

    async join(userId, now = Date.now()) {
      const arena = current(now);
      if (!arena.running) throw new ArenaError('The arena is closed right now.');
      await db.query(
        'INSERT INTO arena_players (arena, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [arena.id, userId],
      );
      await redis.sadd(inKey(arena.id), userId);
      await redis.pexpireat(inKey(arena.id), arena.endsAt + 3_600_000);
      await tell(userId);
    },

    async pause(userId, now = Date.now()) {
      await redis.srem(inKey(current(now).id), userId);
      await tell(userId);
    },

    // A finished round of a game: scores it if it was an arena game, and
    // schedules the game to close
    async scored(finished, now = Date.now()) {
      if (!finished.arena) return;
      // Once per round, even if this runs twice
      const once = await redis.set(
        `arena:scored:${finished.matchId}:${finished.round}`,
        '1',
        'EX',
        3600,
        'NX',
      );
      if (!once) return;
      const outcome = (sym) =>
        finished.result === 'D' ? 'D' : finished.result === sym ? 'W' : 'L';
      for (const [uid, sym, opp] of [
        [finished.xId, 'X', finished.oId],
        [finished.oId, 'O', finished.xId],
      ]) {
        const o = outcome(sym);
        await db.query(
          `INSERT INTO arena_players (arena, user_id, points, played, won, drawn)
           VALUES ($1, $2, $3, 1, $4, $5)
           ON CONFLICT (arena, user_id) DO UPDATE SET
             points = arena_players.points + $3,
             played = arena_players.played + 1,
             won = arena_players.won + $4,
             drawn = arena_players.drawn + $5`,
          [finished.arena, uid, POINTS[o], o === 'W' ? 1 : 0, o === 'D' ? 1 : 0],
        );
        await redis
          .multi()
          .set(lastKey(finished.arena, uid), opp, 'EX', 6 * 3600)
          .set(restKey(uid), '1', 'PX', restMs)
          .exec();
        await tell(uid);
      }
      // The result stays on the board a moment, then the game closes
      await redis.zadd('arena:closing', now + restMs * 0.6, finished.matchId);
    },

    // Every couple of seconds: close arena games whose result has been
    // seen, and pair the players waiting
    async sweep(now = Date.now()) {
      const due = await redis.zrangebyscore('arena:closing', '-inf', now, 'LIMIT', 0, 50);
      for (const id of due) {
        if (!(await redis.zrem('arena:closing', id))) continue; // another instance has it
        const match = await matches.close(id).catch(() => null); // gone: nothing to close
        // Back in the lobby for a breather before the next pairing
        if (match) {
          await redis
            .multi()
            .set(restKey(match.players.X.id), '1', 'PX', restMs)
            .set(restKey(match.players.O.id), '1', 'PX', restMs)
            .exec();
        }
      }
      if (!(await redis.set('arena:sweep', '1', 'PX', 1900, 'NX'))) return 0;
      const arena = current(now);
      return arena.running ? pairUp(arena) : 0;
    },

    // The arena on show (running or next), its best players, where `userId`
    // stands, and the last one's top three
    async standings(userId = null, now = Date.now(), limit = 20) {
      const arena = current(now);
      const last = previousArena(arena, always);
      const board = (id, n) =>
        db.query(
          `SELECT a.user_id, u.username, u.country, u.avatar, a.points, a.played, a.won
           FROM arena_players a JOIN users u ON u.id = a.user_id
           WHERE a.arena = $1
           ORDER BY a.points DESC, a.won DESC, a.user_id
           LIMIT $2`,
          [id, n],
        );
      const [top, count, podium, mine, joined] = await Promise.all([
        board(arena.id, limit),
        db.query('SELECT count(*)::int AS n FROM arena_players WHERE arena = $1', [arena.id]),
        board(last, 3),
        userId
          ? db.query(
              `SELECT a.points, a.played, a.won,
                 (SELECT count(*)::int + 1 FROM arena_players b
                  WHERE b.arena = a.arena AND (b.points > a.points
                    OR (b.points = a.points AND (b.won > a.won
                      OR (b.won = a.won AND b.user_id < a.user_id))))) AS rank
               FROM arena_players a WHERE a.arena = $1 AND a.user_id = $2`,
              [arena.id, userId],
            )
          : { rows: [] },
        userId ? redis.sismember(inKey(arena.id), userId) : 0,
      ]);
      const row = (r, i) => ({
        rank: i + 1,
        id: Number(r.user_id),
        username: r.username,
        country: r.country,
        avatar: r.avatar,
        points: r.points,
        played: r.played,
        won: r.won,
      });
      const me = mine.rows[0];
      return {
        arena: {
          id: arena.id,
          startsAt: new Date(arena.startsAt).toISOString(),
          endsAt: new Date(arena.endsAt).toISOString(),
          running: arena.running,
        },
        total: count.rows[0].n,
        players: top.rows.map(row),
        me: me
          ? { rank: me.rank, points: me.points, played: me.played, won: me.won, in: !!joined }
          : null,
        last: { id: last, podium: podium.rows.map(row) },
      };
    },
  };
}
