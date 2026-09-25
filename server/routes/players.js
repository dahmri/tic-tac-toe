// Online players, for the lobby.
//
//   GET /api/players/online?country=FR&offset=0&limit=30
//     -> { total, players: [{ id, username, country, avatar, rating, playing }] }

import { isCountryCode } from '../../js/countries.js';

const MAX_LIMIT = 50;
const MAX_OFFSET = 5000;

export default async function playersRoutes(app) {
  const { presence, users, safety } = app.ctx;

  app.get('/api/players/online', { preHandler: app.requireUser }, async (req, reply) => {
    if (!(await users.publicProfile(req.userId))?.verified) {
      return reply.code(403).send({ error: 'Confirm your email to play online.' });
    }
    const country = String(req.query.country || '').toUpperCase() || null;
    if (country && !isCountryCode(country)) {
      return reply.code(400).send({ error: 'Unknown country.' });
    }
    const clamp = (v, max, dflt) => Math.min(Math.max(Number.parseInt(v, 10) || dflt, 0), max);
    return presence.list({
      country,
      offset: clamp(req.query.offset, MAX_OFFSET, 0),
      limit: clamp(req.query.limit, MAX_LIMIT, 30) || 30,
      excludeId: req.userId,
      avoid: await safety.avoidSet(req.userId),
    });
  });
}
