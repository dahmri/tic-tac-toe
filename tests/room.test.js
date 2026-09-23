import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRoomCode, normalizeCode, peerIdFor, codeFromHash, inviteLink, CODE_LENGTH } from '../js/room.js';

test('new codes are valid and the right length', () => {
  for (let n = 0; n < 200; n++) {
    const code = newRoomCode();
    assert.equal(code.length, CODE_LENGTH);
    assert.equal(normalizeCode(code), code);
  }
});

test('codes avoid look-alike characters', () => {
  const code = newRoomCode(() => 0.999);
  assert.match(code, /^[A-Z2-9]+$/);
  assert.equal(normalizeCode('ABCD0O'), null);
  assert.equal(normalizeCode('ABCD1I'), null);
});

test('normalizeCode accepts what people type', () => {
  assert.equal(normalizeCode('k7pq2m'), 'K7PQ2M');
  assert.equal(normalizeCode(' K7P-Q2M '), 'K7PQ2M');
  assert.equal(normalizeCode('K7P Q2M'), 'K7PQ2M');
});

test('normalizeCode rejects bad input', () => {
  assert.equal(normalizeCode(''), null);
  assert.equal(normalizeCode(null), null);
  assert.equal(normalizeCode('K7PQ2'), null);
  assert.equal(normalizeCode('K7PQ2MM'), null);
  assert.equal(normalizeCode('K7PQ2!'), null);
});

test('peer ids are namespaced and lowercase', () => {
  assert.equal(peerIdFor('K7PQ2M'), 'pencil-ttt-k7pq2m');
});

test('invite links round-trip through the hash', () => {
  const link = inviteLink({ origin: 'https://example.com', pathname: '/ttt/' }, 'K7PQ2M');
  assert.equal(link, 'https://example.com/ttt/#room-K7PQ2M');
  assert.equal(codeFromHash(new URL(link).hash), 'K7PQ2M');
  assert.equal(codeFromHash('#other'), null);
  assert.equal(codeFromHash(''), null);
});
