// Friends.
//
//   GET    /api/friends          -> { friends: [{ id, username, country, avatar,
//                                   rating, online, playing }] }
//   POST   /api/friends          add one: { id } or { username } -> { id }
//   DELETE /api/friends/:id      remove one

import { FriendError } from '../friends.js';

export default async function friendsRoutes(app) {
  const { friends, rateLimit, safety } = app.ctx;

  app.get('/api/friends', { preHandler: app.requireUser }, async (req) => ({
    friends: await friends.list(req.userId),
  }));

  app.post('/api/friends', { preHandler: app.requireUser }, async (req, reply) => {
    const r = await rateLimit(`friends:${req.userId}`, 60, 3600);
    if (!r.ok)
      return reply
        .code(429)
        .send({ error: 'Too many attempts. Wait a few minutes and try again.' });
    if (Number.isInteger(req.body?.id) && (await safety.apart(req.userId, req.body.id))) {
      return reply.code(400).send({ error: "That player isn't available." });
    }
    try {
      const id = await friends.add(req.userId, {
        id: req.body?.id,
        username: req.body?.username,
      });
      return reply.code(201).send({ id });
    } catch (err) {
      if (err instanceof FriendError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.delete('/api/friends/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid request.' });
    await friends.remove(req.userId, id);
    return reply.code(204).send();
  });
}
