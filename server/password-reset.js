// Resetting a forgotten password by email. A random token goes out in a
// link; Redis keeps only its hash for an hour, with the account and a
// fingerprint of the password it was issued for:
//
//   pwreset:<token hash>   { id, stamp }
//
// A token works once, and not at all after the password changes (the
// stamp no longer matches), so an old email in someone's inbox is useless.
// Recovery codes (routes/account.js) remain the other way back in.

import { hashToken, newToken } from './security.js';
import { translate } from '../js/i18n.js';

export const RESET_TTL = 3600; // seconds

const key = (token) => `pwreset:${hashToken(token)}`;
// A fingerprint of the stored password hash: it changes with every password
const stampOf = (passwordHash) => hashToken(passwordHash).slice(0, 16);

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export function createPasswordReset({ redis, mailer, users }) {
  const valid = (token) => typeof token === 'string' && token.length >= 40 && token.length <= 60;

  return {
    // Emails a reset link to `user` (a confirmed account, with passwordHash)
    async send(user, siteUrl, lang = 'en') {
      const token = newToken();
      const data = { id: user.id, stamp: stampOf(user.passwordHash) };
      await redis.set(key(token), JSON.stringify(data), 'EX', RESET_TTL);
      const link = `${siteUrl}/?reset=${encodeURIComponent(token)}`;
      const tr = (text, vars) => translate(lang, text, vars);
      const hi = tr('Hi {name},', { name: user.username });
      const why = tr('Someone asked to reset the password of your account. To choose a new one:');
      const expiry = tr(
        'The link works for 1 hour. If you didn’t ask for this, ignore this email: your password stays the same.',
      );
      await mailer.send({
        to: user.email,
        subject: tr('Reset your Pencil Tic-Tac-Toe password'),
        text: [hi, '', why, '', link, '', expiry].join('\n'),
        html: `<p>${escapeHtml(hi)}</p>
<p>${escapeHtml(why)}</p>
<p><a href="${escapeHtml(link)}">${escapeHtml(tr('Choose a new password'))}</a></p>
<p>${escapeHtml(expiry)}</p>`,
      });
    },

    // The account a token resets, or null (unknown, used, expired, or the
    // password changed since). Doesn't use the token up.
    async check(token) {
      if (!valid(token)) return null;
      const raw = await redis.get(key(token));
      if (!raw) return null;
      const { id, stamp } = JSON.parse(raw);
      const current = await users.passwordHash(id);
      return current && stampOf(current) === stamp ? id : null;
    },

    // Uses the token up; true if it was still there
    async consume(token) {
      return valid(token) && (await redis.del(key(token))) === 1;
    },
  };
}
