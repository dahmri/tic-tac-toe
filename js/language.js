// The page in the chosen language: picks it (saved choice, else the
// browser's), translates the static text of index.html, and runs the
// language menu. Text that scripts write is translated where it's written,
// with t() from i18n.js.

import {
  DEFAULT_LANG,
  LANGUAGES,
  isLang,
  lang,
  loadDictionary,
  onLangChange,
  setLang,
  t,
} from './i18n.js';

const KEY = 'pencil-ttt-lang';
const ATTRS = ['aria-label', 'title', 'placeholder'];

// The page's static text, in English, recorded once before any script
// writes to the page. Text written by scripts is left to them.
const texts = []; // { node, text, lead, trail }
const htmls = []; // { el, html }
const attrs = []; // { el, name, value }

const normalize = (s) => s.replace(/\s+/g, ' ').trim();

function collect() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement.closest('script, style, code, [data-i18n-html], [data-no-i18n]')) {
      continue;
    }
    const text = normalize(node.nodeValue);
    if (!/\p{L}/u.test(text)) continue;
    texts.push({ node, text, lead: /^\s/.test(node.nodeValue), trail: /\s$/.test(node.nodeValue) });
  }
  // Paragraphs with markup inside are translated whole
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    htmls.push({ el, html: normalize(el.innerHTML) });
  });
  document.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(',')).forEach((el) => {
    if (el.closest('[data-no-i18n]')) return;
    for (const name of ATTRS) {
      const value = el.getAttribute(name);
      if (value && /\p{L}/u.test(value)) attrs.push({ el, name, value });
    }
  });
}

function translatePage() {
  for (const { node, text, lead, trail } of texts) {
    node.nodeValue = `${lead ? ' ' : ''}${t(text)}${trail ? ' ' : ''}`;
  }
  for (const { el, html } of htmls) el.innerHTML = t(html);
  for (const { el, name, value } of attrs) el.setAttribute(name, t(value));
  document.documentElement.lang = lang();
  document.title = t('Pencil Tic-Tac-Toe');
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      'content',
      t('A hand-drawn tic-tac-toe game: play the computer, a friend, or players online.'),
    );
}

function saved() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function browserLang() {
  for (const l of navigator.languages || [navigator.language]) {
    const code = String(l).slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return DEFAULT_LANG;
}

// Switches once the language's words have arrived (English needs none)
async function switchTo(code) {
  try {
    await loadDictionary(code);
    setLang(code);
  } catch {
    /* offline and not cached: stay in the current language */
  }
}

// Call once, before anything is drawn (awaited: the first paint is in the
// right language)
export async function initLanguage() {
  collect();
  const select = /** @type {HTMLSelectElement} */ (document.getElementById('langSelect'));
  select.replaceChildren(
    ...Object.entries(LANGUAGES).map(([code, name]) => new Option(name, code)),
  );
  onLangChange(translatePage);
  const start = isLang(saved()) ? saved() : browserLang();
  if (start === DEFAULT_LANG) translatePage();
  else await switchTo(start);
  select.value = lang();
  select.addEventListener('change', () => {
    try {
      localStorage.setItem(KEY, select.value);
    } catch {
      /* the choice just won't be remembered */
    }
    switchTo(select.value);
  });
}
