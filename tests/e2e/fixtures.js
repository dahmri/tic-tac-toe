import { test as base, expect } from '@playwright/test';
import { solves } from '../../server/challenge.js';
import { execFileSync } from 'node:child_process';

// Collects uncaught errors and Content-Security-Policy violations, so a
// test fails if the page breaks in ways the assertions might not notice.
export function watchPage(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) {
      errors.push(msg.text());
    }
  });
  return errors;
}

let players = 0;
// Details for a new, unique player; override any field
export function newPlayer(overrides = {}) {
  players++;
  const id = `${Date.now().toString(36)}${players}${Math.floor(Math.random() * 1e4)}`;
  const username = `e2e_${id}`.slice(0, 20);
  return {
    firstName: 'Pat',
    lastName: 'Tester',
    username,
    email: `${username}@example.com`,
    avatar: 'sloth',
    birthDate: '1994-03-21',
    country: 'FR',
    phone: '',
    password: 'a good long password',
    ...overrides,
  };
}

// The confirmation link's token from the latest email to `email`. The
// test server keeps emails in an outbox instead of sending them.
// `param` is the link's token name: 'verify' (confirm the address) or
// 'reset' (a new password).
export async function emailToken(page, email, param = 'verify') {
  let link;
  await expect(async () => {
    const res = await page.request.get(`/api/test/outbox?to=${encodeURIComponent(email)}`);
    const links = (await res.json()).emails.map((m) => new URL(/https?:\/\/\S+/.exec(m.text)[0]));
    link = links.find((u) => u.searchParams.has(param));
    expect(link, `a '${param}' email to ${email}`).toBeTruthy();
  }).toPass({ timeout: 5000 });
  return link.searchParams.get(param);
}

// The sign-up check's puzzle, solved here (the test server makes it easy)
export async function answerChallenge(page) {
  const { challenge, bits } = await (await page.request.get('/api/challenge')).json();
  let nonce = 0;
  while (!solves(challenge, String(nonce), bits)) nonce++;
  return { challenge, nonce: String(nonce) };
}

// Creates an account through the API; the session cookie lands in the
// page's browser context, so the next page load is logged in. The email is
// confirmed too, unless `confirmed: false`.
export async function signUp(page, { confirmed = true, ...overrides } = {}) {
  const player = newPlayer(overrides);
  const res = await page.request.post('/api/account', {
    data: { ...player, ...(await answerChallenge(page)) },
  });
  expect(res.status(), await res.text()).toBe(201);
  if (confirmed) {
    const token = await emailToken(page, player.email);
    const ok = await page.request.post('/api/email/verify', { data: { token } });
    expect(ok.status()).toBe(200);
  }
  return player;
}

// Makes a player an admin with the command whoever runs the site uses:
// inside the api container when testing the Docker stack, otherwise
// against the test server's database
export function makeAdmin(username) {
  if (process.env.E2E_BASE_URL) {
    execFileSync('docker', [
      'compose',
      'exec',
      '-T',
      'api',
      'node',
      'server/make-admin.js',
      username,
    ]);
  } else {
    execFileSync('node', ['server/make-admin.js', username], {
      env: {
        ...process.env,
        DATABASE_URL: process.env.E2E_DATABASE_URL || 'postgres://localhost/tictactoe_e2e',
      },
    });
  }
}

export const test = base.extend({
  // Tests start logged in as a fresh player unless they opt out with
  // test.use({ signedIn: false })
  signedIn: [true, { option: true }],
  player: [
    async ({ page, signedIn }, use) => {
      await use(signedIn ? await signUp(page) : null);
    },
    { auto: true },
  ],
  page: async ({ page }, use) => {
    const errors = watchPage(page);
    await use(page);
    expect(errors, 'page errors').toEqual([]);
  },
});

export { expect };

export const cell = (page, i) => page.locator(`#cell-${i}`);
export const status = (page) => page.locator('#status');

export async function chooseMode(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
}

// A second, independent player: own browser context (cookies, storage)
export async function openPlayer(browser, overrides) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = watchPage(page);
  const player = await signUp(page, overrides);
  await page.goto('/');
  await expect(page.locator('#meName')).toHaveText(player.username);
  return { context, page, errors, player };
}

export async function closePlayers(...players) {
  for (const p of players) {
    expect(p.errors, `${p.player.username}: page errors`).toEqual([]);
    await p.context.close();
  }
}

export const lobbyRow = (page, username) => page.locator('.player', { hasText: username });

// Opens the lobby and waits until `username` appears in the list
export async function findInLobby(page, username) {
  await chooseMode(page, 'Online');
  await expect(lobbyRow(page, username)).toBeVisible({ timeout: 15_000 });
}

// Ann (FR) invites Bob (MA), Bob accepts; Ann plays X. A test can give
// them other countries, to find them in lists by country.
export async function startMatch(browser, { annFrom = 'FR', bobFrom = 'MA' } = {}) {
  const ann = await openPlayer(browser, { country: annFrom });
  const bob = await openPlayer(browser, { country: bobFrom });
  await findInLobby(ann.page, bob.player.username);
  await lobbyRow(ann.page, bob.player.username)
    .getByRole('button', { name: /^Invite/ })
    .click();
  const invite = bob.page.locator('.invite', { hasText: ann.player.username });
  await expect(invite).toContainText('invites you to play');
  await invite.getByRole('button', { name: 'Accept' }).click();
  await expect(status(ann.page)).toContainText('Your move');
  await expect(status(bob.page)).toContainText(`${ann.player.username} is thinking`);
  return { ann, bob };
}
