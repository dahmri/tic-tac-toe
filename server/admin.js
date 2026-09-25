// Running the site: handling reports, renaming, suspending and deleting
// players, and the usage numbers. Only admins reach this (routes/admin.js);
// every action is written to admin_log.
//
// Usage numbers are counts, never lists of who: players active each day
// are counted in Redis HyperLogLogs (active:<YYYY-MM-DD>, see sessions.js),
// which can say how many but not which players.

import { MatchError } from './matches.js';

export class AdminError extends Error {}

const DAY_MS = 86_400_000;
export const FOREVER = '9999-12-31T00:00:00Z';
export const activeKey = (ms) => `active:${new Date(ms).toISOString().slice(0, 10)}`;

// Deletes an account and everything around it: out of any queue or game
// first, as if they had left, then logged out everywhere. `kick` also
// closes their open pages' live connections (not when the player deletes
// the account themselves: that page shows its own goodbye).
export async function endAccount(ctx, id, { kick = true } = {}) {
  const { matchmaking, matches, users, sessions, presence, bus } = ctx;
  await matchmaking.leave(id);
  const match = await matches.current(id);
  try {
    if (match && !match.ended) await matches.leave(match.id, id);
  } catch (err) {
    if (!(err instanceof MatchError)) throw err; // it ended meanwhile: fine
  }
  await users.remove(id);
  await sessions.destroyOthers(id, null);
  await presence.forget(id);
  if (kick) await bus.send(id, { t: 'signed-out' });
}

