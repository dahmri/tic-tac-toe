import { test, expect, cell } from './fixtures.js';

test('dialogs have addresses: links open them, the back button closes them', async ({ page }) => {
  await page.goto('/#stats');
  const stats = page.getByRole('dialog', { name: 'Your stats' });
  await expect(stats).toBeVisible();
  await stats.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('button', { name: 'Leaderboard' }).click();
  const board = page.getByRole('dialog', { name: 'Leaderboard' });
  await expect(board).toBeVisible();
  await expect(page).toHaveURL(/#leaderboard$/);
  await page.goBack();
  await expect(board).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await page.goForward();
  await expect(board).toBeVisible();
});

test.describe('as a guest', () => {
  test.use({ signedIn: false });

  test("an address for something a guest can't open does nothing", async ({ page }) => {
    await page.goto('/#stats');
    await page.getByRole('button', { name: /Play as a guest/ }).click();
    await expect(page.locator('#board')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Your stats' })).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  });

  test('English visitors never download the translations', async ({ page }) => {
    const locales = [];
    page.on('request', (r) => {
      if (/\/locales\//.test(r.url())) locales.push(r.url());
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Play as a guest/ }).click();
    await expect(page.locator('#board')).toBeVisible();
    expect(locales).toEqual([]);
    await page.getByLabel('Language').selectOption('es');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    expect(locales.map((u) => u.split('/').pop())).toEqual(['es.js']);
  });

  test('moves are announced for screen readers', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Play as a guest/ }).click();
    await page.getByRole('button', { name: 'Same screen' }).click();
    await cell(page, 4).click();
    await expect(page.locator('#moveSaid')).toHaveText('X played row 2, column 2.');
    await cell(page, 0).click();
    await expect(page.locator('#moveSaid')).toHaveText('O played row 1, column 1.');
  });
});
