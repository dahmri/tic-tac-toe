// The daily puzzle.
//
//   GET  /api/puzzle?day=YYYY-MM-DD   your result for that day and your streaks
//   POST /api/puzzle/:day             an attempt: { moves: [first, reply, second] }
//                                     -> { attemptSolved, played, solved, streak, ... }
//
// Only the first attempt of a day counts. Days are the player's own
// calendar day, within one day of the server's.

import { isDayKey } from '../../js/puzzle.js';
import { isPlayableDay } from '../puzzles.js';

export default async function puzzleRoutes(app) {
  const { puzzles, rateLimit } = app.ctx;

  const badDay = (day) => !isDayKey(day) || !isPlayableDay(day);

  app.get('/api/puzzle', { preHandler: app.requireUser }, async (req, reply) => {
    const day = String(req.query.day || '');
    if (badDay(day)) return reply.code(400).send({ error: 'Invalid request.' });
    return puzzles.stats(req.userId, day);
  });

  app.post('/api/puzzle/:day', { preHandler: app.requireUser }, async (req, reply) => {
    const r = await rateLimit(`puzzle:${req.userId}`, 60, 3600);
    if (!r.ok) return reply.code(429).send({ error: 'Too many games. Take a break!' });
    const day = req.params.day;
    const moves = req.body?.moves;
    const squares =
      Array.isArray(moves) && moves.every((m) => Number.isInteger(m) && m >= 0 && m <= 8);
    if (badDay(day) || !squares || moves.length < 1 || moves.length > 3) {
      return reply.code(400).send({ error: 'Invalid request.' });
    }
    return puzzles.record(req.userId, day, moves);
  });
}
