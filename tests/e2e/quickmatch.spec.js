// Quick match, and inviting the last opponent again. These run one after
// another: players waiting in two tests at once could be paired together.

import {
  test,
  expect,
  status,
  chooseMode,
  openPlayer,
  closePlayers as close,
  startMatch,
} from './fixtures.js';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test('two players looking for a game are paired', async ({ browser }) => {
  const ann = await openPlayer(browser);
  const bob = await openPlayer(browser);
  await chooseMode(ann.page, 'Online');
  await ann.page.getByRole('button', { name: 'Find me an opponent' }).click();
  await expect(ann.page.locator('#quickSearching')).toContainText('Looking for an opponent');

  // A reload keeps the search going
  await ann.page.reload();
  await expect(ann.page.locator('#quickSearching')).toBeVisible();

  await chooseMode(bob.page, 'Online');
  await bob.page.getByRole('button', { name: 'Find me an opponent' }).click();
  await expect(ann.page.locator('#opponentName')).toContainText(bob.player.username);
  await expect(bob.page.locator('#opponentName')).toContainText(ann.player.username);
  await expect(status(ann.page)).toContainText(/Your move|is thinking/);
  await expect(ann.page.locator('#quickSearching')).toBeHidden();
  await close(ann, bob);
});

test('a player can stop looking', async ({ browser }) => {
  const ann = await openPlayer(browser);
  await chooseMode(ann.page, 'Online');
  await ann.page.getByRole('button', { name: 'Find me an opponent' }).click();
  await expect(ann.page.locator('#quickSearching')).toBeVisible();
  await ann.page.getByRole('button', { name: 'Cancel' }).click();
  await expect(ann.page.getByRole('button', { name: 'Find me an opponent' })).toBeVisible();

  // Nobody is paired with her now
  const bob = await openPlayer(browser);
  await chooseMode(bob.page, 'Online');
  await bob.page.getByRole('button', { name: 'Find me an opponent' }).click();
  await expect(bob.page.locator('#quickSearching')).toBeVisible();
  await bob.page.waitForTimeout(1000);
  await expect(bob.page.locator('#quickSearching')).toBeVisible();
  await expect(ann.page.locator('#roomInfo')).toBeHidden();
  await bob.page.getByRole('button', { name: 'Cancel' }).click();
  await close(ann, bob);
});

test('after a match, the last opponent can be invited again', async ({ browser }) => {
  const { ann, bob } = await startMatch(browser);
  await bob.page.getByRole('button', { name: 'Leave' }).click();

  const card = ann.page.locator('#rematch');
  await expect(card).toContainText(`Last game: vs`);
  await expect(card).toContainText(bob.player.username);
  await card.getByRole('button', { name: 'Invite again' }).click();
  await expect(card.getByRole('button', { name: 'Invite again' })).toBeDisabled();

  const invite = bob.page.locator('.invite', { hasText: ann.player.username });
  await invite.getByRole('button', { name: 'Accept' }).click();
  await expect(ann.page.locator('#opponentName')).toContainText(bob.player.username);
  await expect(card).toBeHidden();
  await close(ann, bob);
});
