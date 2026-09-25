// The weekly arena runs all day on the test servers (ARENA_ALWAYS=on).
// Keep this the only test that joins it: everyone in the arena can be
// paired with everyone else, so two such tests at once would mix players.

import { test, expect, cell, status, closePlayers, chooseMode, openPlayer } from './fixtures.js';

test.describe.configure({ timeout: 60_000 });

test('two players join the arena, get paired, and score points', async ({ browser }) => {
  const ann = await openPlayer(browser);
  const bob = await openPlayer(browser);
  for (const p of [ann, bob]) {
    await chooseMode(p.page, 'Online');
    const box = p.page.locator('#arenaBox');
    await expect(box).toContainText('On now');
    await box.getByRole('button', { name: 'Join the arena' }).click();
    await expect(box.getByRole('button', { name: 'Pause' })).toBeVisible();
  }

  // Paired automatically: whoever is X opens
  await expect(ann.page.locator('#roomRole')).toContainText('Arena game', { timeout: 15_000 });
  await expect(bob.page.locator('#roomRole')).toContainText('Arena game');
  const annIsX = (await status(ann.page).textContent()).includes('Your move');
  const [x, o] = annIsX ? [ann, bob] : [bob, ann];
  for (const [page, i] of [
    [x.page, 0],
    [o.page, 3],
    [x.page, 1],
    [o.page, 4],
    [x.page, 2],
  ]) {
    await cell(page, i).click();
    await expect(cell(x.page, i)).toHaveAttribute('data-mark', /[XO]/);
  }
  await expect(status(x.page)).toContainText('You win!');

  // The game closes, and the arena shows the points
  await expect(x.page.locator('#netMsg')).toContainText('Arena game over', { timeout: 10_000 });
  await expect(x.page.locator('#arenaMe')).toContainText('2 points');
  await o.page.locator('#arenaBox').getByRole('button', { name: 'Standings' }).click();
  const standings = o.page.getByRole('dialog', { name: 'Arena standings' });
  await expect(standings.locator('tbody tr', { hasText: x.player.username })).toContainText('2');
  await standings.getByRole('button', { name: 'Close' }).click();

  // Paused players aren't paired again
  for (const p of [ann, bob]) {
    await p.page.locator('#arenaBox').getByRole('button', { name: 'Pause' }).click();
    await expect(p.page.locator('#arenaMe')).toContainText('Paused.');
  }
  await closePlayers(ann, bob);
});
