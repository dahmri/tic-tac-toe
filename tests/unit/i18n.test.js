import { test } from 'node:test';
import assert from 'node:assert/strict';
import fr from '../../js/locales/fr.js';
import es from '../../js/locales/es.js';
import { pickLang, translate } from '../../js/i18n.js';
import '../../js/locales/all.js';
import { translationKeys } from './i18n-keys.js';

const keys = translationKeys();
const markers = (s) => [...s.matchAll(/\{\w+\}|<[^>]+>/g)].map((m) => m[0]).sort();

for (const [name, dict] of Object.entries({ fr, es })) {
  test(`${name}: every text players see is translated`, () => {
    const missing = keys.filter((k) => !dict[k]);
    assert.deepEqual(missing, [], `add these to js/locales/${name}.js`);
  });

  test(`${name}: translations keep their {placeholders} and <tags>, and none are stale`, () => {
    for (const [en, tr] of Object.entries(dict)) {
      assert.deepEqual(markers(tr), markers(en), `${en} -> ${tr}`);
    }
    const stale = Object.keys(dict).filter((k) => !keys.includes(k));
    assert.deepEqual(stale, [], `no longer used: remove from js/locales/${name}.js`);
  });
}

test('translate fills in variables and falls back to English', () => {
  assert.equal(translate('fr', '{name} is thinking…', { name: 'Ann' }), 'Ann réfléchit…');
  assert.equal(translate('es', 'Not in any dictionary {x}', { x: 1 }), 'Not in any dictionary 1');
  assert.equal(translate('en', 'Hint'), 'Hint');
  assert.equal(translate('de', 'Hint'), 'Hint');
});

test('pickLang reads Accept-Language, or falls back to English', () => {
  assert.equal(pickLang('fr-CA,fr;q=0.9,en;q=0.8'), 'fr');
  assert.equal(pickLang('de-DE, es;q=0.8'), 'es');
  assert.equal(pickLang('de'), 'en');
  assert.equal(pickLang(undefined), 'en');
});
