// Builds the HTTP server. Kept separate from index.js so tests can create
// an app against their own database and Redis.

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { createUsers } from './users.js';
import { createSessions, COOKIE } from './sessions.js';
import { createRateLimiter } from './rate-limit.js';
import { createPresence } from './presence.js';
import { createBus } from './bus.js';
import { createMatches } from './matches.js';
import { createInvites } from './invites.js';
import { createStats } from './stats.js';
import accountRoutes from './routes/account.js';
import playersRoutes from './routes/players.js';
import liveRoutes from './routes/live.js';
import statsRoutes from './routes/stats.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function buildApp({ config, db, redis }) {
  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: 16 * 1024,
    logger: {
      level: config.logLevel,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
  });

  const presence = createPresence(redis);
  const bus = createBus(redis);
  const stats = createStats(db, redis, app.log);
  // Every finished online round goes into the history and statistics
  const matches = createMatches(redis, { bus, onRoundFinished: stats.recordRound });
  app.decorate('ctx', {
    config,
    db,
    redis,
    users: createUsers(db, config.dataKey),
    sessions: createSessions(redis),
    rateLimit: createRateLimiter(redis, config.rateLimits),
    presence,
    bus,
    matches,
    invites: createInvites(redis, { bus, presence, matches }),
    stats,
  });

  // Save rounds that couldn't be recorded earlier (database briefly down)
  const retry = setInterval(() => {
    stats.retryPending().catch((err) => app.log.error({ err }, 'Retrying game records failed'));
  }, 30_000);
  retry.unref();
  app.addHook('onClose', () => {
    clearInterval(retry);
    return bus.close();
  });

  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 4096 } });

  // Fastify's JSON parser (it refuses __proto__ tricks), except that an
  // empty body, e.g. on a DELETE, simply means "no body"
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) =>
    body === '' ? done(null, undefined) : parseJson(req, body, done),
  );

  // Requests that change something must come from this site's own pages
  // (cookies are also SameSite=Lax; this blocks cross-site form posts)
  app.addHook('onRequest', async (req, reply) => {
    if (!UNSAFE.has(req.method) || !req.url.startsWith('/api/')) return;
    const origin = req.headers.origin;
    if (!origin) return; // not a browser: no cookies to abuse
    const own = `${req.protocol}://${req.host}`;
    if (origin !== own && !config.allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: 'Cross-site request refused.' });
    }
  });

  // Who is asking: resolved from the session cookie on every API call
  app.decorateRequest('userId', null);
  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/ws')) {
      req.userId = await app.ctx.sessions.userId(req.cookies[COOKIE]);
    }
  });
  app.decorate('requireUser', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'Please log in.' });
  });

  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err.validation ? 400 : err.statusCode;
    if (status >= 400 && status < 500) {
      // Hidden or forbidden files look the same as missing ones
      if (status === 403 && !req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found.' });
      }
      const error = status === 413 ? 'Request too large.' : 'Invalid request.';
      return reply.code(status).send({ error });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong on our side. Try again.' });
  });

  app.get('/api/health', async (req, reply) => {
    try {
      await Promise.all([db.query('SELECT 1'), redis.ping()]);
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  await app.register(accountRoutes);
  await app.register(playersRoutes);
  await app.register(liveRoutes);
  await app.register(statsRoutes);

  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'Not found.' }));

  if (config.staticDir) {
    await app.register(fastifyStatic, {
      root: resolve(config.staticDir),
      cacheControl: false,
      dotfiles: 'deny', // never .git, .env and the like
      setHeaders: (reply) => reply.header('Cache-Control', 'no-cache'),
    });
  }

  return app;
}
