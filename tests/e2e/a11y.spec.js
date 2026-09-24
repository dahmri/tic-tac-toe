// Accessibility: axe checks the main screens, in the light and the dark
// theme, and the test fails on any serious or critical problem.

import AxeBuilder from '@axe-core/playwright';
import { test, expect, signUp } from './fixtures.js';

test.use({ signedIn: false });

async function audit(page, label) {
  // No preloading: axe would fetch the Google Fonts stylesheet itself,
  // which the page's Content-Security-Policy rightly refuses
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .options({ preload: false })
    .analyze();
  const bad = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} — ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 4)
          .join(' | ')}`,
    );
  expect(bad, `${label}: accessibility problems`).toEqual([]);
}

for (const scheme of ['light', 'dark']) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('log in, sign up, and guest play', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('tab', { name: 'Log in' })).toBeVisible();
      await audit(page, 'log in');
      await page.getByRole('tab', { name: 'Create account' }).click();
      await audit(page, 'sign up');
      await page.getByRole('button', { name: /Play as a guest/ }).click();
      await expect(page.locator('#board')).toBeVisible();
      await audit(page, 'guest game');
      await page.getByRole('button', { name: 'Online', exact: true }).click();
      await audit(page, 'online, locked');
      await page.getByRole('button', { name: '🧩 Puzzle' }).click();
      await audit(page, 'puzzle');
    });

    test('signed in: the game, the lobby and the dialogs', async ({ page }) => {
      await signUp(page);
      await page.goto('/');
      await expect(page.locator('#meName')).toBeVisible();
      await audit(page, 'game');
      await page.getByRole('button', { name: 'Online', exact: true }).click();
      await expect(page.locator('#lobby')).toBeVisible();
      await audit(page, 'lobby');
      for (const [button, dialog] of [
        ['Stats', 'Your stats'],
        ['Leaderboard', 'Leaderboard'],
        ['Profile', 'Your profile'],
      ]) {
        await page.getByRole('button', { name: button, exact: true }).click();
        await expect(page.getByRole('dialog', { name: dialog })).toBeVisible();
        await page.waitForTimeout(300);
        await audit(page, dialog);
        await page
          .getByRole('dialog', { name: dialog })
          .getByRole('button', { name: 'Close' })
          .click();
      }
    });
  });
}
