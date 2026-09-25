import { test, expect } from './fixtures.js';

test('the theme switch goes automatic, light, dark, and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const button = page.locator('#themeBtn');
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? 'auto');
  await expect(button).toHaveAccessibleName('Theme: automatic');
  expect(await theme()).toBe('auto');
  await button.click();
  await expect(button).toHaveAccessibleName('Theme: light');
  expect(await theme()).toBe('light');
  const paper = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await paper()).toBe('rgb(246, 247, 242)'); // light, though the system is dark
  await button.click();
  expect(await theme()).toBe('dark');
  await page.reload();
  expect(await theme()).toBe('dark');
  await expect(button).toHaveAccessibleName('Theme: dark');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the account links fold behind a menu', async ({ page }) => {
    await page.goto('/');
    const stats = page.getByRole('button', { name: 'Stats' });
    await expect(stats).toBeHidden();
    const menu = page.getByRole('button', { name: 'Menu' });
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Leaderboard' })).toBeFocused(); // the first link
    await page.keyboard.press('Escape');
    await expect(stats).toBeHidden();
    await expect(menu).toBeFocused();
    await menu.click();
    await stats.click();
    await expect(page.getByRole('dialog', { name: 'Your stats' })).toBeVisible();
  });
});
