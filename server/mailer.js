// Sends email. Three ways, chosen by the settings (see .env.example):
//
//   SMTP_HOST set     through that SMTP server (any provider)
//   MAIL_OUTBOX=on    kept in Redis for the browser tests to read back
//                     (GET /api/test/outbox); never use this in production
//   neither           written to the server log, so development works
//                     without a mail server

import nodemailer from 'nodemailer';

const OUTBOX_KEEP = 10; // emails kept per address
const OUTBOX_TTL = 3600; // seconds

const outboxKey = (to) => `mail:outbox:${to.toLowerCase()}`;

export function createMailer({ config, redis, log }) {
  const transport = config.smtp.host
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      })
    : null;

  if (!transport && !config.mailOutbox) {
    log.warn('No SMTP_HOST: emails are written to the log instead of being sent');
  }

  return {
    mode: transport ? 'smtp' : config.mailOutbox ? 'outbox' : 'log',

    // mail: { to, subject, text, html }
    async send(mail) {
      if (transport) {
        await transport.sendMail({ from: config.mailFrom, ...mail });
      } else if (config.mailOutbox) {
        await redis
          .multi()
          .lpush(outboxKey(mail.to), JSON.stringify({ ...mail, sentAt: Date.now() }))
          .ltrim(outboxKey(mail.to), 0, OUTBOX_KEEP - 1)
          .expire(outboxKey(mail.to), OUTBOX_TTL)
          .exec();
      } else {
        log.warn({ to: mail.to, subject: mail.subject }, `Email not sent (no SMTP):\n${mail.text}`);
      }
    },

    // Test outbox only: the latest emails to one address, newest first
    async outbox(to) {
      const raw = await redis.lrange(outboxKey(to), 0, -1);
      return raw.map((r) => JSON.parse(r));
    },
  };
}
