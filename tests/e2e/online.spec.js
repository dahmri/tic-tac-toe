// Online play between players in separate browser contexts (separate
// cookies and storage, like two computers), through the real game server.

import {
  test,
  expect,
  cell,
  status,
  openPlayer,
  closePlayers as close,
  lobbyRow as row,
  findInLobby,
  startMatch,
} from './fixtures.js';

test.describe.configure({ timeout: 60_000 });

test('the lobby lists online players and filters them by country', async ({ browser }) => {
  const ann = await openPlayer(browser, { country: 'FR' });
  const bob = await openPlayer(browser, { country: 'MA' });

  await findInLobby(ann.page, bob.player.username);
  await expect(row(ann.page, bob.player.username)).toContainText('Morocco');
  await expect(row(ann.page, ann.player.username)).toHaveCount(0); // not yourself

  const filter = ann.page.getByLabel('Show players from');
  await filter.selectOption('MA');
  await expect(row(ann.page, bob.player.username)).toBeVisible();
  await filter.selectOption('JP');
  await expect(row(ann.page, bob.player.username)).toHaveCount(0);
  await expect(ann.page.locator('#playersEmpty')).toContainText('No one from Japan');
  await filter.selectOption('');

  // Bob closes the game: he leaves the list at the next refresh
  await bob.context.close();
  await expect(row(ann.page, bob.player.username)).toHaveCount(0, { timeout: 15_000 });
  await close(ann);
});

test('a declined invitation tells the inviter', async ({ browser }) => {
  const ann = await openPlayer(browser);
  const bob = await openPlayer(browser);
  await findInLobby(ann.page, bob.player.username);
  await row(ann.page, bob.player.username)
    .getByRole('button', { name: /^Invite/ })
    .click();
  const waiting = ann.page.locator('.invite.outgoing');
  await expect(waiting).toContainText('Waiting for');
  await expect(waiting).toContainText(bob.player.username);
  await expect(row(ann.page, bob.player.username)).toContainText('Invited');

  // Bob is on vs Computer: the invitation shows there too
  const invite = bob.page.locator('.invite', { hasText: ann.player.username });
  await expect(invite).toBeVisible();
  await invite.getByRole('button', { name: 'Decline' }).click();

  await expect(ann.page.locator('#netMsg')).toHaveText(
    `${bob.player.username} declined your invitation.`,
  );
  await expect(ann.page.locator('.invite')).toHaveCount(0);
  await expect(bob.page.locator('.invite')).toHaveCount(0);
  await close(ann, bob);
});

test('invited players play a full match on the server', async ({ browser }) => {
  const { ann, bob } = await startMatch(browser);
  await expect(bob.page.getByRole('button', { name: 'Online' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(ann.page.locator('#opponentName')).toContainText(bob.player.username);
  await expect(bob.page.locator('#lblO')).toHaveText('You · O');

  // Ann (X) takes the top row; Bob (O) plays the middle row
  const moves = [
    [ann.page, 0, 'X'],
    [bob.page, 3, 'O'],
    [ann.page, 1, 'X'],
    [bob.page, 4, 'O'],
    [ann.page, 2, 'X'],
  ];
  for (const [page, i, mark] of moves) {
    await cell(page, i).click();
    await expect(cell(ann.page, i)).toHaveAttribute('data-mark', mark);
    await expect(cell(bob.page, i)).toHaveAttribute('data-mark', mark);
  }
  await expect(status(ann.page)).toContainText('You win!');
  await expect(status(bob.page)).toContainText(`${ann.player.username} wins`);
  await expect(bob.page.locator('#tX svg')).toHaveCount(1);

  // Either player starts the next round; O opens it
  await bob.page.getByRole('button', { name: 'New round' }).click();
  await expect(status(bob.page)).toContainText('Your move');
  await expect(ann.page.locator('.cell[data-mark]')).toHaveCount(0);

  await bob.page.keyboard.press('5'); // keypad 5 = center
  await expect(cell(ann.page, 4)).toHaveAttribute('data-mark', 'O');

  // Ann leaves mid-round: Bob wins it
  await ann.page.getByRole('button', { name: 'Leave' }).click();
  await expect(bob.page.locator('#netMsg')).toContainText(
    `${ann.player.username} left the game. You win the round.`,
  );
  await expect(bob.page.locator('#lobby')).toBeVisible();
  await close(ann, bob);
});

test('reloading the page rejoins the match', async ({ browser }) => {
  const { ann, bob } = await startMatch(browser);
  await cell(ann.page, 4).click();
  await expect(cell(bob.page, 4)).toHaveAttribute('data-mark', 'X');

  await bob.page.reload();
  await expect(cell(bob.page, 4)).toHaveAttribute('data-mark', 'X');
  await expect(status(bob.page)).toContainText('Your move');
  await cell(bob.page, 0).click();
  await expect(cell(ann.page, 0)).toHaveAttribute('data-mark', 'O');
  await close(ann, bob);
});

test('an inviter can cancel', async ({ browser }) => {
  const ann = await openPlayer(browser);
  const bob = await openPlayer(browser);
  await findInLobby(ann.page, bob.player.username);
  await row(ann.page, bob.player.username)
    .getByRole('button', { name: /^Invite/ })
    .click();
  await expect(bob.page.locator('.invite')).toBeVisible();
  await ann.page.locator('.invite.outgoing').getByRole('button', { name: 'Cancel' }).click();
  await expect(bob.page.locator('.invite')).toHaveCount(0);
  await expect(row(ann.page, bob.player.username).getByRole('button')).toHaveText('Invite');
  await close(ann, bob);
});
