// The weekly arena (server/arena.js). Joining and pausing go through the
// live connection ({ t: 'arena-join' }, { t: 'arena-pause' }).
//
//   GET /api/arena   the arena on show: { arena: { id, startsAt, endsAt,
//                    running }, total, players: [{ rank, id, username,
//                    country, avatar, points, played, won }],
//                    me: { rank, points, played, won, in } | null,
//                    last: { id, podium } }

export default async function arenaRoutes(app) {
  // Public: guests can look too
  app.get('/api/arena', async (req) => app.ctx.arena.standings(req.userId));
}
