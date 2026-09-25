// Builds the HTTP server. Kept separate from index.js so tests can create
// an app against their own database and Redis.

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createUsers } from './users.js';
import { createSessions, COOKIE } from './sessions.js';
import { createRateLimiter } from './rate-limit.js';
import { createPresence } from './presence.js';
import { createBus } from './bus.js';
import { createMatches } from './matches.js';
import { createInvites } from './invites.js';
import { createStats } from './stats.js';
import { createMatchmaking } from './matchmaking.js';
import { createSafety } from './safety.js';
import { createChallenges } from './challenge.js';
import { createMailer } from './mailer.js';
import { createEmailVerification } from './email-verification.js';
import { createPasswordReset } from './password-reset.js';
import { createFriends } from './friends.js';
import { createPuzzles } from './puzzles.js';
import { createAchievements } from './achievements.js';
import { pickLang, translate } from '../js/i18n.js';
import accountRoutes from './routes/account.js';
import playersRoutes from './routes/players.js';
import liveRoutes from './routes/live.js';
import statsRoutes from './routes/stats.js';
import friendsRoutes from './routes/friends.js';
import safetyRoutes from './routes/safety.js';
import puzzleRoutes from './routes/puzzles.js';
import adminRoutes from './routes/admin.js';
import { createAdmin } from './admin.js';
import pushRoutes from './routes/push.js';
import { createPush } from './push.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

// pushSender: a stand-in for web push, in tests
export async function buildApp({ config, db, redis, pushSender = null }) {
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
  // Every finished online round goes into the history and statistics, and
  // both players hear how their ratings moved
  async function roundFinished(finished) {
    const saved = await stats.recordRound(finished);
    if (!saved) return;
    try {
      const ratings = saved.players;
      const msg = { t: 'ratings', match: finished.matchId, round: finished.round, ratings };
      await Promise.all(
        Object.entries(ratings).map(async ([id, { rating }]) => {
          // The lobby shows the classic rating
          if ((finished.variant ?? 'classic') === 'classic') {
            await presence.setRating(Number(id), rating);
          }
          await bus.send(Number(id), msg);
        }),
      );
    } catch (err) {
      app.log.error({ err }, 'Could not announce new ratings');
    }
  }
  const matches = createMatches(redis, {
    bus,
    // Players show the rating for the match's rules
    ratingOf: (id, variant) => stats.rating(id, variant),
    onRoundFinished: roundFinished,
    turnMs: config.turnMs,
  });
  const users = createUsers(db, config.dataKey);
  const safety = createSafety(db, redis, app.log);
  const friends = createFriends(db, redis);
  const puzzles = createPuzzles(db);
  const mailer = createMailer({ config, redis, log: app.log });
  app.decorate('ctx', {
    config,
    db,
    redis,
    users,
    mailer,
    emailVerification: createEmailVerification({ redis, mailer, users }),
    passwordReset: createPasswordReset({ redis, mailer, users }),
    friends,
    puzzles,
    achievements: createAchievements({ db, stats, friends, puzzles }),
    sessions: createSessions(redis),
    rateLimit: createRateLimiter(redis, config.rateLimits),
    presence,
    bus,
    matches,
    safety,
    challenges: createChallenges({
      key: config.dataKey,
      redis,
      bits: config.challengeBits,
      minAgeMs: config.challengeMinMs,
    }),
    invites: createInvites(redis, { bus, presence, matches, safety }),
    matchmaking: createMatchmaking(redis, { presence, matches, stats, bus }),
    stats,
    push: createPush({ db, redis, config, log: app.log, sender: pushSender }),
  });
  app.ctx.admin = createAdmin(app.ctx);

  // Save rounds that couldn't be recorded earlier (database briefly down)
  const retry = setInterval(() => {
    stats.retryPending().catch((err) => app.log.error({ err }, 'Retrying game records failed'));
  }, 30_000);
  retry.unref();
  // Players who ran out of time lose the round
  const turnClock = setInterval(() => {
    matches.sweep().catch((err) => app.log.error({ err }, 'Turn clock sweep failed'));
  }, 1000);
  turnClock.unref();
  app.addHook('onClose', () => {
    clearInterval(retry);
    clearInterval(turnClock);
    return bus.close();
  });

  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 4096 } });

  // Fastify's JSON parser (it refuses __proto__ tricks), except that an
  // empty body, e.g. on a DELETE, simply means "no body"
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) =>
    body === '' ? done(null, undefined) : parseJson(req, String(body), done),
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

  // Messages are written in English and translated on the way out, into
  // the language the page asked for (Accept-Language)
  app.decorateRequest('lang', 'en');
  app.addHook('onRequest', async (req) => {
    req.lang = pickLang(req.headers['accept-language']);
  });
  app.addHook('preSerialization', async (req, reply, /** @type {any} */ payload) => {
    if (req.lang === 'en' || !payload || typeof payload !== 'object') return payload;
    if (typeof payload.error !== 'string' && !payload.fields) return payload;
    const out = { ...payload };
    if (typeof out.error === 'string') out.error = translate(req.lang, out.error);
    if (out.fields) {
      out.fields = Object.fromEntries(
        Object.entries(out.fields).map(([k, v]) => [k, translate(req.lang, v)]),
      );
    }
    return out;
  });

  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });

  app.setErrorHandler((/** @type {any} */ err, req, reply) => {
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

  // For uptime checks: 200 with the version when the database and Redis
  // answer, 503 when they don't
  app.get('/api/health', async (req, reply) => {
    try {
      await Promise.all([db.query('SELECT 1'), redis.ping()]);
      return { ok: true, version: VERSION };
    } catch {
      return reply.code(503).send({ ok: false, version: VERSION });
    }
  });

  // Errors from players' browsers (js/monitor.js), written to the log
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  app.post('/api/client-errors', async (req, reply) => {
    const r = await app.ctx.rateLimit(`client-errors:${req.ip}`, 30, 3600);
    if (r.ok) {
      const b = /** @type {any} */ (req.body) || {};
      req.log.error(
        {
          clientError: {
            kind: text(b.kind, 20),
            message: text(b.message, 300),
            stack: text(b.stack, 1500),
            page: text(b.page, 200),
            lang: text(b.lang, 5),
            userAgent: text(b.userAgent, 200),
          },
          userId: req.userId,
        },
        'Error in a browser',
      );
    }
    return reply.code(204).send();
  });

  await app.register(accountRoutes);
  await app.register(playersRoutes);
  await app.register(liveRoutes);
  await app.register(statsRoutes);
  await app.register(friendsRoutes);
  await app.register(safetyRoutes);
  await app.register(puzzleRoutes);
  await app.register(adminRoutes);
  await app.register(pushRoutes);

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
