import { test, expect, closePlayers, findInLobby, lobbyRow, openPlayer } from './fixtures.js';

test('block a player from the lobby, then unblock them from your profile', async ({ browser }) => {
  const ann = await openPlayer(browser);
  const bob = await openPlayer(browser);
  await findInLobby(ann.page, bob.player.username);
  await lobbyRow(ann.page, bob.player.username)
    .getByRole('button', { name: `More for ${bob.player.username}` })
    .click();

  const menu = ann.page.locator('#playerDialog');
  await menu.getByRole('button', { name: 'Report…' }).click();
  await menu.getByLabel('An offensive username').check();
  await menu.getByRole('button', { name: 'Send report' }).click();
  await expect(menu.locator('#pmMsg')).toHaveText('Thanks: your report has been sent.');
  await expect(menu.getByRole('button', { name: 'Unblock' })).toBeVisible(); // "also block" was ticked
  await menu.getByRole('button', { name: 'Close' }).click();
  await expect(lobbyRow(ann.page, bob.player.username)).toHaveCount(0);

  await ann.page.getByRole('button', { name: 'Profile' }).click();
  const profile = ann.page.getByRole('dialog', { name: 'Your profile' });
  await profile.getByRole('button', { name: `Unblock ${bob.player.username}` }).click();
  await expect(profile.locator('#blockedEmpty')).toBeVisible();
  await profile.getByRole('button', { name: 'Close' }).first().click();
  await expect(lobbyRow(ann.page, bob.player.username)).toBeVisible({ timeout: 15_000 });
  await closePlayers(ann, bob);
});
