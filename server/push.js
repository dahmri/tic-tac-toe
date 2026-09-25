// Notifications through web push, for when the game isn't on screen: an
// invitation, or your turn in an online match. Players turn them on per
// browser (push_subscriptions, migration 015).
//
// A player counts as looking at the game while one of their pages is
// visible: pages say so over the live connection, and Redis keeps
// `visible:<id>` for a little longer than they repeat it. No notification
// is sent then; the page shows the news itself.

import webpush from 'web-push';
import { isLang, translate } from '../js/i18n.js';

export const VISIBLE_TTL = 70; // seconds; pages repeat it every 25 s
const TITLE = 'Pencil Tic-Tac-Toe';

const visibleKey = (id) => `visible:${id}`;

// sender(subscription, payload, options) -> Promise: web-push by default,
// a fake in tests
/** @param {{ db: any, redis: any, config: any, log?: any, sender?: any }} options */
export function createPush({ db, redis, config, log = console, sender = null }) {
  const { publicKey, privateKey, subject } = config.vapid;
  const enabled = !!(publicKey && privateKey) || !!sender;
  const send =
    sender ??
    ((subscription, payload) =>
      webpush.sendNotification(subscription, payload, {
        vapidDetails: { subject, publicKey, privateKey },
        TTL: 600, // an invitation or a turn is stale after ten minutes
      }));

  async function notify(userId, { text, vars, tag, url = '/' }) {
    if (!enabled || (await redis.exists(visibleKey(userId)))) return 0;
    const { rows } = await db.query(
      'SELECT endpoint, p256dh, auth, lang FROM push_subscriptions WHERE user_id = $1',
      [userId],
    );
    let sent = 0;
    await Promise.all(
      rows.map(async (r) => {
        const payload = JSON.stringify({
          title: TITLE,
          body: translate(r.lang, text, vars),
          tag,
          url,
        });
        try {
          await send({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload);
          sent++;
        } catch (err) {
          // Gone: the browser unsubscribed, or the player cleared its data
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [r.endpoint]);
          } else {
            log.warn({ err: err?.message, status: err?.statusCode }, 'Push failed');
          }
        }
      }),
    );
    return sent;
  }

  return {
    enabled,
    publicKey: enabled ? publicKey || null : null,

    // A subscription from PushManager.subscribe(), as JSON
    async subscribe(userId, sub, lang) {
      const endpoint = sub?.endpoint;
      const { p256dh, auth } = sub?.keys || {};
      if (
        typeof endpoint !== 'string' ||
        !/^https:\/\//.test(endpoint) ||
        endpoint.length > 1000 ||
        typeof p256dh !== 'string' ||
        p256dh.length > 200 ||
        typeof auth !== 'string' ||
        auth.length > 100
      ) {
        return false;
      }
      // A browser someone else used on this device before: it's this player's now
      await db.query(
        `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, lang)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, p256dh = $3, auth = $4, lang = $5`,
        [endpoint, userId, p256dh, auth, isLang(lang) ? lang : 'en'],
      );
      return true;
    },

    async unsubscribe(userId, endpoint) {
      await db.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [
        userId,
        String(endpoint ?? ''),
      ]);
    },

    // Whether this player has notifications on in the browser at `endpoint`
    async has(userId, endpoint) {
      const { rows } = await db.query(
        'SELECT 1 FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
        [userId, String(endpoint ?? '')],
      );
      return rows.length > 0;
    },

    // A page of this player is on screen (true), or went to the background
    async seen(userId, visible) {
      if (visible) await redis.set(visibleKey(userId), '1', 'EX', VISIBLE_TTL);
      else await redis.del(visibleKey(userId));
    },

    invited: (userId, from) =>
      notify(userId, {
        text: '{name} invites you to play.',
        vars: { name: from.username },
        tag: 'invite',
      }),

    yourTurn: (userId, opponent) =>
      notify(userId, {
        text: "It's your turn against {name}.",
        vars: { name: opponent.username },
        tag: 'turn',
      }),
  };
}
