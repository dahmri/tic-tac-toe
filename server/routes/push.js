// Notifications (server/push.js).
//
//   GET    /api/push/key       { key }: the VAPID public key, null when off
//   POST   /api/push           turn them on in this browser:
//                             { subscription, lang }
//   POST   /api/push/status    { endpoint } -> { on }: on in this browser?
//   DELETE /api/push          turn them off in this browser: { endpoint }

export default async function pushRoutes(app) {
  const { push } = app.ctx;

  app.get('/api/push/key', async () => ({ key: push.publicKey }));

  app.post('/api/push', { preHandler: app.requireUser }, async (req, reply) => {
    if (!push.enabled) return reply.code(404).send({ error: 'Not found.' });
    const ok = await push.subscribe(req.userId, req.body?.subscription, req.body?.lang);
    if (!ok) return reply.code(400).send({ error: 'Invalid request.' });
    return reply.code(204).send();
  });

  app.post('/api/push/status', { preHandler: app.requireUser }, async (req) => ({
    on: await push.has(req.userId, req.body?.endpoint),
  }));

  app.delete('/api/push', { preHandler: app.requireUser }, async (req, reply) => {
    await push.unsubscribe(req.userId, req.body?.endpoint);
    return reply.code(204).send();
  });
}
