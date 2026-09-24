import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, player, setup } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

async function resetToken(email) {
  const [mail] = await t.app.ctx.mailer.outbox(email);
  assert.ok(mail, `no email to ${email}`);
  assert.match(mail.subject, /Reset your/);
  return new URL(/https?:\/\/\S+/.exec(mail.text)[0]).searchParams.get('reset');
}
const ask = (login) => client(t.app).post('/api/password-reset/email', { login });

test('the same answer whether or not an account matches, and mail only to confirmed addresses', async () => {
  const unconfirmed = await player(t.app, { confirmed: false });
  assert.equal((await ask('nobody_at_all')).status, 204);
  assert.equal((await ask('nobody@example.com')).status, 204);
  assert.equal((await ask(unconfirmed.user.username)).status, 204);
  const mails = await t.app.ctx.mailer.outbox(unconfirmed.details.email);
  assert.ok(
    mails.every((m) => !/Reset your/.test(m.subject)),
    'unconfirmed: no reset email',
  );
  assert.equal((await ask('')).status, 400);
});

test('a link by username or by email resets the password once, and logs out elsewhere', async () => {
  const ann = await player(t.app);
  assert.equal((await ask(ann.user.username.toUpperCase())).status, 204);
  const byName = await resetToken(ann.details.email);
  assert.equal((await ask(ann.details.email)).status, 204);
  const byEmail = await resetToken(ann.details.email);
  assert.notEqual(byName, byEmail);

  const c = client(t.app);
  assert.deepEqual((await c.get(`/api/password-reset/token?token=${byEmail}`)).body, {
    valid: true,
  });
  const weak = await c.post('/api/password-reset/token', { token: byEmail, newPassword: 'short' });
  assert.equal(weak.status, 400);
  assert.ok(weak.body.fields.newPassword);

  const ok = await c.post('/api/password-reset/token', {
    token: byEmail,
    newPassword: 'a fresh long password',
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.id, ann.user.id);
  assert.equal((await c.get('/api/me')).status, 200, 'logged in here');
  assert.equal((await ann.get('/api/me')).status, 401, 'logged out elsewhere');

  const again = await c.post('/api/password-reset/token', {
    token: byEmail,
    newPassword: 'another long password',
  });
  assert.equal(again.status, 400, 'used up');
  // The other link was for the old password: it no longer works either
  assert.deepEqual((await c.get(`/api/password-reset/token?token=${byName}`)).body, {
    valid: false,
  });
});
