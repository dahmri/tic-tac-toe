import { test, expect, cell, status, chooseMode, closePlayers, startMatch } from './fixtures.js';

const tile = (dialog, section, label) =>
  dialog.locator(`${section} .tile`, { hasText: label }).locator('.tile-value');

test('a finished game against the computer shows in your stats', async ({ page }) => {
  await page.goto('/');
  await chooseMode(page, 'Unbeatable');
  // Play the first free square each turn until the game ends
  while (!(await status(page).textContent()).match(/wins|Cat's game/)) {
    if ((await status(page).textContent()).includes('Your move')) {
      await page.locator('.cell:not([data-mark]):not(:disabled)').first().click();
    }
    await page.waitForTimeout(150);
  }
  const lost = (await status(page).textContent()).includes('Computer wins');

  await page.getByRole('button', { name: 'Stats' }).click();
  const dialog = page.getByRole('dialog', { name: 'Your stats' });
  await expect(tile(dialog, '#cpuTiles', 'Played')).toHaveText('1');
  await expect(tile(dialog, '#cpuTiles', lost ? 'Lost' : 'Drawn')).toHaveText('1');
  await expect(tile(dialog, '#cpuTiles', 'Won')).toHaveText('0');
  await expect(dialog.locator('#cpuNote')).toContainText('in 1 games');
  await expect(dialog.locator('#historyList .history-item')).toHaveCount(1);
  await expect(dialog.locator('#historyList')).toContainText('vs Computer (Unbeatable)');
  await expect(tile(dialog, '#onlineTiles', 'Played')).toHaveText('0');
  await expect(dialog.locator('#opponentsEmpty')).toBeVisible();
});

test('online results show for both players, with the opponent', async ({ browser }) => {
  const { ann, bob } = await startMatch(browser);
  for (const [page, i] of [
    [ann.page, 0],
    [bob.page, 3],
    [ann.page, 1],
    [bob.page, 4],
    [ann.page, 2],
  ]) {
    await cell(page, i).click();
    await expect(cell(ann.page, i)).toHaveAttribute('data-mark', /[XO]/);
    await expect(cell(bob.page, i)).toHaveAttribute('data-mark', /[XO]/);
  }
  await expect(status(bob.page)).toContainText('wins');

  await bob.page.getByRole('button', { name: 'Stats' }).click();
  const dialog = bob.page.getByRole('dialog', { name: 'Your stats' });
  await expect(tile(dialog, '#onlineTiles', 'Lost')).toHaveText('1');
  await expect(tile(dialog, '#onlineTiles', 'Win rate')).toHaveText('0%');
  const row = dialog.locator('#opponentsTable tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(ann.player.username);
  await expect(dialog.locator('#historyList .history-item').first()).toContainText('Lost');
  await expect(dialog.locator('#historyList .history-item').first()).toContainText(
    ann.player.username,
  );

  await ann.page.getByRole('button', { name: 'Stats' }).click();
  const annDialog = ann.page.getByRole('dialog', { name: 'Your stats' });
  await expect(tile(annDialog, '#onlineTiles', 'Won')).toHaveText('1');
  await expect(annDialog.locator('#onlineFacts')).toContainText('5 moves');
  await closePlayers(ann, bob);
});
