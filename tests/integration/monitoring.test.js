import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { client, setup } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

test('health answers with the running version', async () => {
  const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  const res = await client(t.app).get('/api/health');
  assert.deepEqual(res.body, { ok: true, version });
});

test('errors from browsers are accepted and never answered with detail', async () => {
  const res = await client(t.app).post('/api/client-errors', {
    kind: 'error',
    message: 'x'.repeat(1000),
    stack: 'at main.js:1',
    page: '/',
    lang: 'fr',
  });
  assert.equal(res.status, 204);
  assert.equal(res.body, null);
  const empty = await client(t.app).post('/api/client-errors', {});
  assert.equal(empty.status, 204);
});
