// Invitations to play. An invitation lives for 60 seconds in Redis:
//
//   invite:<id>         hash: from, to (user ids), variant (the rules)
//   invpair:<from>:<to> stops the same invitation being sent twice at once
//   invites-in:<uid>    set of invitations waiting for a player, so they
//                       reappear after a page reload
//
// Accepting, declining and cancelling each delete the invitation first;
// only the one that actually deleted it goes on, so an invitation can't be
// both accepted and cancelled.

import { randomUUID } from 'node:crypto';
import { MatchError } from './matches.js';
import { isVariant } from '../js/rules.js';

export const INVITE_TTL = 60; // seconds

// `message` is English with the names filled in; `template` and `vars`
// let it be translated
export class InviteError extends Error {
  constructor(template, vars) {
    super(vars ? template.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m) : template);
    this.template = template;
    this.vars = vars;
  }
}

export function createInvites(redis, { bus, presence, matches, safety }) {
  // Removes an invitation and returns it, or null if it was already gone
  async function take(id) {
    if (typeof id !== 'string' || id.length > 64) return null;
    const [[, data], [, deleted]] = await redis
      .multi()
      .hgetall(`invite:${id}`)
      .del(`invite:${id}`)
      .exec();
    if (!deleted || !data.from) return null;
    const invite = {
      id,
      from: Number(data.from),
      to: Number(data.to),
      variant: data.variant || 'classic',
    };
    await redis
      .multi()
      .del(`invpair:${invite.from}:${invite.to}`)
      .srem(`invites-in:${invite.to}`, id)
      .exec();
    return invite;
  }

  // A player's public profile with their latest rating (the connection's
  // copy is from when it opened)
  const fresh = async (user) => (await presence.profile(user.id)) || user;

  return {
    async send(me, toId, variant = 'classic') {
      if (!isVariant(variant)) throw new InviteError('Unknown rules.');
      const from = await fresh(me);
      if (!Number.isInteger(toId) || toId === from.id) {
        throw new InviteError('Choose another player to invite.');
      }
      const to = await presence.profile(toId);
      if (!to || !(await presence.isOnline(toId))) {
        throw new InviteError('That player is no longer online.');
      }
      // Blocked either way: said as if they'd just gone, so a block stays private
      if (await safety?.apart(from.id, toId)) {
        throw new InviteError("That player isn't available.");
      }
      if (await matches.isPlaying(from.id)) throw new InviteError('Finish your game first.');
      if (await matches.isPlaying(toId)) {
        throw new InviteError('{name} is already playing.', { name: to.username });
      }
      const first = await redis.set(`invpair:${from.id}:${toId}`, '1', 'EX', INVITE_TTL, 'NX');
      if (!first) throw new InviteError('You already invited {name}.', { name: to.username });

      const id = randomUUID();
      await redis
        .multi()
        .hset(`invite:${id}`, 'from', from.id, 'to', toId, 'variant', variant)
        .expire(`invite:${id}`, INVITE_TTL)
        .sadd(`invites-in:${toId}`, id)
        .expire(`invites-in:${toId}`, INVITE_TTL)
        .exec();

      // expiresIn (ms) rather than a time: players' clocks may be wrong
      const expiresIn = INVITE_TTL * 1000;
      await bus.send(toId, { t: 'invite', invite: { id, from, variant, expiresIn } });
      await bus.send(from.id, { t: 'invite-sent', invite: { id, to, variant, expiresIn } });
    },

    // Invitations still waiting for this player, e.g. after a reload
    async incoming(userId) {
      const ids = await redis.smembers(`invites-in:${userId}`);
      const invites = [];
      for (const id of ids) {
        const [[, data], [, expiresIn]] = await redis
          .multi()
          .hgetall(`invite:${id}`)
          .pttl(`invite:${id}`)
          .exec();
        if (!data.from) {
          await redis.srem(`invites-in:${userId}`, id);
          continue;
        }
        const from = await presence.profile(Number(data.from));
        if (from) invites.push({ id, from, variant: data.variant || 'classic', expiresIn });
      }
      return invites;
    },

    async accept(user, id) {
      const invite = await take(id);
      if (!invite || invite.to !== user.id) throw new InviteError('That invitation has expired.');
      const from = await presence.profile(invite.from);
      if (!from || !(await presence.isOnline(invite.from))) {
        throw new InviteError('That player is no longer online.');
      }
      try {
        const match = await matches.start(from, await fresh(user), invite.variant);
        await bus.send(user.id, { t: 'invite-gone', id }); // for the player's other tabs
        return match;
      } catch (err) {
        if (err instanceof MatchError) {
          await bus.send(invite.from, { t: 'invite-declined', id, by: user.username });
          throw new InviteError('{name} is already playing.', { name: from.username });
        }
        throw err;
      }
    },

    async decline(user, id) {
      const invite = await take(id);
      if (!invite || invite.to !== user.id) return;
      await bus.send(invite.from, { t: 'invite-declined', id, by: user.username });
      await bus.send(user.id, { t: 'invite-gone', id });
    },

    async cancel(user, id) {
      const invite = await take(id);
      if (!invite || invite.from !== user.id) return;
      await bus.send(invite.to, { t: 'invite-gone', id });
      await bus.send(user.id, { t: 'invite-gone', id });
    },
  };
}
