// Confirming email addresses. A random token goes out in a link; Redis
// keeps only its hash, with the account and the address it was sent to,
// for 24 hours:
//
//   verify:<token hash>   { id, emailHash }
//
// Opening the link runs a script that posts the token back (POST
// /api/email/verify), so mail scanners that fetch links don't confirm
// anything by themselves. A token works once. Changing the address since
// the email was sent makes it worthless (users.confirmEmail checks).

import { hashToken, newToken } from './security.js';
import { translate } from '../js/i18n.js';

export const VERIFY_TTL = 24 * 3600; // seconds

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export function createEmailVerification({ redis, mailer, users }) {
  return {
    // Sends the confirmation email for `user`'s current address.
    // `siteUrl` is where the link points (the site's own address).
    async send(user, siteUrl, lang = 'en') {
      const token = newToken();
      const data = { id: user.id, emailHash: users.emailHash(user.email) };
      await redis.set(`verify:${hashToken(token)}`, JSON.stringify(data), 'EX', VERIFY_TTL);
      const link = `${siteUrl}/?verify=${encodeURIComponent(token)}`;
      const tr = (text, vars) => translate(lang, text, vars);
      const hi = (name) => tr('Hi {name},', { name });
      const why = tr(
        'Confirm your email address to play online, get a rating and join the leaderboard:',
      );
      const expiry = tr(
        'The link works for 24 hours. If you didn’t sign up, you can ignore this email.',
      );
      await mailer.send({
        to: user.email,
        subject: tr('Confirm your email for Pencil Tic-Tac-Toe'),
        text: [hi(user.username), '', why, '', link, '', expiry].join('\n'),
        html: `<p>${escapeHtml(hi(user.username))}</p>
<p>${escapeHtml(why)}</p>
<p><a href="${escapeHtml(link)}">${escapeHtml(tr('Confirm my email'))}</a></p>
<p>${escapeHtml(expiry)}</p>`,
      });
    },

    // Returns the confirmed account's id, or null for a bad or old link
    async confirm(token) {
      if (typeof token !== 'string' || token.length < 40 || token.length > 60) return null;
      const raw = await redis.getdel(`verify:${hashToken(token)}`);
      if (!raw) return null;
      const { id, emailHash } = JSON.parse(raw);
      return (await users.confirmEmail(id, emailHash)) ? id : null;
    },
  };
}
