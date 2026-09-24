// What's on the board, shared by local play (main.js) and online play
// (online.js), and the player's settings, saved in the browser.

import { emptyBoard, isVariant } from './rules.js';

const STORAGE_KEY = 'pencil-ttt';
const MODES = ['cpu', 'pvp', 'online', 'puzzle'];
const DIFFICULTIES = ['casual', 'medium', 'hard'];

export const zeroScores = () => ({ X: 0, O: 0, D: 0 });

// The position on the board. `busy` is true while a move is on its way
// (the computer thinking, or the server checking an online move).
export const game = {
  board: emptyBoard(),
  marks: { X: [], O: [] }, // each player's marks, oldest first (3-mark rules)
  turn: 'X',
  over: false,
  busy: false,
};

export const settings = load();

function load() {
  const base = {
    mode: 'cpu',
    diff: 'casual',
    variant: 'classic',
    scores: zeroScores(),
    starter: 'X',
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.scores) {
      const s = { ...base, ...saved };
      if (!MODES.includes(s.mode)) s.mode = 'cpu';
      if (!DIFFICULTIES.includes(s.diff)) s.diff = 'casual';
      if (!isVariant(s.variant)) s.variant = 'classic';
      if (s.mode === 'online') {
        s.scores = zeroScores();
        s.starter = 'X';
      }
      return s;
    }
  } catch {
    /* storage unavailable: start fresh */
  }
  return base;
}

export function saveSettings() {
  // Online scores belong to the match, not this browser
  const data =
    settings.mode === 'online' ? { ...settings, scores: zeroScores(), starter: 'X' } : settings;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}
