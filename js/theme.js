// The theme switch: automatic (follows the system), light or dark. The
// choice is kept in this browser; theme-boot.js applies it on load.

import { onLangChange, t } from './i18n.js';

const KEY = 'pencil-ttt-theme';
const ORDER = ['auto', 'light', 'dark'];
const ICONS = { auto: '◐', light: '☀', dark: '☾' };
const COLORS = { light: '#f6f7f2', dark: '#1c2420' };

const $ = (id) => /** @type {any} */ (document.getElementById(id));

function stored() {
  try {
    const v = localStorage.getItem(KEY);
    return ORDER.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function label(theme) {
  return {
    auto: t('Theme: automatic'),
    light: t('Theme: light'),
    dark: t('Theme: dark'),
  }[theme];
}

function apply(theme) {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  // The browser's bar follows a forced theme too
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (theme === 'auto') meta?.remove();
  else {
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.append(meta);
    }
    meta.setAttribute('content', COLORS[theme]);
  }
  $('themeIcon').textContent = ICONS[theme];
  $('themeLabel').textContent = label(theme);
  $('themeBtn').title = label(theme);
}

export function initTheme() {
  let theme = stored();
  apply(theme);
  $('themeBtn').addEventListener('click', () => {
    theme = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* not kept: fine for this visit */
    }
    apply(theme);
  });
  onLangChange(() => apply(theme));
}
