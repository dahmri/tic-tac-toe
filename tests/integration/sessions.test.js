import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, player, setup } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';

test('list where you are logged in, and log other devices out', async () => {
  const ann = await player(t.app); // signed up: session one
  const phone = client(t.app);
  await phone.request(
    'POST',
    '/api/session',
    { username: ann.user.username, password: 'a good long password' },
    { 'user-agent': FIREFOX },
  );
  const laptop = client(t.app);
  await laptop.post('/api/session', {
    username: ann.user.username,
    password: 'a good long password',
  });

  const { sessions } = (await ann.get('/api/me/sessions')).body;
  assert.equal(sessions.length, 3);
  assert.equal(sessions[0].current, true, 'this one first');
  assert.ok(sessions.some((s) => s.device === 'Firefox on Windows'));
  assert.ok(sessions.every((s) => /^[\w-]{12}$/.test(s.id) && s.created && s.seen));
  assert.equal(JSON.stringify(sessions).includes(ann.cookie.slice(4)), false, 'never the token');

  const firefox = sessions.find((s) => s.device === 'Firefox on Windows');
  assert.equal((await ann.request('DELETE', `/api/me/sessions/${firefox.id}`)).status, 204);
  assert.equal((await phone.get('/api/me')).status, 401);
  assert.equal((await laptop.get('/api/me')).status, 200);

  assert.equal((await ann.request('DELETE', '/api/me/sessions')).status, 204);
  assert.equal((await laptop.get('/api/me')).status, 401);
  assert.equal((await ann.get('/api/me')).status, 200, 'still logged in here');
  assert.equal((await ann.get('/api/me/sessions')).body.sessions.length, 1);
});
