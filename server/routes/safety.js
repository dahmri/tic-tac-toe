// Blocking and reporting.
//
//   GET    /api/blocks        players you blocked
//   POST   /api/blocks        block one: { id }
//   DELETE /api/blocks/:id    unblock
//   POST   /api/reports       report one: { id, reason, details? }, reason one of
//                             username | cheating | harassment | other

import { SafetyError } from '../safety.js';

export default async function safetyRoutes(app) {
  const { safety, rateLimit } = app.ctx;

  const refuse = (reply, err) => {
    if (err instanceof SafetyError) return reply.code(400).send({ error: err.message });
    throw err;
  };

  app.get('/api/blocks', { preHandler: app.requireUser }, async (req) => ({
    blocked: await safety.blocked(req.userId),
  }));

  app.post('/api/blocks', { preHandler: app.requireUser }, async (req, reply) => {
    const id = req.body?.id;
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid request.' });
    try {
      await safety.block(req.userId, id);
      return reply.code(204).send();
    } catch (err) {
      return refuse(reply, err);
    }
  });

  app.delete('/api/blocks/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid request.' });
    await safety.unblock(req.userId, id);
    return reply.code(204).send();
  });

  app.post('/api/reports', { preHandler: app.requireUser }, async (req, reply) => {
    const r = await rateLimit(`reports:${req.userId}`, 10, 86_400);
    if (!r.ok)
      return reply
        .code(429)
        .send({ error: 'Too many attempts. Wait a few minutes and try again.' });
    const { id, reason, details } = req.body || {};
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid request.' });
    try {
      await safety.report(req.userId, id, reason, details);
      return reply.code(201).send({ ok: true });
    } catch (err) {
      return refuse(reply, err);
    }
  });
}
