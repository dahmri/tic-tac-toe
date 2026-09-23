// Accounts: sign up, log in and out, read and edit your profile, change password.
//
//   POST   /api/account      create an account and log in
//   POST   /api/session      log in
//   DELETE /api/session      log out
//   GET    /api/me           your profile
//   PATCH  /api/me           change any profile fields
//   PUT    /api/me/password  change password (logs out your other devices)

import { passwordError, validateProfile, validateRegistration } from '../../js/validation.js';
import { burnPasswordCheck, hashPassword, needsRehash, verifyPassword } from '../security.js';
import { UsernameTakenError } from '../users.js';
import { COOKIE, SESSION_TTL } from '../sessions.js';

const TAKEN = { username: 'That username is taken. Try another.' };

export default async function accountRoutes(app) {
  const { users, sessions, rateLimit, config } = app.ctx;

  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: SESSION_TTL,
  };

  async function startSession(reply, userId) {
    reply.setCookie(COOKIE, await sessions.create(userId), cookieOptions);
  }

  async function limit(reply, key, max, windowSeconds) {
    const r = await rateLimit(key, max, windowSeconds);
    if (r.ok) return true;
    reply
      .code(429)
      .header('Retry-After', String(r.retryAfter))
      .send({ error: 'Too many attempts. Wait a few minutes and try again.' });
    return false;
  }

  app.post('/api/account', async (req, reply) => {
    if (!(await limit(reply, `signup:${req.ip}`, 10, 3600))) return;
    const { ok, value, errors } = validateRegistration(req.body);
    if (!ok)
      return reply.code(400).send({ error: 'Check the highlighted fields.', fields: errors });
    try {
      const user = await users.create(value, await hashPassword(value.password));
      await startSession(reply, user.id);
      return reply.code(201).send({ user });
    } catch (err) {
      if (err instanceof UsernameTakenError) {
        return reply.code(409).send({ error: TAKEN.username, fields: TAKEN });
      }
      throw err;
    }
  });

  app.post('/api/session', async (req, reply) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    // Per IP, and per account so a botnet can't spread guesses on one player
    if (!(await limit(reply, `login-ip:${req.ip}`, 30, 900))) return;
    if (!(await limit(reply, `login-user:${username.toLowerCase()}`, 10, 900))) return;

    const found = username && password.length <= 256 ? await users.findLogin(username) : null;
    const valid = found
      ? await verifyPassword(password, found.password_hash)
      : (await burnPasswordCheck(password), false);
    if (!valid) return reply.code(401).send({ error: 'Wrong username or password.' });

    if (needsRehash(found.password_hash)) {
      await users.setPasswordHash(found.id, await hashPassword(password));
    }
    await startSession(reply, found.id);
    return { user: await users.profile(found.id) };
  });

  app.delete('/api/session', async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token && req.userId) await sessions.destroy(token, req.userId);
    reply.clearCookie(COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/me', { preHandler: app.requireUser }, async (req, reply) => {
    const user = await users.profile(req.userId);
    if (!user) return reply.code(401).send({ error: 'Please log in.' });
    return { user };
  });

  app.patch('/api/me', { preHandler: app.requireUser }, async (req, reply) => {
    const { ok, value, errors } = validateProfile(req.body);
    if (!ok)
      return reply.code(400).send({ error: 'Check the highlighted fields.', fields: errors });
    try {
      const user = await users.update(req.userId, value);
      if (!user) return reply.code(401).send({ error: 'Please log in.' });
      return { user };
    } catch (err) {
      if (err instanceof UsernameTakenError) {
        return reply.code(409).send({ error: TAKEN.username, fields: TAKEN });
      }
      throw err;
    }
  });

  app.put('/api/me/password', { preHandler: app.requireUser }, async (req, reply) => {
    if (!(await limit(reply, `password:${req.userId}`, 10, 900))) return;
    const { currentPassword, newPassword } = req.body || {};
    const stored = await users.passwordHash(req.userId);
    if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, stored))) {
      return reply.code(400).send({
        error: 'Check the highlighted fields.',
        fields: { currentPassword: 'That is not your current password.' },
      });
    }
    const { username } = await users.profile(req.userId);
    const problem = passwordError(newPassword, username);
    if (problem) {
      return reply
        .code(400)
        .send({ error: 'Check the highlighted fields.', fields: { newPassword: problem } });
    }
    await users.setPasswordHash(req.userId, await hashPassword(newPassword));
    await sessions.destroyOthers(req.userId, req.cookies[COOKIE]);
    return reply.code(204).send();
  });
}
