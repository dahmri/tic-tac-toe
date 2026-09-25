// Blocking and reporting (migrations/011_safety.sql).
//
// A block is stored one way but works both ways. Redis keeps, per player,
// the set of players they must be kept apart from:
//
//   avoid:<id>   set of user ids (blocked by them, or blocking them)
//
// Matchmaking and the lobby read it, and it's rebuilt from the database
// when a player connects, so it survives Redis losing it.

export const REPORT_REASONS = ['username', 'cheating', 'harassment', 'other'];

export class SafetyError extends Error {}

const avoidKey = (id) => `avoid:${id}`;

export function createSafety(db, redis, log) {
  // Both directions: who this player blocked, and who blocked them
  async function avoidIds(userId) {
    const { rows } = await db.query(
      `SELECT blocked_id AS id FROM blocks WHERE user_id = $1
       UNION SELECT user_id FROM blocks WHERE blocked_id = $1`,
      [userId],
    );
    return rows.map((r) => Number(r.id));
  }

  return {
    // Loads the player's avoid set into Redis (on connect)
    async refresh(userId) {
      const ids = await avoidIds(userId);
      const m = redis.multi().del(avoidKey(userId));
      if (ids.length) m.sadd(avoidKey(userId), ...ids);
      await m.exec();
    },

    async apart(a, b) {
      return (await redis.sismember(avoidKey(a), b)) === 1 || (await isBlocked(a, b));
    },

    async avoidSet(userId) {
      return new Set((await redis.smembers(avoidKey(userId))).map(Number));
    },

    // Players this one blocked, for their profile
    async blocked(userId) {
      const { rows } = await db.query(
        `SELECT u.id, u.username, u.country, u.avatar FROM blocks b
         JOIN users u ON u.id = b.blocked_id WHERE b.user_id = $1 ORDER BY b.created_at DESC`,
        [userId],
      );
      return rows.map((r) => ({ ...r, id: Number(r.id) }));
    },

    async block(userId, blockedId) {
      if (userId === blockedId) throw new SafetyError("That's you!");
      await db.tx(async (client) => {
        await client.query(
          'INSERT INTO blocks (user_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, blockedId],
        );
        // No longer friends, either way
        await client.query(
          `DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2)
             OR (user_id = $2 AND friend_id = $1)`,
          [userId, blockedId],
        );
      });
      await redis
        .multi()
        .sadd(avoidKey(userId), blockedId)
        .sadd(avoidKey(blockedId), userId)
        .exec();
    },

    async unblock(userId, blockedId) {
      await db.query('DELETE FROM blocks WHERE user_id = $1 AND blocked_id = $2', [
        userId,
        blockedId,
      ]);
      // Still apart if the other player blocks this one
      if (!(await isBlocked(blockedId, userId))) {
        await redis
          .multi()
          .srem(avoidKey(userId), blockedId)
          .srem(avoidKey(blockedId), userId)
          .exec();
      }
    },

    async report(reporterId, reportedId, reason, details) {
      if (!REPORT_REASONS.includes(reason)) throw new SafetyError('Choose a reason.');
      if (reporterId === reportedId) throw new SafetyError("That's you!");
      const text = typeof details === 'string' ? details.trim().slice(0, 500) : '';
      const { rows } = await db.query(
        `INSERT INTO reports (reporter_id, reported_id, reason, details)
         SELECT $1, id, $3, $4 FROM users WHERE id = $2 RETURNING id`,
        [reporterId, reportedId, reason, text],
      );
      if (!rows[0]) throw new SafetyError('That player no longer exists.');
      log.warn(
        { report: { id: Number(rows[0].id), reporterId, reportedId, reason } },
        'Player reported',
      );
    },
  };

  async function isBlocked(a, b) {
    const { rows } = await db.query(
      `SELECT 1 FROM blocks WHERE (user_id = $1 AND blocked_id = $2)
         OR (user_id = $2 AND blocked_id = $1) LIMIT 1`,
      [a, b],
    );
    return rows.length > 0;
  }
}
