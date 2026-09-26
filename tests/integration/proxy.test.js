import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

// Production runs behind nginx (and Caddy for HTTPS): the api must believe
// their X-Forwarded-* headers, or every page looks cross-site (http instead
// of https) and every player shares nginx's address for rate limits.
// app.inject() connects from 127.0.0.1, like a proxy on the same machine.
let t;
before(async () => {
  t = await setup({ RATE_LIMITS: 'on', TRUST_PROXY: 'loopback,uniquelocal' });
});
after(() => t.close());

const logout = (headers) => t.app.inject({ method: 'DELETE', url: '/api/session', headers });

test('pages served over https through the proxy are same-site', async () => {
  const page = { host: 'ttt.example.com', origin: 'https://ttt.example.com' };
  assert.equal((await logout({ ...page, 'x-forwarded-proto': 'https' })).statusCode, 204);
  // Without the proxy saying so, the request came over plain http
  assert.equal((await logout(page)).statusCode, 403);
});

test("rate limits count each player's address, from the proxy", async () => {
  const signUp = (ip) =>
    t.app.inject({
      method: 'POST',
      url: '/api/account',
      headers: { 'x-forwarded-for': ip },
      payload: {},
    });
  for (let i = 0; i < 10; i++) assert.notEqual((await signUp('203.0.113.1')).statusCode, 429);
  assert.equal((await signUp('203.0.113.1')).statusCode, 429);
  assert.notEqual((await signUp('203.0.113.2')).statusCode, 429, 'another player is not blocked');
});
