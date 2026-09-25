import {
  test,
  expect,
  cell,
  closePlayers,
  findInLobby,
  lobbyRow,
  openPlayer,
  startMatch,
  status,
} from './fixtures.js';

test('watch a live game from the lobby, move by move', async ({ browser }) => {
  const { ann, bob } = await startMatch(browser);
  const cat = await openPlayer(browser);
  await findInLobby(cat.page, bob.player.username);
  await lobbyRow(cat.page, bob.player.username)
    .getByRole('button', { name: `Watch ${bob.player.username} play` })
    .click();

  await expect(cat.page.locator('#watchInfo')).toContainText(ann.player.username);
  await expect(status(cat.page)).toContainText(`${ann.player.username} is thinking`);
  await expect(ann.page.locator('#spectators')).toHaveText('👀 1 watching');

  await cell(ann.page, 4).click();
  await expect(cell(cat.page, 4)).toHaveAttribute('data-mark', 'X');
  await expect(cell(cat.page, 0)).toBeDisabled();

  await cat.page.getByRole('button', { name: 'Stop watching' }).click();
  await expect(cat.page.locator('#lobby')).toBeVisible();
  await expect(ann.page.locator('#spectators')).toBeHidden();
  await closePlayers(ann, bob, cat);
});
