import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../server/config.js';

const KEY = Buffer.alloc(32, 1).toString('base64');
const prod = { NODE_ENV: 'production', DATA_ENCRYPTION_KEY: KEY };

test('production needs SITE_URL, so email links never follow a forged Host', () => {
  assert.throws(() => loadConfig(prod), /SITE_URL/);
  const c = loadConfig({ ...prod, SITE_URL: 'https://ttt.example.com/' });
  assert.equal(c.siteUrl, 'https://ttt.example.com');
});

test('SMTP settings, and the test outbox refused next to a real mail server', () => {
  const c = loadConfig({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', SMTP_USER: 'u' });
  assert.deepEqual(
    { host: c.smtp.host, port: c.smtp.port, secure: c.smtp.secure, user: c.smtp.user },
    { host: 'smtp.example.com', port: 465, secure: true, user: 'u' },
  );
  assert.equal(loadConfig({}).smtp.secure, false, 'port 587 uses STARTTLS');
  assert.throws(
    () => loadConfig({ SMTP_HOST: 'smtp.example.com', MAIL_OUTBOX: 'on' }),
    /MAIL_OUTBOX/,
  );
});
