import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, live, newPlayer, player, setup } from './helpers.js';
import { openPII, sealPII } from '../../server/security.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

// The token in the latest confirmation email to `to`
async function linkToken(to) {
  const [mail] = await t.app.ctx.mailer.outbox(to);
  assert.ok(mail, `no email to ${to}`);
  return new URL(/https?:\/\/\S+/.exec(mail.text)[0]).searchParams.get('verify');
}

test('sign-up needs an email, and sends a link that confirms it once', async () => {
  const missing = await client(t.app).post('/api/account', newPlayer({ email: '' }));
  assert.equal(missing.status, 400);
  assert.equal(missing.body.fields.email, 'Enter your email address.');

  const details = newPlayer({ email: 'Mixed.Case@Example.com' });
  const c = client(t.app);
  const res = await c.post('/api/account', details);
  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, 'mixed.case@example.com');
  assert.equal(res.body.user.emailVerified, false);
  assert.equal(res.body.emailSent, true);

  const [mail] = await t.app.ctx.mailer.outbox('mixed.case@example.com');
  assert.match(mail.subject, /Confirm your email/);
  assert.ok(mail.html.includes(details.username));

  // Stored sealed, like the other personal data
  const { rows } = await t.db.query('SELECT * FROM users WHERE id = $1', [res.body.user.id]);
  assert.equal(JSON.stringify(rows[0]).includes('mixed.case'), false);

  const token = await linkToken('mixed.case@example.com');
  const ok = await c.post('/api/email/verify', { token });
  assert.deepEqual(ok.body, { confirmed: true, you: true });
  assert.equal((await c.get('/api/me')).body.user.emailVerified, true);
  assert.equal((await c.post('/api/email/verify', { token })).status, 400, 'works once');
  assert.equal((await c.post('/api/email/verify', { token: 'x'.repeat(43) })).status, 400);
});

test('one account per email address', async () => {
  await player(t.app, { email: 'shared@example.com' });
  const again = await client(t.app).post(
    '/api/account',
    newPlayer({ email: 'SHARED@example.com' }),
  );
  assert.equal(again.status, 409);
  assert.ok(again.body.fields.email);
});

test('unconfirmed players can play offline modes but not online', async () => {
  const ann = await player(t.app, { confirmed: false });
  assert.equal((await ann.get('/api/players/online')).status, 403);
  await assert.rejects(live(t.app, ann));
  const cpu = await ann.post('/api/games/cpu', {
    difficulty: 'casual',
    starter: 'X',
    moves: [0, 3, 1, 4, 2],
  });
  assert.equal(cpu.status, 201, 'games vs the computer still count');

  const token = await linkToken(ann.details.email);
  await client(t.app).post('/api/email/verify', { token }); // e.g. on their phone
  assert.equal((await ann.get('/api/players/online')).status, 200);
  const socket = await live(t.app, ann);
  await socket.close();
});

test('resend, and a changed address must be confirmed again', async () => {
  const ann = await player(t.app, { confirmed: false });
  const first = await linkToken(ann.details.email);
  assert.equal((await ann.post('/api/me/email/resend')).status, 204);
  const second = await linkToken(ann.details.email);
  assert.notEqual(first, second);

  const res = await ann.patch('/api/me', { email: 'new.address@example.com' });
  assert.equal(res.body.emailSent, true);
  assert.equal(res.body.user.emailVerified, false);
  // A link to the old address no longer confirms anything
  assert.equal((await ann.post('/api/email/verify', { token: second })).status, 400);
  const token = await linkToken('new.address@example.com');
  assert.equal((await ann.post('/api/email/verify', { token })).status, 200);
  assert.equal((await ann.post('/api/me/email/resend')).status, 400, 'already confirmed');

  // Saving the same address again doesn't unconfirm it
  const same = await ann.patch('/api/me', { email: 'new.address@example.com' });
  assert.equal(same.body.user.emailVerified, true);
  assert.equal(same.body.emailSent, false);
});

test('accounts from before emails can add one', async () => {
  // Turn a new account into an old one: no address sealed, none hashed
  const old = await player(t.app, { confirmed: false });
  const { rows } = await t.db.query('SELECT pii FROM users WHERE id = $1', [old.user.id]);
  const pii = openPII(rows[0].pii, t.config.dataKey);
  delete pii.email;
  await t.db.query('UPDATE users SET email_hash = NULL, pii = $2 WHERE id = $1', [
    old.user.id,
    sealPII(pii, t.config.dataKey),
  ]);
  assert.equal((await old.get('/api/me')).body.user.email, null);
  assert.equal((await old.post('/api/me/email/resend')).status, 400);
  const res = await old.patch('/api/me', { email: 'late@example.com' });
  assert.equal(res.status, 200);
  assert.equal(res.body.emailSent, true);
});
