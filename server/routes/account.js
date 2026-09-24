// Accounts: sign up, log in and out, read and edit your profile, change password.
//
//   POST   /api/account      create an account and log in
//   POST   /api/session      log in
//   DELETE /api/session      log out
//   GET    /api/me           your profile
//   PATCH  /api/me           change any profile fields
//   PUT    /api/me/password  change password (logs out your other devices)
//   POST   /api/me/recovery-code  a new recovery code: { password } -> { recoveryCode }
//   POST   /api/password-reset    forgotten password: { username, recoveryCode,
//                                  newPassword } -> logs in, { user, recoveryCode }
//   GET    /api/me/export    everything stored about you, as a JSON download
//   DELETE /api/me           delete your account: { password }
//   POST   /api/me/email/resend   send the confirmation email again
//   POST   /api/email/verify      confirm an address: { token } from the emailed link
//   GET    /api/test/outbox       browser tests only (MAIL_OUTBOX=on): ?to=address
//
// Players must confirm their email address to play online. A new address
// (at sign-up, or changed in the profile) gets a confirmation email.
//
// A recovery code is shown once: at sign-up, after a reset (the old one is
// used up), or when the player asks for a new one.

import { passwordError, validateProfile, validateRegistration } from '../../js/validation.js';
import {
  burnPasswordCheck,
  hashPassword,
  hashRecoveryCode,
  needsRehash,
  newRecoveryCode,
  sameHash,
  verifyPassword,
} from '../security.js';
import { EmailTakenError, UsernameTakenError } from '../users.js';
import { MatchError } from '../matches.js';
import { COOKIE, SESSION_TTL } from '../sessions.js';

const TAKEN = { username: 'That username is taken. Try another.' };
const EMAIL_TAKEN = { email: 'That email is already used by another account.' };

// Errors from a unique username or email, as a 409 with the field marked
function taken(reply, err) {
  if (err instanceof UsernameTakenError) {
    return reply.code(409).send({ error: TAKEN.username, fields: TAKEN });
  }
  if (err instanceof EmailTakenError) {
    return reply.code(409).send({ error: EMAIL_TAKEN.email, fields: EMAIL_TAKEN });
  }
  throw err;
}

