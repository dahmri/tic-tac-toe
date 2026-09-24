import {
  test,
  expect,
  cell,
  chooseMode,
  closePlayers,
  findInLobby,
  lobbyRow,
  openPlayer,
  status,
} from './fixtures.js';

test.use({ signedIn: false });

async function asGuest(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Play as a guest/ }).click();
}

test('3 marks: the oldest mark fades, then vanishes on the next move', async ({ page }) => {
  await asGuest(page);
  await chooseMode(page, 'Same screen');
  await page.getByRole('button', { name: '3 marks' }).click();
  await expect(page.locator('#ruleNote')).toBeVisible();

  for (const i of [0, 3, 1, 4, 8, 6]) await cell(page, i).click();
  // X has three marks: the first one (square 0) goes next
  await expect(cell(page, 0)).toHaveClass(/fading/);
  await cell(page, 7).click();
  await expect(cell(page, 0)).not.toHaveAttribute('data-mark');
  await expect(cell(page, 0)).toBeEnabled();
  // O plays 2: O's 3 vanishes, leaving 2 4 6
  await cell(page, 2).click();
  await expect(status(page)).toContainText('O wins');
  await expect(cell(page, 3)).not.toHaveAttribute('data-mark');
});

test('the hint shows a square to play, and Medium is on offer', async ({ page }) => {
  await asGuest(page);
  await expect(page.getByRole('button', { name: 'Medium' })).toBeVisible();
  await page.getByRole('button', { name: 'Medium' }).click();
  await expect(page.getByRole('button', { name: 'Medium' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.locator('.cell.hinted')).toHaveCount(1);
  await expect(status(page)).toContainText('Try row');
  await page.locator('.cell.hinted').click();
  await expect(page.locator('.cell.hinted')).toHaveCount(0);

  // The top level is called Hard under the 3-mark rules
  await page.getByRole('button', { name: '3 marks' }).click();
  await expect(page.locator('#diff-hard')).toHaveText('Hard');
});

test.describe('online', () => {
  test.use({ signedIn: true });

  test('an invitation carries the 3-mark rules into the match', async ({ browser }) => {
    const ann = await openPlayer(browser, { country: 'FR' });
    const bob = await openPlayer(browser, { country: 'MA' });
    await ann.page.getByRole('button', { name: '3 marks' }).click();
    await findInLobby(ann.page, bob.player.username);
    await lobbyRow(ann.page, bob.player.username)
      .getByRole('button', { name: /^Invite/ })
      .click();
    const invite = bob.page.locator('.invite', { hasText: ann.player.username });
    await expect(invite).toContainText('invites you to play (3 marks)');
    await invite.getByRole('button', { name: 'Accept' }).click();
    await expect(ann.page.locator('#roomRole')).toContainText('3-mark rules');
    await expect(bob.page.locator('#roomRole')).toContainText('3-mark rules');

    // Ann X, Bob O: 0 3 1 4 8 6, then Ann's 7 wipes her 0 on both screens
    const turns = [ann, bob, ann, bob, ann, bob, ann];
    const squares = [0, 3, 1, 4, 8, 6, 7];
    for (const [k, p] of turns.entries()) {
      await expect(cell(p.page, squares[k])).toBeEnabled();
      await cell(p.page, squares[k]).click();
    }
    await expect(cell(bob.page, 0)).not.toHaveAttribute('data-mark');
    await expect(cell(bob.page, 7)).toHaveAttribute('data-mark', 'X');
    await closePlayers(ann, bob);
  });
});
