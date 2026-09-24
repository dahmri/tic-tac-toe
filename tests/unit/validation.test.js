import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageOn,
  passwordError,
  validateProfile,
  validateRegistration,
} from '../../js/validation.js';

const TODAY = new Date('2026-06-15T12:00:00Z');
const valid = {
  firstName: '  Anne-Marie ',
  lastName: "O'Brien",
  username: 'anne_m',
  avatar: 'llama',
  birthDate: '1995-02-28',
  country: 'fr',
  phone: '+33 6 12-34.56 78',
  password: 'a long enough password',
};

test('a complete registration is accepted and cleaned up', () => {
  const r = validateRegistration(valid, TODAY);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value, {
    firstName: 'Anne-Marie',
    lastName: "O'Brien",
    username: 'anne_m',
    avatar: 'llama',
    birthDate: '1995-02-28',
    country: 'FR',
    phone: '+33612345678',
    password: 'a long enough password',
  });
});

test('the phone number is optional, and 00 is read as +', () => {
  assert.equal(validateRegistration({ ...valid, phone: '' }, TODAY).value.phone, null);
  assert.equal(validateRegistration({ ...valid, phone: undefined }, TODAY).value.phone, null);
  assert.equal(
    validateRegistration({ ...valid, phone: '0044 20 7946 0958' }, TODAY).value.phone,
    '+442079460958',
  );
});

test('names accept any alphabet but not symbols', () => {
  for (const name of ['Zoë', 'José María', 'Łukasz', 'محمد', '李', 'J. R.']) {
    assert.equal(validateRegistration({ ...valid, firstName: name }, TODAY).ok, true, name);
  }
  for (const name of ['', '   ', '<b>', 'Bob1', '-Bob', 'x'.repeat(51)]) {
    assert.ok(validateRegistration({ ...valid, firstName: name }, TODAY).errors.firstName, name);
  }
});

test('usernames: 3 to 20 letters, numbers or _', () => {
  for (const u of ['abc', 'A_b_9', 'x'.repeat(20)]) {
    assert.equal(validateRegistration({ ...valid, username: u }, TODAY).ok, true, u);
  }
  for (const u of ['ab', 'x'.repeat(21), 'has space', 'émile', 'a-b', 'a.b']) {
    assert.ok(validateRegistration({ ...valid, username: u }, TODAY).errors.username, u);
  }
});

test('birth dates must be real, and players at least 13', () => {
  const err = (birthDate) => validateRegistration({ ...valid, birthDate }, TODAY).errors.birthDate;
  assert.equal(err('2013-06-15'), undefined); // 13 today
  assert.match(err('2013-06-16'), /at least 13/); // 13 tomorrow
  assert.match(err('2023-02-29'), /does not exist/);
  assert.ok(err('1899-12-31'));
  assert.ok(err('2027-01-01'));
  assert.ok(err('15/06/1990'));
  assert.equal(ageOn('2000-06-16', TODAY), 25);
  assert.equal(ageOn('2000-06-15', TODAY), 26);
});

test('countries must be real ISO codes', () => {
  assert.ok(validateRegistration({ ...valid, country: 'XX' }, TODAY).errors.country);
  assert.ok(validateRegistration({ ...valid, country: 'UK' }, TODAY).errors.country);
  assert.equal(validateRegistration({ ...valid, country: 'gb' }, TODAY).value.country, 'GB');
});

test('phone numbers need the international format', () => {
  for (const phone of [
    '0612345678',
    '+0612345678',
    '+33',
    '+33 6 12 34 56 78 90 12 34',
    'call me',
  ]) {
    assert.ok(validateRegistration({ ...valid, phone }, TODAY).errors.phone, phone);
  }
});

test('passwords: 10 to 128 characters, without the username', () => {
  assert.match(passwordError('short'), /at least 10/);
  assert.match(passwordError('x'.repeat(129)), /at most 128/);
  assert.match(passwordError('my anne_m password', 'Anne_M'), /username/);
  assert.equal(passwordError('ten chars!'), null);
  assert.ok(validateRegistration({ ...valid, password: undefined }, TODAY).errors.password);
  // The password is never echoed back in the cleaned values when invalid
  assert.equal(
    validateRegistration({ ...valid, password: 'short' }, TODAY).value.password,
    undefined,
  );
});

test('profile updates check only the fields that are sent', () => {
  const r = validateProfile({ country: 'de', ignored: 'x', password: 'nope' }, TODAY);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { country: 'DE' });
  assert.equal(validateProfile({ username: 'a' }, TODAY).ok, false);
  assert.deepEqual(validateProfile({ phone: '' }, TODAY).value, { phone: null });
});

test('an avatar from the list is required', () => {
  assert.equal(
    validateRegistration({ ...valid, avatar: undefined }, TODAY).errors.avatar,
    'Pick an avatar.',
  );
  assert.ok(
    validateRegistration({ ...valid, avatar: 'guest' }, TODAY).errors.avatar,
    'guests only',
  );
  assert.ok(validateRegistration({ ...valid, avatar: '<img>' }, TODAY).errors.avatar);
  assert.deepEqual(validateProfile({ avatar: 'robot' }, TODAY).value, { avatar: 'robot' });
});
