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
