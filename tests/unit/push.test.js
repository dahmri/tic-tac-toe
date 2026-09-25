import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { loadConfig } from '../../server/config.js';

test('web push requests are encrypted and signed with the VAPID keys', () => {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  const config = loadConfig({
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
    SITE_URL: 'https://tictactoe.example.com',
  });
  assert.equal(config.vapid.subject, 'https://tictactoe.example.com');
  assert.equal(loadConfig({}).vapid.subject, 'mailto:admin@localhost', 'http or none: a mailto');

  // A browser's subscription keys
  const browser = createECDH('prime256v1');
  browser.generateKeys();
  const subscription = {
    endpoint: 'https://push.example.com/send/abc',
    keys: {
      p256dh: browser.getPublicKey('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
  const req = webpush.generateRequestDetails(subscription, '{"body":"hi"}', {
    vapidDetails: config.vapid,
    TTL: 600,
  });
  assert.equal(req.endpoint, subscription.endpoint);
  assert.equal(req.headers['Content-Encoding'], 'aes128gcm');
  assert.match(req.headers.Authorization, new RegExp(`^vapid t=.+, k=${publicKey}$`));
  assert.ok(req.body.length > 14, 'the payload is encrypted, not sent as is');
  assert.equal(req.body.includes(Buffer.from('"hi"')), false);
});
