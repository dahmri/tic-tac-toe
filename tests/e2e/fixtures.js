import { test as base, expect } from '@playwright/test';

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
  return {
    firstName: 'Pat',
    lastName: 'Tester',
    username: `e2e_${id}`.slice(0, 20),
    birthDate: '1994-03-21',
    country: 'FR',
    phone: '',
    password: 'a good long password',
    ...overrides,
  };
}

// Creates an account through the API; the session cookie lands in the
// page's browser context, so the next page load is logged in
export async function signUp(page, overrides = {}) {
  const player = newPlayer(overrides);
  const res = await page.request.post('/api/account', { data: player });
  expect(res.status(), await res.text()).toBe(201);
  return player;
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

// Ann (FR) invites Bob (MA), Bob accepts; Ann plays X
export async function startMatch(browser) {
  const ann = await openPlayer(browser, { country: 'FR' });
  const bob = await openPlayer(browser, { country: 'MA' });
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
