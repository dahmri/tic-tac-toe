import {
  test,
  expect,
  closePlayers,
  findInLobby,
  lobbyRow,
  openPlayer,
  status,
} from './fixtures.js';

test('star a player, see them in Friends, and invite them from there', async ({ browser }) => {
  const ann = await openPlayer(browser);
  const bob = await openPlayer(browser);
  await findInLobby(ann.page, bob.player.username);
  await lobbyRow(ann.page, bob.player.username)
    .getByRole('button', { name: `Add ${bob.player.username} to friends` })
    .click();

  const friend = ann.page.locator('#friendList .friend', { hasText: bob.player.username });
  await expect(friend).toContainText('Online');
  await expect(ann.page.locator('#friendsCount')).toHaveText('(1/1)');
  await friend.getByRole('button', { name: `Invite ${bob.player.username}` }).click();
  const invite = bob.page.locator('.invite', { hasText: ann.player.username });
  await invite.getByRole('button', { name: 'Accept' }).click();
  await expect(status(ann.page)).toContainText('Your move');
  await closePlayers(ann, bob);
});

test('add a friend by username; unknown names are explained', async ({ browser }) => {
  const ann = await openPlayer(browser);
  const bob = await openPlayer(browser);
  await ann.page.getByRole('button', { name: 'Online', exact: true }).click();
  const box = ann.page.locator('#friendsBox');
  await expect(box.locator('#friendsEmpty')).toBeVisible();
  await box.getByLabel('Add a friend by username').fill('nobody_like_this');
  await box.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(box.locator('#friendMsg')).toHaveText('No player has that username.');

  await box.getByLabel('Add a friend by username').fill(bob.player.username);
  await box.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(box.locator('.friend', { hasText: bob.player.username })).toBeVisible();
  await box.getByRole('button', { name: `Remove ${bob.player.username} from friends` }).click();
  await expect(box.locator('#friendsEmpty')).toBeVisible();
  await closePlayers(ann, bob);
});
