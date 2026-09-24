import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVATARS, GUEST_AVATAR, avatarEmoji, isAvatar } from '../../js/avatars.js';

test('avatar ids are unique and fit the database check', () => {
  const ids = AVATARS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z]{2,20}$/);
  assert.ok(AVATARS.length >= 12, 'plenty to choose from');
});

test('the guest avatar is not one players can pick', () => {
  assert.equal(isAvatar(GUEST_AVATAR.id), false);
  assert.equal(avatarEmoji('guest'), GUEST_AVATAR.emoji);
});

test('unknown avatars still show a face', () => {
  assert.equal(avatarEmoji('dino'), '🦖');
  assert.equal(avatarEmoji('nope'), '🙂');
  assert.equal(avatarEmoji(undefined), '🙂');
});