export default async function accountRoutes(app) {
  const { users, sessions, rateLimit, presence, config, stats, matches, matchmaking } = app.ctx;
  const { emailVerification, mailer } = app.ctx;

  // Where links in emails point: SITE_URL (always set in production), or
  // this server in development and tests
  const siteUrl = (req) => config.siteUrl || `${req.protocol}://${req.host}`;

  // A failed email doesn't undo the sign-up or profile change: the player
  // can ask for it again
  async function sendConfirmation(req, user) {
    try {
      await emailVerification.send(user, siteUrl(req), req.lang);
      return true;
    } catch (err) {
      req.log.error({ err }, 'Could not send the confirmation email');
      return false;
    }
  }

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
      const recoveryCode = newRecoveryCode();
      const user = await users.create(
        value,
        await hashPassword(value.password),
        hashRecoveryCode(recoveryCode),
      );
      await startSession(reply, user.id);
      const emailSent = await sendConfirmation(req, user);
      return reply.code(201).send({ user, recoveryCode, emailSent });
    } catch (err) {
      return taken(reply, err);
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
      const before = await users.publicProfile(req.userId);
      const updated = await users.update(req.userId, value);
      if (!updated) return reply.code(401).send({ error: 'Please log in.' });
      const { user, emailChanged } = updated;
      await presence.updateProfile(user, before?.country);
      const emailSent = emailChanged ? await sendConfirmation(req, user) : false;
      return { user, emailSent };
    } catch (err) {
      return taken(reply, err);
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

  // Checks the password of the signed-in player, for risky changes
  async function confirmPassword(req, reply) {
    const password = req.body?.password;
    const ok =
      typeof password === 'string' &&
      password.length <= 256 &&
      (await verifyPassword(password, await users.passwordHash(req.userId)));
    if (!ok) {
      reply.code(400).send({
        error: 'Check the highlighted fields.',
        fields: { password: 'That is not your password.' },
      });
    }
    return ok;
  }

  app.post('/api/me/recovery-code', { preHandler: app.requireUser }, async (req, reply) => {
    if (!(await limit(reply, `password:${req.userId}`, 10, 900))) return;
    if (!(await confirmPassword(req, reply))) return;
    const recoveryCode = newRecoveryCode();
    await users.setRecoveryHash(req.userId, hashRecoveryCode(recoveryCode));
    return { recoveryCode };
  });

  app.post('/api/password-reset', async (req, reply) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const code = req.body?.recoveryCode;
    const newPassword = req.body?.newPassword;
    if (!(await limit(reply, `reset-ip:${req.ip}`, 20, 900))) return;
    if (!(await limit(reply, `reset-user:${username.toLowerCase()}`, 5, 900))) return;

    const found = username ? await users.findRecovery(username) : null;
    const valid =
      found?.recovery_hash &&
      typeof code === 'string' &&
      code.length <= 64 &&
      sameHash(hashRecoveryCode(code), found.recovery_hash);
    if (!valid) {
      return reply.code(400).send({
        error: 'That username and recovery code don’t match.',
        fields: { recoveryCode: 'Check the code, or the username.' },
      });
    }
    const problem = passwordError(newPassword, found.username);
    if (problem) {
      return reply
        .code(400)
        .send({ error: 'Check the highlighted fields.', fields: { newPassword: problem } });
    }
    // The code is used up: a new one replaces it, and every old session ends
    const recoveryCode = newRecoveryCode();
    await users.setPasswordHash(found.id, await hashPassword(newPassword));
    await users.setRecoveryHash(found.id, hashRecoveryCode(recoveryCode));
    await sessions.destroyOthers(found.id, null);
    await startSession(reply, found.id);
    return { user: await users.profile(found.id), recoveryCode };
  });

  app.get('/api/me/export', { preHandler: app.requireUser }, async (req, reply) => {
    if (!(await limit(reply, `export:${req.userId}`, 10, 3600))) return;
    const [profile, summary, opponents] = await Promise.all([
      users.profile(req.userId),
      stats.summary(req.userId),
      stats.opponents(req.userId, 1000),
    ]);
    const games = [];
    let cursor;
    do {
      const page = await stats.history(req.userId, { cursor, limit: 50 });
      games.push(...page.games);
      cursor = page.next;
    } while (cursor && games.length < 100_000);
    const data = {
      exportedAt: new Date().toISOString(),
      profile,
      hasRecoveryCode: !!(await users.findRecovery(profile.username))?.recovery_hash,
      stats: summary,
      opponents: opponents.top,
      games,
    };
    return reply
      .header('Content-Disposition', `attachment; filename="tic-tac-toe-${profile.username}.json"`)
      .type('application/json')
      .send(JSON.stringify(data, null, 2));
  });

  app.post('/api/me/email/resend', { preHandler: app.requireUser }, async (req, reply) => {
    if (!(await limit(reply, `verify-mail:${req.userId}`, 5, 3600))) return;
    const user = await users.profile(req.userId);
    if (!user) return reply.code(401).send({ error: 'Please log in.' });
    if (!user.email) return reply.code(400).send({ error: 'Add your email address first.' });
    if (user.emailVerified)
      return reply.code(400).send({ error: 'Your email is already confirmed.' });
    if (!(await sendConfirmation(req, user))) {
      return reply.code(502).send({ error: "We couldn't send the email. Try again later." });
    }
    return reply.code(204).send();
  });

  // No session needed: the link may be opened on another device
  app.post('/api/email/verify', async (req, reply) => {
    if (!(await limit(reply, `verify-ip:${req.ip}`, 30, 900))) return;
    const id = await emailVerification.confirm(req.body?.token);
    if (!id) {
      return reply
        .code(400)
        .send({ error: 'That confirmation link has expired or was already used.' });
    }
    return { confirmed: true, you: id === req.userId };
  });

  if (config.mailOutbox) {
    app.get('/api/test/outbox', async (req) => ({
      emails: await mailer.outbox(String(req.query.to || '')),
    }));
  }

  app.delete('/api/me', { preHandler: app.requireUser }, async (req, reply) => {
    if (!(await limit(reply, `password:${req.userId}`, 10, 900))) return;
    if (!(await confirmPassword(req, reply))) return;
    const id = req.userId;
    // Out of any game or queue first, as if they had left
    await matchmaking.leave(id);
    const match = await matches.current(id);
    try {
      if (match && !match.ended) await matches.leave(match.id, id);
    } catch (err) {
      if (!(err instanceof MatchError)) throw err; // it ended meanwhile: fine
    }
    await users.remove(id);
    await sessions.destroyOthers(id, null);
    await presence.forget(id);
    reply.clearCookie(COOKIE, { path: '/' });
    return reply.code(204).send();
  });
}
