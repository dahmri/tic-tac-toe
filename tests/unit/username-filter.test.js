import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usernameProblem, usernameWords } from '../../js/username-filter.js';
import { validateRegistration } from '../../js/validation.js';

test('offensive words are refused, in three languages and with look-alike digits', () => {
  for (const name of ['FuckYou', 'xX_Sh1t_Xx', 'p0rn', 'Salope_22', 'Puta_madre', 'm3rde']) {
    assert.match(usernameProblem(name) ?? '', /isn't allowed/, name);
  }
});

test('staff-sounding names are reserved', () => {
  for (const name of ['admin', 'Admin_Bob', 'SuperMod', 'official_ttt']) {
    assert.match(usernameProblem(name) ?? '', /reserved/, name);
  }
});

test('innocent names that merely contain a bad word are fine', () => {
  for (const name of [
    'Scunthorpe',
    'assassin',
    'cocktail',
    'dickens',
    'shitake',
    'Bitcoin_fan',
    'ann_b',
  ]) {
    assert.equal(usernameProblem(name), null, name);
  }
});

test('names are split into words at _, case changes and look-alikes', () => {
  assert.deepEqual(usernameWords('xX_Sh1tLord_Xx'), [
    'x',
    'x',
    'shit',
    'lord',
    'xx',
    'xxshitlordxx',
  ]);
  assert.ok(validateRegistration({ username: 'admin' }).errors.username.includes('reserved'));
});
