import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  hashPassword,
  hashToken,
  needsRehash,
  newToken,
  openPII,
  sealPII,
  verifyPassword,
} from '../../server/security.js';
import { COUNTRY_CODES, countryFlag, isCountryCode } from '../../js/countries.js';

test('passwords hash with argon2id and verify', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.match(hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('correct horse batterY', hash), false);
  assert.equal(needsRehash(hash), false);
});

test('the same password hashes differently each time (random salt)', async () => {
  assert.notEqual(await hashPassword('same password'), await hashPassword('same password'));
});

test('malformed or weaker stored hashes are handled', async () => {
  assert.equal(await verifyPassword('x', ''), false);
  assert.equal(await verifyPassword('x', 'plain text'), false);
  assert.equal(needsRehash('$argon2id$v=19$m=4096,t=1,p=1$c2FsdA$aGFzaA'), true);
});

test('personal data round-trips through encryption and is unreadable without the key', () => {
  const key = randomBytes(32);
  const data = { firstName: 'Zoë', lastName: 'Ng', birthDate: '2001-01-01', phone: null };
  const sealed = sealPII(data, key);
  assert.deepEqual(openPII(sealed, key), data);
  assert.equal(sealed.includes(Buffer.from('Zoë')), false);
  assert.notDeepEqual(sealPII(data, key), sealed); // fresh IV every time
  assert.throws(() => openPII(sealed, randomBytes(32)));
  const tampered = Buffer.from(sealed);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => openPII(tampered, key));
});

test('session tokens are long, random, and stored only as hashes', () => {
  const a = newToken();
  assert.equal(a.length, 43);
  assert.notEqual(a, newToken());
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), a);
});

test('the country list holds the 249 ISO codes', () => {
  assert.equal(COUNTRY_CODES.length, 249);
  assert.equal(new Set(COUNTRY_CODES).size, 249);
  assert.ok(isCountryCode('MA') && isCountryCode('US') && !isCountryCode('EU'));
  assert.equal(countryFlag('FR'), '🇫🇷');
});
