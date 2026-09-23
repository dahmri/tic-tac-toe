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

export const test = base.extend({
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
