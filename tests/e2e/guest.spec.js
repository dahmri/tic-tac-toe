import { test, expect, cell, chooseMode, status } from './fixtures.js';

test.use({ signedIn: false });

test('play as a guest without an account, with a ghost avatar', async ({ page }) => {
  const recorded = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/games/cpu')) recorded.push(req.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Play as a guest/ }).click();

  await expect(page.locator('#meName')).toHaveText('Guest');
  await expect(page.locator('#meAvatar')).toHaveText('👻');
  await expect(page.locator('#board')).toBeVisible();
  for (const name of ['Stats', 'Profile', 'Leaderboard', 'Log out']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
  }

  // The computer still plays guests
  await cell(page, 4).click();
  await expect(page.locator('#cell-4')).toHaveAttribute('data-mark', 'X');
  await expect(status(page)).toContainText('Your move');

  // Same screen works too
  await chooseMode(page, 'Same screen');
  await cell(page, 0).click();
  await expect(status(page)).toContainText('O to play');

  // Guests are remembered across a reload
  await page.reload();
  await expect(page.locator('#meName')).toHaveText('Guest');
  expect(recorded, 'guest games are not recorded').toEqual([]);
});

test('online play asks guests to make an account', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Play as a guest/ }).click();
  await chooseMode(page, 'Online');

  const locked = page.locator('#guestLocked');
  await expect(locked).toContainText('Online games need a free account');
  await expect(page.locator('#board')).toBeHidden();
  await expect(page.locator('#lobby')).toBeHidden();

  await locked.getByRole('button', { name: 'Create a free account' }).click();
  await expect(page.getByRole('tab', { name: 'Create account' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('#signupForm').getByRole('radio')).toHaveCount(18);

  // Leaving guest play is remembered too
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Log in' })).toBeVisible();
});
