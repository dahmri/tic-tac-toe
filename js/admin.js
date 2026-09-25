// The Admin dialog, for whoever runs the site: open reports, finding a
// player to rename, suspend or delete, usage numbers, and what admins did.
// Loaded only when an admin opens it (main.js).

import { api } from './api.js';
import { lang, t } from './i18n.js';

const $ = (id) => /** @type {any} */ (document.getElementById(id));
const dialog = $('adminDialog');
let tab = 'reports';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const when = (d) =>
  new Intl.DateTimeFormat(lang(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
const day = (d) => new Intl.DateTimeFormat(lang(), { dateStyle: 'medium' }).format(new Date(d));

const REASONS = {
  username: 'An offensive username',
  cheating: 'Cheating (bots, scripts)',
  harassment: 'Harassment',
  other: 'Something else',
};

function say(text) {
  $('adminMsg').textContent = text;
}

// Runs an action, then shows what happened and reloads the tab
async function run(action, done) {
  try {
    await action();
    say(done);
    await load();
  } catch (err) {
    say(t(err.message));
  }
}

const button = (label, onClick, cls = 'btn ghostbtn') => {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

function suspended(p) {
  if (!p.suspendedUntil) return '';
  return new Date(p.suspendedUntil).getFullYear() >= 9999
    ? t('Suspended until further notice')
    : t('Suspended until {date}', { date: day(p.suspendedUntil) });
}

// Rename, suspend (for how long), lift the suspension, delete
function actions(p) {
  const box = el('div', 'admin-actions');
  box.append(
    button(t('Rename'), () => {
      const name = prompt(t('New username for {name} (empty: Player{id})', p), '');
      if (name === null) return;
      run(
        () => api('POST', `/api/admin/players/${p.id}/rename`, { username: name.trim() }),
        t('Renamed.'),
      );
    }),
  );
  if (p.suspendedUntil) {
    box.append(
      button(t('Lift suspension'), () =>
        run(() => api('POST', `/api/admin/players/${p.id}/unsuspend`), t('Suspension lifted.')),
      ),
    );
  } else {
    const pick = el('select');
    pick.setAttribute('aria-label', t('Suspend {name}', { name: p.username }));
    for (const [value, label] of [
      ['', t('Suspend…')],
      ['1', t('1 day')],
      ['7', t('7 days')],
      ['30', t('30 days')],
      ['0', t('Until further notice')],
    ]) {
      pick.append(new Option(label, value));
    }
    pick.addEventListener('change', () => {
      if (!pick.value) return;
      const days = Number(pick.value) || null;
      run(
        () => api('POST', `/api/admin/players/${p.id}/suspend`, { days }),
        t('{name} is suspended and logged out.', { name: p.username }),
      );
    });
    box.append(pick);
  }
  box.append(
    button(
      t('Delete'),
      () => {
        if (!confirm(t("Delete {name}'s account? This can't be undone.", { name: p.username })))
          return;
        run(() => api('DELETE', `/api/admin/players/${p.id}`), t('Account deleted.'));
      },
      'btn ghostbtn danger',
    ),
  );
  return box;
}

async function loadReports() {
  const { reports } = await api('GET', '/api/admin/reports');
  $('reportsEmpty').hidden = reports.length > 0;
  $('reportList').replaceChildren(
    ...reports.map((r) => {
      const li = el('li', 'admin-item');
      const head = el('p', 'admin-head');
      head.append(el('strong', '', r.player.username), ` · ${t(REASONS[r.reason])}`);
      if (r.against > 1) head.append(` · ${t('{n} open reports', { n: r.against })}`);
      li.append(head);
      if (r.details) li.append(el('blockquote', 'admin-details', r.details));
      li.append(
        el(
          'p',
          'admin-meta',
          `${t('From {name}', { name: r.reporter ?? t('Deleted player') })} · ${when(r.createdAt)}`,
        ),
      );
      const acts = actions({ ...r.player, id: r.player.id });
      acts.prepend(
        button(t('Dismiss'), () =>
          run(() => api('POST', `/api/admin/reports/${r.id}/dismiss`), t('Report dismissed.')),
        ),
      );
      li.append(acts);
      return li;
    }),
  );
}

async function loadPlayers() {
  const q = $('adminQuery').value.trim();
  const { players } = await api('GET', `/api/admin/players?q=${encodeURIComponent(q)}`);
  $('adminPlayers').replaceChildren(
    ...(players.length
      ? players.map((p) => {
          const li = el('li', 'admin-item');
          const head = el('p', 'admin-head');
          head.append(el('strong', '', p.username), ` · ${p.country}`);
          if (p.admin) head.append(` · ${t('Admin')}`);
          li.append(head);
          const meta = [t('Joined {date}', { date: day(p.createdAt) })];
          if (p.openReports) meta.push(t('{n} open reports', { n: p.openReports }));
          if (p.suspendedUntil) meta.push(suspended(p));
          li.append(el('p', 'admin-meta', meta.join(' · ')));
          if (!p.admin) li.append(actions(p));
          return li;
        })
      : [el('li', 'empty', t('No player found.'))]),
  );
}

async function loadUsage() {
  const { days, now } = await api('GET', '/api/admin/usage');
  $('usageTiles').replaceChildren(
    ...[
      [t('Online now'), now.online],
      [t('Players'), now.players],
      [t('Games'), now.games],
      [t('Open reports'), now.openReports],
    ].map(([label, n]) => {
      const tile = el('div', 'tile');
      tile.append(el('span', 'tile-value', String(n)), el('span', 'tile-label', label));
      return tile;
    }),
  );
  const most = Math.max(1, ...days.map((d) => d.active));
  $('usageTable').tBodies[0].replaceChildren(
    ...days.map((d) => {
      const tr = el('tr');
      const th = el('th', '', day(`${d.day}T12:00:00Z`));
      th.scope = 'row';
      const active = el('td', 'num bar-cell', String(d.active));
      active.style.setProperty('--bar', `${(d.active / most) * 100}%`);
      tr.append(th, active);
      for (const n of [
        d.signups,
        d.online,
        d.computer,
        d.variants.classic,
        d.variants.vanish,
        d.variants.ultimate,
      ]) {
        tr.append(el('td', 'num', String(n)));
      }
      return tr;
    }),
  );
}

async function loadLog() {
  const { log } = await api('GET', '/api/admin/log');
  $('adminLog').replaceChildren(
    ...(log.length
      ? log.map((l) => {
          const li = el('li');
          const what = [l.admin ?? '?', l.action, l.player, l.details].filter(Boolean).join(' ');
          li.append(el('span', 'admin-meta', when(l.at)), ' ', what);
          return li;
        })
      : [el('li', 'empty', t('Nothing yet.'))]),
  );
}

const LOADERS = { reports: loadReports, players: loadPlayers, usage: loadUsage, log: loadLog };

async function load() {
  try {
    await LOADERS[tab]();
  } catch (err) {
    say(t(err.message));
  }
}

function show(next) {
  tab = next;
  say('');
  dialog.querySelectorAll('[data-admin-tab]').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.adminTab === tab));
  });
  dialog.querySelectorAll('[data-admin-panel]').forEach((p) => {
    p.hidden = p.dataset.adminPanel !== tab;
  });
  load();
}

dialog.querySelectorAll('[data-admin-tab]').forEach((b) => {
  b.addEventListener('click', () => show(b.dataset.adminTab));
});
dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
$('adminSearch').addEventListener('submit', (e) => {
  e.preventDefault();
  say('');
  load();
});

export function openAdmin() {
  if (!dialog.open) dialog.showModal();
  show(tab);
}
