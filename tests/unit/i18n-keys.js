// Finds every English text players can see, so a test can check that each
// one has a French and a Spanish translation:
//
// - index.html: the text of every element (a [data-i18n-html] paragraph
//   as a whole), and aria-label / title / placeholder attributes;
// - scripts: the English passed to t(), tr() or sentence();
// - server and validation messages: sentences in quotes ending in . ! ?;
// - the Stats labels, the avatars' names, and the achievements.

import { readFileSync, readdirSync } from 'node:fs';
import { AVATARS, GUEST_AVATAR } from '../../js/avatars.js';
import { ACHIEVEMENTS } from '../../js/achievements.js';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const normalize = (s) => s.replace(/\s+/g, ' ').trim();
const hasLetters = (s) => /\p{L}/u.test(s);
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function htmlKeys() {
  let html = read('index.html');
  html = html.replace(/<head>[\s\S]*<\/head>/, '');
  html = html.replace(/<script[\s\S]*?<\/script>/g, '');
  html = html.replace(/<code[^>]*>[\s\S]*?<\/code>/g, '');
  html = html.replace(/<h1 data-no-i18n>[\s\S]*?<\/h1>/, '');
  const keys = new Set();
  html = html.replace(/<p[^>]*data-i18n-html[^>]*>([\s\S]*?)<\/p>/g, (m, inner) => {
    keys.add(normalize(inner));
    return '';
  });
  for (const tag of html.match(/<[^>]+>/g)) {
    if (tag.includes('data-no-i18n')) continue;
    for (const [, , value] of tag.matchAll(/\b(aria-label|title|placeholder)="([^"]*)"/g)) {
      if (hasLetters(value)) keys.add(decode(value));
    }
  }
  for (const text of html.replace(/<[^>]+>/g, '\u0000').split('\u0000')) {
    const t = normalize(decode(text));
    if (hasLetters(t)) keys.add(t);
  }
  return keys;
}

// String literals in source: '…', "…" and `…` (templates with ${} are
// matched whole, so their quotes don't confuse the rest, then skipped)
const LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
const unescape = (s) => s.replace(/\\(['"\\])/g, '$1');

function sourceFiles(dir) {
  return readdirSync(new URL(dir, root), { recursive: true })
    .filter((f) => f.endsWith('.js') && !f.startsWith('locales'))
    .map((f) => `${dir}${f}`);
}

function codeKeys() {
  const keys = new Set();
  const files = [...sourceFiles('js/'), ...sourceFiles('server/')].filter(
    (f) => !['server/config.js', 'server/migrate.js', 'server/index.js'].includes(f),
  );
  for (const file of files) {
    // Comments out first: their apostrophes would pair up with real quotes
    const src = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    // t('…'), tr('…') and sentence('…'), even across lines
    for (const m of src.matchAll(
      /\b(?:t|tr|sentence)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`$]*)`)/g,
    )) {
      keys.add(unescape(m[1] ?? m[2] ?? m[3]));
    }
    // Sentences: messages from the server and the form rules
    for (const m of src.matchAll(LITERAL)) {
      const s = unescape(m[1] ?? m[2] ?? m[3]);
      if (s.includes('${')) continue;
      if (/^[\p{Lu}✉🔒⏱▶⏸🌍{<]/u.test(s) && /\p{L}.*[.!?…]$/u.test(s)) keys.add(s);
      if (s.includes('{who}')) keys.add(s); // sentences around a player's name
    }
  }
  // Stats labels and outcome names, used through t(label)
  const stats = read('js/stats.js');
  for (const m of stats.matchAll(/\[\s*'([^']+)',/g)) keys.add(m[1]);
  for (const m of stats.matchAll(/\b(?:W|L|D|casual|medium|hard): '([^']+)'/g)) keys.add(m[1]);
  return keys;
}

// Texts that stay as they are in every language
export const UNTRANSLATED = new Set(['{who}']);

export function translationKeys() {
  const keys = new Set([
    ...htmlKeys(),
    ...codeKeys(),
    ...AVATARS.map((a) => a.name),
    GUEST_AVATAR.name,
    ...ACHIEVEMENTS.flatMap((a) => [a.name, a.about]),
  ]);
  for (const k of UNTRANSLATED) keys.delete(k);
  return [...keys].sort();
}
