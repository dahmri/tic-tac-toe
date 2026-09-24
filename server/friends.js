// Friends: players someone saved (migrations/008_friends.sql), listed with
// whether they are online or playing right now (presence, in Redis).

import { START_RATING } from './rating.js';
import { ONLINE_WINDOW_MS } from './presence.js';

export const MAX_FRIENDS = 200;

export class FriendError extends Error {}

export function createFriends(db, redis) {
  return {
    // Friends, online first, then by name
    async list(userId, now = Date.now()) {
      const { rows } = await db.query(
        `SELECT u.id, u.username, u.country, u.avatar, coalesce(s.rating, ${START_RATING}) AS rating
         FROM friends f
         JOIN users u ON u.id = f.friend_id
         LEFT JOIN player_stats s ON s.user_id = u.id
         WHERE f.user_id = $1`,
        [userId],
      );
      if (!rows.length) return [];
      const m = redis.multi();
      for (const r of rows) m.zscore('online', r.id).exists(`ingame:${r.id}`);
      const res = await m.exec();
      const friends = rows.map((r, i) => {
        const seen = res[i * 2][1];
        return {
          id: Number(r.id),
          username: r.username,
          country: r.country,
          avatar: r.avatar,
          rating: r.rating,
          online: seen !== null && Number(seen) >= now - ONLINE_WINDOW_MS,
          playing: res[i * 2 + 1][1] === 1,
        };
      });
      return friends.sort(
        (a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username),
      );
    },

    async ids(userId) {
      const { rows } = await db.query('SELECT friend_id FROM friends WHERE user_id = $1', [userId]);
      return rows.map((r) => Number(r.friend_id));
    },

    // Adds a friend by id or by username; returns their id
    async add(userId, { id, username }) {
      const { rows } = Number.isInteger(id)
        ? await db.query('SELECT id FROM users WHERE id = $1', [id])
        : await db.query('SELECT id FROM users WHERE lower(username) = lower($1)', [
            typeof username === 'string' ? username.trim() : '',
          ]);
      if (!rows[0]) throw new FriendError('No player has that username.');
      const friendId = Number(rows[0].id);
      if (friendId === userId) throw new FriendError("That's you!");
      const { rows: count } = await db.query(
        'SELECT count(*)::int AS n FROM friends WHERE user_id = $1',
        [userId],
      );
      if (count[0].n >= MAX_FRIENDS) throw new FriendError('You can have up to 200 friends.');
      await db.query(
        'INSERT INTO friends (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, friendId],
      );
      return friendId;
    },

    async remove(userId, friendId) {
      await db.query('DELETE FROM friends WHERE user_id = $1 AND friend_id = $2', [
        userId,
        friendId,
      ]);
    },
  };
}
