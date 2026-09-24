import { test, expect, cell, chooseMode, newPlayer, status } from './fixtures.js';

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
  for (const name of ['Stats', 'Profile', 'Log out']) {
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

test('guests can see the leaderboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Play as a guest/ }).click();
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  const dialog = page.getByRole('dialog', { name: 'Leaderboard' });
  await expect(dialog.locator('#lbMe')).toHaveText(
    'Make a free account and play online to join the leaderboard.',
  );
});

test("a guest's games against the computer join their new account", async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Play as a guest/ }).click();
  await chooseMode(page, 'Unbeatable');
  while (!(await status(page).textContent()).match(/wins|Cat's game/)) {
    if ((await status(page).textContent()).includes('Your move')) {
      await page.locator('.cell:not([data-mark]):not(:disabled)').first().click();
    }
    await page.waitForTimeout(150);
  }

  await page.getByRole('button', { name: 'Log in or sign up' }).click();
  const p = newPlayer();
  const form = page.locator('#signupForm');
  await form.getByLabel('First name').fill(p.firstName);
  await form.getByLabel('Last name').fill(p.lastName);
  await form.getByLabel('Username').fill(p.username);
  await form.getByTitle('Big Brain').click();
  await form.getByLabel('Date of birth').fill(p.birthDate);
  await form.getByLabel('Country').selectOption('FR');
  await form.getByLabel('Password').fill(p.password);
  await form.getByRole('button', { name: 'Create account' }).click();

  const saveCode = page.getByRole('dialog', { name: 'Save your recovery code' });
  await expect(saveCode.locator('#recoveryNote')).toHaveText(
    'We added your 1 game as a guest to your stats.',
  );
  await saveCode.getByRole('button', { name: "I've saved it" }).click();
  await page.getByRole('button', { name: 'Stats' }).click();
  await expect(page.locator('#historyList .history-item')).toHaveCount(1);
});
