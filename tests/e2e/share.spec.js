import {
  test,
  expect,
  cell,
  closePlayers,
  newPlayer,
  signUp,
  startMatch,
  watchPage,
} from './fixtures.js';

test.use({ signedIn: false });

test("a friend's invite link: who invited you, then they're in your friends", async ({
  browser,
  page,
}) => {
  const ann = await signUp(page); // the one who shares the link
  const context = await browser.newContext();
  const bobPage = await context.newPage();
  const errors = watchPage(bobPage);
  await bobPage.goto(`/?from=${ann.username}`);
  await expect(bobPage.locator('#invitedBy')).toHaveText(
    `${ann.username} invited you to play. Welcome!`,
  );
  expect(new URL(bobPage.url()).search).toBe('', 'the address bar is tidied');

  await signUp(bobPage, newPlayer());
  await bobPage.goto('/');
  await expect(bobPage.locator('#netMsg')).toContainText(`${ann.username} is in your friends now`);
  await bobPage.getByRole('button', { name: 'Online', exact: true }).click();
  await expect(bobPage.locator('#friendList .friend', { hasText: ann.username })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('your move online: the board lights up and the tab title says so', async ({ browser }) => {
  const { ann, bob } = await startMatch(browser);
  await expect(ann.page.locator('body')).toHaveClass(/my-turn/);
  await expect(ann.page).toHaveTitle(/^● Your move/);
  await expect(bob.page.locator('body')).not.toHaveClass(/my-turn/);
  await expect(bob.page).toHaveTitle('Pencil Tic-Tac-Toe');
  await expect(ann.page.locator('#clockRing')).toBeVisible();
  await cell(ann.page, 0).click();
  await expect(bob.page.locator('body')).toHaveClass(/my-turn/);
  await expect(ann.page.locator('body')).not.toHaveClass(/my-turn/);
  await closePlayers(ann, bob);
});
