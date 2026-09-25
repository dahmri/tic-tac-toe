import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGE_TTL_MS, createChallenges, solves } from '../../server/challenge.js';

// Just enough of Redis for SET … NX
function fakeRedis() {
  const keys = new Set();
  return {
    async set(key, _v, _px, _ms, nx) {
      if (nx === 'NX' && keys.has(key)) return null;
      keys.add(key);
      return 'OK';
    },
  };
}

const solve = ({ challenge, bits }) => {
  let n = 0;
  while (!solves(challenge, String(n), bits)) n++;
  return String(n);
};

const T0 = 1_700_000_000_000;
const make = () => createChallenges({ key: 'k'.repeat(32), redis: fakeRedis(), bits: 8 });

test('a solved challenge passes once', async () => {
  const c = make();
  const p = c.issue(T0);
  const nonce = solve(p);
  assert.equal(await c.verify(p.challenge, nonce, T0 + 5000), null);
  assert.equal(await c.verify(p.challenge, nonce, T0 + 6000), 'reused');
});

test('bad answers are refused, and say why', async () => {
  const c = make();
  const p = c.issue(T0);
  const nonce = solve(p);
  assert.equal(await c.verify(undefined, nonce, T0 + 5000), 'missing');
  assert.equal(await c.verify(p.challenge, 42, T0 + 5000), 'missing');
  assert.equal(await c.verify('a.b', nonce, T0 + 5000), 'malformed');
  const [, rand, sig] = p.challenge.split('.');
  assert.equal(await c.verify(`${T0 + 1}.${rand}.${sig}`, nonce, T0 + 5000), 'forged');
  assert.equal(await c.verify(p.challenge, nonce, T0 + 100), 'expired', 'too fast for a person');
  assert.equal(await c.verify(p.challenge, nonce, T0 + CHALLENGE_TTL_MS + 1), 'expired');
  let wrong = 0;
  while (solves(p.challenge, String(wrong), 8)) wrong++;
  assert.equal(await c.verify(p.challenge, String(wrong), T0 + 5000), 'wrong');
});

test("another server key's challenges don't pass", async () => {
  const p = make().issue(T0);
  const other = createChallenges({ key: 'x'.repeat(32), redis: fakeRedis(), bits: 8 });
  assert.equal(await other.verify(p.challenge, solve(p), T0 + 5000), 'forged');
});
