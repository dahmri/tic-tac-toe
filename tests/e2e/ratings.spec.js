// Ratings move after online rounds and show on the leaderboard.

import { test, expect, cell, status, closePlayers, startMatch } from './fixtures.js';

test.describe.configure({ timeout: 60_000 });

test('a win moves both ratings and puts the players on the leaderboard', async ({ browser }) => {
  const { ann, bob } = await startMatch(browser);
  await expect(ann.page.locator('#meRating')).toHaveText('1200');
  await expect(ann.page.locator('#opponentName .rating-chip')).toHaveText('1200');

  for (const [page, i] of [
    [ann.page, 0],
    [bob.page, 3],
    [ann.page, 1],
    [bob.page, 4],
    [ann.page, 2],
  ]) {
    await cell(page, i).click();
    await expect(cell(ann.page, i)).toHaveAttribute('data-mark', /[XO]/);
  }
  await expect(status(ann.page)).toContainText('You win!');
  await expect(status(ann.page).locator('.delta')).toHaveText('+16');
  await expect(status(bob.page).locator('.delta')).toHaveText('−16');
  await expect(ann.page.locator('#meRating')).toHaveText('1216');
  await expect(bob.page.locator('#meRating')).toHaveText('1184');
  await expect(bob.page.locator('#opponentName .rating-chip')).toHaveText('1216');

  // Ann (France) looks at the leaderboard: the world, then Morocco
  await ann.page.getByRole('button', { name: 'Leaderboard' }).click();
  const dialog = ann.page.getByRole('dialog', { name: 'Leaderboard' });
  const rowOf = (name) => dialog.locator('tbody tr', { hasText: name });
  await dialog.getByLabel('Leaderboard for').selectOption('');
  await expect(rowOf(ann.player.username)).toContainText('1216');
  await expect(rowOf(ann.player.username)).toHaveClass(/me/);
  await expect(rowOf(bob.player.username)).toContainText('1184');
  await expect(dialog.locator('#lbMe')).toContainText('rated 1216');

  await dialog.getByLabel('Leaderboard for').selectOption('MA');
  await expect(rowOf(bob.player.username)).toBeVisible();
  await expect(rowOf(ann.player.username)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).click();

  // The round shows in the history with its points
  await bob.page.getByRole('button', { name: 'Stats' }).click();
  const stats = bob.page.getByRole('dialog', { name: 'Your stats' });
  await expect(stats.locator('#ratingTiles .tile', { hasText: 'Rating' })).toContainText('1184');
  await expect(stats.locator('#historyList .history-item').first()).toContainText('−16');
  await closePlayers(ann, bob);
});
