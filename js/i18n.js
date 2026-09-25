// Languages. English text is the key: every other language is a
// dictionary from the English sentence to its translation (js/locales/),
// and anything missing falls back to English. Variables go in braces:
// t('{name} is thinking…', { name }).
//
// Shared by the browser (the chosen language) and the server (which
// translates its messages into the language each request asks for).
// No DOM code here: see language.js for the page.

export const LANGUAGES = { en: 'English', fr: 'Français', es: 'Español' };
export const DEFAULT_LANG = 'en';
// Filled in as needed: the browser loads a language when it's chosen
// (loadDictionary), the server loads them all (locales/all.js)
const DICTIONARIES = {};

export function addDictionary(code, dict) {
  DICTIONARIES[code] = dict;
}

export async function loadDictionary(code) {
  if (code === DEFAULT_LANG || !Object.hasOwn(LANGUAGES, code) || DICTIONARIES[code]) return;
  DICTIONARIES[code] = (await import(`./locales/${code}.js`)).default;
}

export const isLang = (l) => Object.hasOwn(LANGUAGES, l);

export function translate(lang, text, vars) {
  let out = DICTIONARIES[lang]?.[text] ?? text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}

// The first supported language in an Accept-Language header ("fr-CA,fr;q=0.9,en")
export function pickLang(header) {
  for (const part of String(header || '').split(',')) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return DEFAULT_LANG;
}

/* ---------- The browser's current language ---------- */

let current = DEFAULT_LANG;
const listeners = new Set();

export const lang = () => current;
export const t = (text, vars) => translate(current, text, vars);

export function setLang(l) {
  if (!isLang(l) || l === current) return;
  current = l;
  for (const fn of listeners) fn(l);
}

// Runs `fn` whenever the language changes, to redraw what JS wrote
export function onLangChange(fn) {
  listeners.add(fn);
}
