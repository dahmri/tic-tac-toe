import { test, expect, cell, status } from './fixtures.js';
import { dayKey, puzzleFor } from '../../js/puzzle.js';
import { winner } from '../../js/rules.js';

test('solving the puzzle unlocks an achievement, shown in Stats', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🧩 Puzzle' }).click();
  const p = puzzleFor(dayKey());
  await cell(page, p.solutions[0]).click();
  await expect(status(page)).toContainText('Now finish it');
  const b = await Promise.all(
    Array.from({ length: 9 }, (_, i) => cell(page, i).getAttribute('data-mark')),
  );
  const win = b.findIndex(
    (v, i) => !v && winner(Object.assign(b.slice(), { [i]: 'X' }))?.p === 'X',
  );
  await cell(page, win).click();

  await expect(page.locator('#toast')).toHaveText('🧩 Achievement unlocked: Puzzler');
  await page.getByRole('button', { name: 'Stats' }).click();
  const dialog = page.getByRole('dialog', { name: 'Your stats' });
  await expect(dialog.locator('.badge.earned')).toHaveCount(1);
  await expect(dialog.locator('.badge.earned')).toContainText('Puzzler');
  await expect(dialog.locator('#badgeCount')).toHaveText(/^1 \/ \d+$/);
});
