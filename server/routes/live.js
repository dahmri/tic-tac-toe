// The live connection (WebSocket at /ws). While a player has the game open
// they show as online, receive invitations, and play matches through it.
//
// Browser -> server: { t: 'invite', to, variant? } | { t: 'invite-accept', id }
//   | { t: 'invite-decline', id } | { t: 'invite-cancel', id }
//   | { t: 'move', match, square } | { t: 'next-round', match }
//   | { t: 'leave', match } | { t: 'queue-join', variant? } | { t: 'queue-leave' }
//   | { t: 'react', match, emoji } | { t: 'watch', user } | { t: 'unwatch' } | { t: 'ping' }
// Server -> browser: { t: 'hello', me, match, invites, waiting } | { t: 'match', match }
//   | { t: 'queue', waiting } | { t: 'ratings', match, round, ratings }
//   | { t: 'invite', invite } | { t: 'invite-sent', invite }
//   | { t: 'invite-declined', id, by } | { t: 'invite-gone', id }
//   | { t: 'reaction', match, from, emoji }
//   | { t: 'watching', match, count } then { t: 'watched', match } as it goes on
//   | { t: 'watchers', match, count } (to the players and spectators)
//   | { t: 'error', message } | { t: 'pong' }

import { InviteError } from '../invites.js';
import { MatchError } from '../matches.js';
import { symbolOf } from '../match.js';
import { isReaction } from '../../js/reactions.js';
import { pickLang, translate } from '../../js/i18n.js';

const HEARTBEAT_MS = 30_000;
const MAX_MESSAGES_PER_10S = 60;
const QUEUE_RETRY_MS = 3_000; // waiting players look again this often
const REACTION_GAP_MS = 1_500; // one reaction per player this often, at most

