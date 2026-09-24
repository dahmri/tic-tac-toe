// Your statistics and game history, and recording games against the computer.
//
//   GET  /api/me/stats   totals, streaks, top opponents
//   GET  /api/me/games   history, newest first: ?cursor=...&limit=20
//   POST /api/games/cpu  a finished game vs the computer:
//                        { difficulty, starter, moves, seconds }
//   GET  /api/leaderboard  best ratings: ?country=FR&offset=0&limit=20
//                        -> { total, players: [{ rank, id, username, country,
//                             avatar, rating, played, won }], me: { rank, rating, ... } | null }

import { checkCpuGame } from '../cpu-game.js';
import { isCountryCode } from '../../js/countries.js';

const MAX_OFFSET = 10_000;

export default async function statsRoutes(app) {
  const { stats, rateLimit } = app.ctx;

  app.get('/api/me/stats', { preHandler: app.requireUser }, async (req) => {
    const [summary, opponents] = await Promise.all([
      stats.summary(req.userId),
      stats.opponents(req.userId),
    ]);
    return { stats: summary, opponents };
  });

  app.get('/api/me/games', { preHandler: app.requireUser }, async (req) => {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
    return stats.history(req.userId, { cursor: req.query.cursor, limit });
  });

  app.get('/api/leaderboard', { preHandler: app.requireUser }, async (req, reply) => {
    const country = String(req.query.country || '').toUpperCase() || null;
    if (country && !isCountryCode(country)) {
      return reply.code(400).send({ error: 'Unknown country.' });
    }
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
    const offset = Math.min(Math.max(Number.parseInt(req.query.offset, 10) || 0, 0), MAX_OFFSET);
    return stats.leaderboard({ userId: req.userId, country, offset, limit });
  });

  app.post('/api/games/cpu', { preHandler: app.requireUser }, async (req, reply) => {
    const r = await rateLimit(`cpu-games:${req.userId}`, 300, 3600);
    if (!r.ok) return reply.code(429).send({ error: 'Too many games. Take a break!' });

    const body = req.body || {};
    const checked = checkCpuGame(body);
    if (checked.error) return reply.code(400).send({ error: checked.error });

    const seconds = Math.min(Math.max(Number(body.seconds) || 0, 0), 3600);
    const endedAt = Date.now();
    await stats.record({
      mode: 'cpu',
      difficulty: body.difficulty,
      xId: req.userId,
      oId: null,
      result: checked.result,
      forfeit: false,
      moves: body.moves,
      startedAt: endedAt - seconds * 1000,
      endedAt,
    });
    return reply.code(201).send({ result: checked.result });
  });
}
