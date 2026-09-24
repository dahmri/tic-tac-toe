// Achievements on the page: the badges in the Stats dialog, and a toast
// when one is earned. The server works them out; the browser remembers
// which ones it has already shown, per player, to announce only new ones.

import { api } from './api.js';
import { ACHIEVEMENTS, achievementById } from './achievements.js';
import { currentUser } from './account.js';
import { t } from './i18n.js';
import { sound } from './sound.js';

const $ = (id) => document.getElementById(id);
const seenKey = (userId) => `pencil-ttt-achievements-${userId}`;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function renderBadges(list) {
  const byId = new Map(list.map((a) => [a.id, a]));
  const earned = list.filter((a) => a.earned).length;
  $('badgeCount').textContent = `${earned} / ${ACHIEVEMENTS.length}`;
  $('badgeList').replaceChildren(
    ...ACHIEVEMENTS.map((a) => {
      const state = byId.get(a.id) ?? { earned: false };
      const li = el('li', `badge ${state.earned ? 'earned' : 'locked'}`);
      li.append(el('span', 'badge-emoji', a.emoji));
      const text = el('span', 'badge-text');
      text.append(el('strong', '', t(a.name)), el('span', '', t(a.about)));
      if (a.goal && !state.earned) {
        text.append(el('span', 'badge-progress', `${state.count ?? 0} / ${a.goal}`));
      }
      li.append(text);
      li.setAttribute(
        'aria-label',
        `${t(a.name)}: ${state.earned ? t('earned') : t('not yet')}. ${t(a.about)}`,
      );
      return li;
    }),
  );
}

function toast(a) {
  const box = $('toast');
  box.textContent = t('{emoji} Achievement unlocked: {name}', { emoji: a.emoji, name: t(a.name) });
  box.hidden = false;
  box.classList.remove('show');
  void box.offsetWidth; // restart the animation
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (box.hidden = true), 4500);
}

let pending = null;

// Checks for newly earned achievements, after something that might earn one
export function checkAchievements() {
  const user = currentUser();
  if (!user) return;
  clearTimeout(pending);
  pending = setTimeout(async () => {
    let list;
    try {
      ({ achievements: list } = await api('GET', '/api/me/achievements'));
    } catch {
      return;
    }
    const earned = list.filter((a) => a.earned).map((a) => a.id);
    let seen = null;
    try {
      seen = JSON.parse(localStorage.getItem(seenKey(user.id)) || 'null');
      localStorage.setItem(seenKey(user.id), JSON.stringify(earned));
    } catch {
      return; // nowhere to remember what was shown: stay quiet
    }
    // The first check on this browser only takes note
    if (!Array.isArray(seen)) return;
    const fresh = earned.filter((id) => !seen.includes(id));
    if (fresh.length) sound.win();
    fresh.forEach((id, i) => setTimeout(() => toast(achievementById(id)), i * 1500));
  }, 600);
}