export default async function liveRoutes(app) {
  const { presence, bus, invites, matches, matchmaking, users, config } = app.ctx;

  // Players connected to this instance: id -> { user, sockets, waiting }
  const local = new Map();
  const leaveTimers = new Map();

  // Keep this instance's players marked online, and drop dead connections
  const heartbeat = setInterval(() => {
    presence.heartbeat([...local.values()].map((l) => l.user)).catch((err) => app.log.error(err));
    for (const { sockets } of local.values()) {
      for (const s of sockets) {
        if (s.alive === false) s.terminate();
        else {
          s.alive = false;
          s.ping();
        }
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  // Players waiting for a quick match look again, with a wider rating gap
  const queueRetry = setInterval(() => {
    for (const entry of local.values()) {
      if (!entry.waiting) continue;
      matchmaking.retry(entry.user).then(
        (r) => {
          if (!r.waiting) entry.waiting = false;
        },
        (err) => app.log.error(err),
      );
    }
  }, QUEUE_RETRY_MS);
  queueRetry.unref();

  app.addHook('onClose', async () => {
    clearInterval(heartbeat);
    clearInterval(queueRetry);
    for (const t of leaveTimers.values()) clearTimeout(t);
    for (const { sockets } of local.values()) for (const s of sockets) s.terminate();
  });

  // After a player's last connection closes, give them a moment to come
  // back (a reload); if they don't, they stop looking for a quick match and
  // leave their match (see match.js leave()).
  function scheduleLeave(userId) {
    clearTimeout(leaveTimers.get(userId));
    const timer = setTimeout(async () => {
      leaveTimers.delete(userId);
      try {
        if (await presence.isConnected(userId)) return;
        await matchmaking.leave(userId);
        const match = await matches.current(userId);
        if (match && !match.ended) await matches.leave(match.id, userId);
      } catch (err) {
        if (!(err instanceof MatchError)) app.log.error(err);
      }
    }, config.leaveGraceMs);
    timer.unref();
    leaveTimers.set(userId, timer);
  }

  // Relays a reaction to both players of the match (the sender's other
  // tabs show it too). Extra ones inside the gap are quietly dropped.
  /* ---------- Spectators ---------- */
  // A connection watches at most one match. watchers:<match id> is the set
  // of players watching it, for the count the players see.

  const watchersKey = (matchId) => `watchers:${matchId}`;

  async function announceWatchers(match) {
    const count = await app.ctx.redis.scard(watchersKey(match.id));
    const msg = { t: 'watchers', match: match.id, count };
    await Promise.all([
      bus.send(match.players.X.id, msg),
      bus.send(match.players.O.id, msg),
      bus.toWatchers(match.id, msg),
    ]);
    return count;
  }

  async function watch(me, msg, conn) {
    const match = Number.isInteger(msg.user) ? await matches.current(msg.user) : null;
    if (!match || match.ended) throw new MatchError('That game has ended.');
    const { X, O } = match.players;
    if (X.id === me.id || O.id === me.id) throw new MatchError("You're playing this game.");
    if ((await app.ctx.safety.apart(me.id, X.id)) || (await app.ctx.safety.apart(me.id, O.id))) {
      throw new MatchError("That game isn't available.");
    }
    await unwatch(conn);
    conn.watching = { match, stop: await bus.watch(match.id, conn.send) };
    await app.ctx.redis
      .multi()
      .sadd(watchersKey(match.id), me.id)
      .expire(watchersKey(match.id), 3600)
      .exec();
    const count = await announceWatchers(match);
    return { t: 'watching', match, count };
  }

  async function unwatch(conn) {
    const was = conn.watching;
    if (!was) return null;
    conn.watching = null;
    await was.stop();
    await app.ctx.redis.srem(watchersKey(was.match.id), conn.me.id);
    await announceWatchers(was.match);
    return null;
  }

  async function react(me, msg) {
    if (!isReaction(msg.emoji)) return { t: 'error', message: 'Unknown reaction.' };
    if (typeof msg.match !== 'string' || msg.match.length > 64) {
      throw new MatchError('This game has ended.');
    }
    const match = await matches.get(msg.match);
    if (!match || match.ended || !symbolOf(match, me.id)) {
      throw new MatchError('This game has ended.');
    }
    const first = await app.ctx.redis.set(`react:${me.id}`, '1', 'PX', REACTION_GAP_MS, 'NX');
    if (!first) return null;
    const out = { t: 'reaction', match: match.id, from: me.id, emoji: msg.emoji };
    await Promise.all([
      bus.send(match.players.X.id, out),
      bus.send(match.players.O.id, out),
      bus.toWatchers(match.id, out),
    ]);
    return null;
  }

  async function handle(me, msg, conn) {
    switch (msg.t) {
      case 'ping':
        return { t: 'pong' };
      case 'invite':
        return invites.send(me, msg.to, msg.variant ?? 'classic');
      case 'invite-accept': {
        // A game started by invitation ends any search for a quick match
        const match = await invites.accept(me, msg.id);
        await Promise.all(Object.values(match.players).map((p) => matchmaking.leave(p.id)));
        return null;
      }
      case 'invite-decline':
        return invites.decline(me, msg.id);
      case 'invite-cancel':
        return invites.cancel(me, msg.id);
      case 'move':
        return matches.move(String(msg.match), me.id, msg.square);
      case 'next-round':
        return matches.nextRound(String(msg.match), me.id);
      case 'leave':
        return matches.leave(String(msg.match), me.id);
      case 'queue-join':
        await matchmaking.join(me, msg.variant ?? 'classic');
        return null;
      case 'queue-leave':
        return matchmaking.leave(me.id);
      case 'react':
        return react(me, msg);
      case 'watch':
        return watch(me, msg, conn);
      case 'unwatch':
        return unwatch(conn);
      default:
        return { t: 'error', message: 'Unknown request.' };
    }
  }

  // Refuse before the WebSocket handshake: other sites' pages, anyone not
  // logged in, and players who haven't confirmed their email never get a
  // connection
  async function admit(req, reply) {
    const origin = req.headers.origin;
    const own = `${req.protocol}://${req.host}`;
    if (origin && origin !== own && !config.allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: 'Cross-site connection refused.' });
    }
    req.profile = req.userId ? await users.publicProfile(req.userId) : null;
    if (!req.profile) return reply.code(401).send({ error: 'Please log in.' });
    if (!req.profile.verified) {
      return reply.code(403).send({ error: 'Confirm your email to play online.' });
    }
  }

  app.get('/ws', { websocket: true, preHandler: admit }, async (socket, req) => {
    const { id, username, country, avatar, rating } = req.profile;
    const me = { id, username, country, avatar, rating };

    // Error messages in the page's language (/ws?lang=fr)
    const lang = pickLang(req.query.lang);
    /** @param {Record<string, any>} message */
    const send = ({ template, vars, ...msg }) => {
      if (socket.readyState !== socket.OPEN) return;
      const out =
        msg.t === 'error' && lang !== 'en'
          ? { ...msg, message: translate(lang, template ?? msg.message, vars) }
          : msg;
      socket.send(JSON.stringify(out));
    };
    // This connection's own state: the match it's watching, if any
    const conn = { me, send, watching: null };
    socket.alive = true;
    socket.on('pong', () => {
      socket.alive = true;
    });

    // Register before anything async can fail, so close() always cleans up
    let entry = local.get(me.id);
    if (!entry) local.set(me.id, (entry = { user: me, sockets: new Set() }));
    entry.sockets.add(socket);
    clearTimeout(leaveTimers.get(me.id));
    leaveTimers.delete(me.id);

    // Every tab of the player hears whether they are waiting for a match;
    // this instance keeps searching for them while they are
    const stopListening = bus.listen(me.id, (msg) => {
      if (msg.t === 'queue') entry.waiting = msg.waiting;
      else if (msg.t === 'match' && !msg.match.ended) entry.waiting = false;
      send(msg);
    });
    // Who this player is kept apart from, for matchmaking (from the database)
    const connected = Promise.all([presence.connect(me), app.ctx.safety.refresh(me.id)]);

    let closed = false;
    socket.on('close', async () => {
      closed = true;
      unwatch(conn).catch((err) => app.log.error(err));
      entry.sockets.delete(socket);
      if (entry.sockets.size === 0 && local.get(me.id) === entry) local.delete(me.id);
      try {
        const stop = await stopListening;
        await stop();
        await connected;
        if (await presence.disconnect(me.id)) scheduleLeave(me.id);
      } catch (err) {
        app.log.error(err);
      }
    });

    // A simple flood guard per connection
    let windowStart = Date.now();
    let count = 0;
    socket.on('message', async (raw) => {
      const now = Date.now();
      if (now - windowStart > 10_000) {
        windowStart = now;
        count = 0;
      }
      if (++count > MAX_MESSAGES_PER_10S) return socket.close(4429, 'Too many messages');

      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send({ t: 'error', message: 'Invalid message.' });
      }
      if (!msg || typeof msg !== 'object') return send({ t: 'error', message: 'Invalid message.' });
      try {
        const reply = await handle(me, msg, conn);
        if (reply?.t) send(reply);
      } catch (err) {
        if (err instanceof InviteError || err instanceof MatchError) {
          const { template, vars } = /** @type {any} */ (err);
          send({ t: 'error', message: err.message, template, vars, re: msg.t });
        } else {
          app.log.error(err);
          send({ t: 'error', message: 'Something went wrong on our side. Try again.', re: msg.t });
        }
      }
    });

    try {
      await Promise.all([stopListening, connected]);
      if (closed) return;
      const [match, pending, waiting] = await Promise.all([
        matches.current(me.id),
        invites.incoming(me.id),
        matchmaking.isWaiting(me.id),
      ]);
      entry.waiting = waiting;
      send({ t: 'hello', me, match, invites: pending, waiting });
    } catch (err) {
      app.log.error(err);
      socket.close(1011, 'Server error');
    }
  });
}
