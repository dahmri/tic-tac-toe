import { test, expect, cell, status } from './fixtures.js';
import { dayKey, puzzleFor } from '../../js/puzzle.js';
import { winner } from '../../js/rules.js';

// The board as the page shows it
async function boardOf(page) {
  return Promise.all(Array.from({ length: 9 }, (_, i) => cell(page, i).getAttribute('data-mark')));
}

async function solveToday(page) {
  const p = puzzleFor(dayKey());
  await cell(page, p.solutions[0]).click();
  await expect(status(page)).toContainText('Now finish it');
  const b = (await boardOf(page)).map((v) => v || null);
  const win = b.findIndex(
    (v, i) => !v && winner(Object.assign(b.slice(), { [i]: 'X' }))?.p === 'X',
  );
  await cell(page, win).click();
}

test('solve the daily puzzle and keep the streak', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#meName')).toBeVisible();
  await page.getByRole('button', { name: '🧩 Puzzle' }).click();
  await expect(status(page)).toContainText('Daily puzzle: win in 2 moves');
  await expect(page.getByRole('button', { name: 'Hint' })).toBeHidden();

  await solveToday(page);
  await expect(status(page)).toContainText('Solved!');
  await expect(page.locator('#puzzleNote')).toContainText('Streak: 1');

  // Practice doesn't count
  await page.getByRole('button', { name: 'Practice again' }).click();
  await expect(page.locator('#puzzleNote')).toContainText("only the day's first try counts");

  // Still there after a reload (for a signed-in player, on the server)
  await page.reload();
  await expect(page.locator('#puzzleNote')).toContainText('Streak: 1');
});

test.describe('as a guest', () => {
  test.use({ signedIn: false });

  test('a miss shows the answer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Play as a guest/ }).click();
    await page.getByRole('button', { name: '🧩 Puzzle' }).click();
    const p = puzzleFor(dayKey());
    const wrong = p.board.findIndex((v, i) => !v && !p.solutions.includes(i));
    await cell(page, wrong).click();
    await expect(status(page)).toContainText('Not this time');
    await expect(page.locator('.cell.hinted')).toHaveCount(1);
    await expect(page.locator('#puzzleNote')).toContainText('Streak: 0');
  });
});
