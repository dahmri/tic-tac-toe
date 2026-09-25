import { test, expect, closePlayers, makeAdmin, openPlayer } from './fixtures.js';

test('an admin renames a reported player and sees the usage numbers', async ({
  page,
  player,
  browser,
}) => {
  const bob = await openPlayer(browser);
  const report = await bob.page.request.post('/api/reports', {
    data: { id: (await (await bob.page.request.get('/api/me')).json()).user.id, reason: 'other' },
  });
  expect(report.status()).toBe(400); // can't report yourself

  // Ann reports Bob's username, then is made an admin
  const bobId = (await (await bob.page.request.get('/api/me')).json()).user.id;
  const sent = await page.request.post('/api/reports', {
    data: { id: bobId, reason: 'username', details: 'Not nice' },
  });
  expect(sent.status()).toBe(201);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Admin' })).toBeHidden();
  makeAdmin(player.username);
  await page.reload();
  await page.getByRole('button', { name: 'Admin' }).click();

  const dialog = page.locator('#adminDialog');
  const item = dialog.locator('#reportList .admin-item', { hasText: bob.player.username });
  await expect(item).toContainText('An offensive username');
  await expect(item).toContainText('Not nice');
  page.once('dialog', (d) => d.accept('')); // empty: Player<id>
  await item.getByRole('button', { name: 'Rename' }).click();
  await expect(dialog.locator('#adminMsg')).toHaveText('Renamed.');
  await expect(item).toHaveCount(0);
  await bob.page.reload();
  await expect(bob.page.locator('#meName')).toHaveText(`Player${bobId}`);

  await dialog.getByRole('tab', { name: 'Usage' }).click();
  await expect(dialog.locator('#usageTable tbody tr')).toHaveCount(30);
  await expect(dialog.locator('#usageTiles')).toContainText('Online now');

  await dialog.getByRole('tab', { name: 'Log' }).click();
  await expect(dialog.locator('#adminLog')).toContainText(
    `${player.username} renamed ${bob.player.username} to Player${bobId}`,
  );
  await closePlayers(bob);
});