export function createAdmin(ctx) {
  const { db, redis, sessions, presence, bus } = ctx;

  async function target(id) {
    const { rows } = await db.query(
      'SELECT id, username, country, avatar, role FROM users WHERE id = $1',
      [id],
    );
    if (!rows[0]) throw new AdminError('That player no longer exists.');
    if (rows[0].role === 'admin') throw new AdminError("Admins can't be changed here.");
    return rows[0];
  }

  const log = (adminId, action, player, details = '') =>
    db.query('INSERT INTO admin_log (admin_id, action, player, details) VALUES ($1, $2, $3, $4)', [
      adminId,
      action,
      player,
      details,
    ]);

  // Closes the player's open reports (all of them, or of one reason)
  const settle = (id, outcome, reason = null) =>
    db.query(
      `UPDATE reports SET handled_at = now(), outcome = $2
       WHERE reported_id = $1 AND handled_at IS NULL AND ($3::text IS NULL OR reason = $3)`,
      [id, outcome, reason],
    );

  return {
    async isAdmin(id) {
      if (!id) return false;
      const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [id]);
      return rows[0]?.role === 'admin';
    },

    // Open reports, oldest first, with how many each player has against them
    async reports() {
      const { rows } = await db.query(
        `SELECT r.id, r.reason, r.details, r.created_at,
                u.id AS player_id, u.username AS player, u.suspended_until,
                f.username AS reporter,
                count(*) OVER (PARTITION BY r.reported_id) AS against
         FROM reports r
         JOIN users u ON u.id = r.reported_id
         LEFT JOIN users f ON f.id = r.reporter_id
         WHERE r.handled_at IS NULL
         ORDER BY r.created_at
         LIMIT 200`,
      );
      return rows.map((r) => ({
        id: r.id,
        reason: r.reason,
        details: r.details,
        createdAt: r.created_at,
        player: { id: r.player_id, username: r.player, suspendedUntil: r.suspended_until },
        reporter: r.reporter,
        against: r.against,
      }));
    },

    async dismiss(adminId, reportId) {
      const { rows } = await db.query(
        `UPDATE reports r SET handled_at = now(), outcome = 'dismissed'
         FROM users u WHERE r.id = $1 AND u.id = r.reported_id AND r.handled_at IS NULL
         RETURNING u.username`,
        [reportId],
      );
      if (rows[0]) await log(adminId, 'dismissed a report', rows[0].username);
    },

    // Players whose username starts with `q`
    async search(q) {
      const { rows } = await db.query(
        `SELECT u.id, u.username, u.country, u.role, u.created_at, u.suspended_until,
                (SELECT count(*) FROM reports r
                 WHERE r.reported_id = u.id AND r.handled_at IS NULL) AS open_reports
         FROM users u
         WHERE lower(u.username) LIKE lower($1) || '%'
         ORDER BY lower(u.username)
         LIMIT 20`,
        [q.replace(/[\\%_]/g, (c) => `\\${c}`)],
      );
      return rows.map((r) => ({
        id: r.id,
        username: r.username,
        country: r.country,
        admin: r.role === 'admin',
        createdAt: r.created_at,
        suspendedUntil: r.suspended_until,
        openReports: r.open_reports,
      }));
    },

    // A new name for a player (Player<id> if none is given)
    async rename(adminId, id, username) {
      const before = await target(id);
      const name = username || `Player${id}`;
      const res = await ctx.users.update(id, { username: name });
      if (!res) throw new AdminError('That player no longer exists.');
      await presence.updateProfile(res.user, before.country);
      await settle(id, 'renamed', 'username');
      await log(adminId, 'renamed', before.username, `to ${name}`);
      return res.user.username;
    },

    // days: how long, or null until further notice
    async suspend(adminId, id, days, now = Date.now()) {
      const before = await target(id);
      const until = days ? new Date(now + days * DAY_MS).toISOString() : FOREVER;
      await db.query('UPDATE users SET suspended_until = $2 WHERE id = $1', [id, until]);
      await ctx.matchmaking.leave(id);
      await sessions.destroyOthers(id, null);
      await bus.send(id, { t: 'signed-out' });
      await settle(id, 'suspended');
      await log(
        adminId,
        'suspended',
        before.username,
        days ? `${days} days` : 'until further notice',
      );
      return until;
    },

    async unsuspend(adminId, id) {
      const before = await target(id);
      await db.query('UPDATE users SET suspended_until = NULL WHERE id = $1', [id]);
      await log(adminId, 'lifted the suspension of', before.username);
    },

    async remove(adminId, id) {
      const before = await target(id);
      await settle(id, 'deleted');
      await endAccount(ctx, id);
      await log(adminId, 'deleted', before.username);
    },

    async history() {
      const { rows } = await db.query(
        `SELECT l.action, l.player, l.details, l.created_at, a.username AS admin
         FROM admin_log l LEFT JOIN users a ON a.id = l.admin_id
         ORDER BY l.created_at DESC LIMIT 50`,
      );
      return rows.map((r) => ({
        admin: r.admin,
        action: r.action,
        player: r.player,
        details: r.details,
        at: r.created_at,
      }));
    },

    // The last `days` days, newest first: players active, sign-ups, and
    // games by kind; plus totals right now
    async usage(days = 30, now = Date.now()) {
      const since = new Date(now - (days - 1) * DAY_MS).toISOString().slice(0, 10);
      const [games, signups, totals, online] = await Promise.all([
        db.query(
          `SELECT to_char(ended_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, mode, variant,
                  count(*) AS n
           FROM games WHERE ended_at >= $1::date GROUP BY 1, 2, 3`,
          [since],
        ),
        db.query(
          `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*) AS n
           FROM users WHERE created_at >= $1::date GROUP BY 1`,
          [since],
        ),
        db.query(
          `SELECT (SELECT count(*) FROM users) AS players,
                  (SELECT count(*) FROM games) AS games,
                  (SELECT count(*) FROM reports WHERE handled_at IS NULL) AS open_reports`,
        ),
        redis.zcount('online', now - 90_000, '+inf'),
      ]);
      const list = Array.from({ length: days }, (_, i) => {
        const ms = now - i * DAY_MS;
        return {
          day: new Date(ms).toISOString().slice(0, 10),
          active: 0,
          signups: 0,
          online: 0,
          computer: 0,
          variants: { classic: 0, vanish: 0, ultimate: 0 },
        };
      });
      const byDay = new Map(list.map((d) => [d.day, d]));
      const m = redis.multi();
      for (const d of list) m.pfcount(`active:${d.day}`);
      (await m.exec()).forEach(([, n], i) => (list[i].active = Number(n)));
      for (const r of signups.rows) if (byDay.has(r.day)) byDay.get(r.day).signups = r.n;
      for (const r of games.rows) {
        const d = byDay.get(r.day);
        if (!d) continue;
        d[r.mode === 'online' ? 'online' : 'computer'] += r.n;
        d.variants[r.variant] = (d.variants[r.variant] ?? 0) + r.n;
      }
      const t = totals.rows[0];
      return {
        days: list,
        now: { online, players: t.players, games: t.games, openReports: t.open_reports },
      };
    },
  };
}
