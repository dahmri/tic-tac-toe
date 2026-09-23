import { test as base, expect } from '@playwright/test';

// Every test fails if the page throws an uncaught error.
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await use(page);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },
});

export { expect };

export const cell = (page, i) => page.locator(`#cell-${i}`);
export const status = (page) => page.locator('#status');

export async function chooseMode(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
}
