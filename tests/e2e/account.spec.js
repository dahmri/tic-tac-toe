import { test, expect, newPlayer, signUp } from './fixtures.js';

test.describe('signed out', () => {
  test.use({ signedIn: false });

  test('the game is hidden until you log in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Log in' })).toBeVisible();
    await expect(page.locator('#board')).toBeHidden();
  });

  test('sign up through the form, log out, log back in', async ({ page }) => {
    const p = newPlayer({ phone: '+44 20 7946 0958' });
    await page.goto('/');
    await page.getByRole('tab', { name: 'Create account' }).click();

    const form = page.locator('#signupForm');
    await form.getByLabel('First name').fill(p.firstName);
    await form.getByLabel('Last name').fill(p.lastName);
    await form.getByLabel('Username').fill(p.username);
    await form.getByTitle('Drama Llama').click();
    await form.getByLabel('Date of birth').fill(p.birthDate);
    await form.getByLabel('Country').selectOption('GB');
    await form.getByLabel('Phone number').fill(p.phone);
    await form.getByLabel('Password').fill(p.password);
    await form.getByRole('button', { name: 'Create account' }).click();

    await expect(page.locator('#meName')).toHaveText(p.username);
    await expect(page.locator('#meFlag')).toHaveText('🇬🇧');
    await expect(page.locator('#meAvatar')).toHaveText('🦙');
    await expect(page.locator('#board')).toBeVisible();

    // The recovery code is shown once, right after sign-up
    const saveCode = page.getByRole('dialog', { name: 'Save your recovery code' });
    const code = await saveCode.locator('#recoveryCode').textContent();
    expect(code).toMatch(/^([A-Z2-9]{5}-){3}[A-Z2-9]{5}$/);
    await saveCode.getByRole('button', { name: "I've saved it" }).click();

    // Still logged in after a reload: the session lives in a cookie
    await page.reload();
    await expect(page.locator('#meName')).toHaveText(p.username);

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.locator('#board')).toBeHidden();

    const login = page.locator('#loginForm');
    await login.getByLabel('Username').fill(p.username);
    await login.getByLabel('Password').fill('the wrong password');
    await login.getByRole('button', { name: 'Log in' }).click();
    await expect(login.getByRole('alert')).toHaveText('Wrong username or password.');

    await login.getByLabel('Password').fill(p.password);
    await login.getByRole('button', { name: 'Log in' }).click();
    await expect(page.locator('#meName')).toHaveText(p.username);

    // Forgot the password: the recovery code sets a new one
    await page.getByRole('button', { name: 'Log out' }).click();
    await login.getByLabel('Username').fill(p.username);
    await page.getByRole('button', { name: 'Forgot your password?' }).click();
    const reset = page.locator('#resetForm');
    await reset.getByLabel('Recovery code').fill(code.toLowerCase());
    await reset.getByLabel('New password').fill('a totally new password');
    await reset.getByRole('button', { name: 'Set new password' }).click();
    await expect(page.locator('#meName')).toHaveText(p.username);
    const fresh = page.getByRole('dialog', { name: 'Save your recovery code' });
    await expect(fresh.locator('#recoveryNote')).toContainText('old code no longer works');
    await expect(fresh.locator('#recoveryCode')).not.toHaveText(code);
  });

  test('the sign-up form explains what is wrong, field by field', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Create account' }).click();
    const form = page.locator('#signupForm');
    await form.getByLabel('Username').fill('ab');
    await form.getByLabel('Password').fill('short');
    await form.getByRole('button', { name: 'Create account' }).click();

    await expect(form.locator('[data-err="firstName"]')).toHaveText('Enter your first name.');
    await expect(form.locator('[data-err="username"]')).toContainText('3 to 20');
    await expect(form.locator('[data-err="password"]')).toContainText('at least 10');
    await expect(form.locator('[data-err="avatar"]')).toHaveText('Pick an avatar.');
    await expect(form.getByLabel('First name')).toBeFocused();
  });

  test('a taken username is reported by the server', async ({ page }) => {
    const taken = await signUp(page);
    await page.context().clearCookies();
    await page.goto('/');
    await page.getByRole('tab', { name: 'Create account' }).click();
    const form = page.locator('#signupForm');
    const p = newPlayer();
    await form.getByLabel('First name').fill(p.firstName);
    await form.getByLabel('Last name').fill(p.lastName);
    await form.getByLabel('Username').fill(taken.username);
    await form.getByTitle('Top Banana').click();
    await form.getByLabel('Date of birth').fill(p.birthDate);
    await form.getByLabel('Country').selectOption('FR');
    await form.getByLabel('Password').fill(p.password);
    await form.getByRole('button', { name: 'Create account' }).click();
    await expect(form.locator('[data-err="username"]')).toHaveText(
      'That username is taken. Try another.',
    );
  });
});

test('edit your profile and change your password', async ({ page, player }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile' }).click();
  const dialog = page.getByRole('dialog', { name: 'Your profile' });
  const profile = dialog.locator('#profileForm');
  await expect(profile.getByLabel('First name')).toHaveValue(player.firstName);
  await expect(profile.getByLabel('Date of birth')).toHaveValue(player.birthDate);

  await profile.getByLabel('Last name').fill('Renamed');
  await expect(profile.getByRole('radio', { name: 'Speedy Sloth' })).toBeChecked();
  await profile.getByTitle('Lost Alien').click();
  await profile.getByLabel('Country').selectOption('MA');
  await profile.getByLabel('Phone number').fill('+212 6 12 34 56 78');
  await profile.getByRole('button', { name: 'Save changes' }).click();
  await expect(profile.getByRole('status')).toHaveText('Saved.');
  await expect(page.locator('#meFlag')).toHaveText('🇲🇦');
  await expect(page.locator('#meAvatar')).toHaveText('👽');

  const pw = dialog.locator('#passwordForm');
  await pw.getByLabel('Current password').fill(player.password);
  await pw.getByLabel('New password').fill('my new long password');
  await pw.getByRole('button', { name: 'Change password' }).click();
  await expect(pw.getByRole('status')).toContainText('Password changed');

  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Profile' }).click();
  await expect(profile.getByLabel('Last name')).toHaveValue('Renamed');
  await expect(profile.getByLabel('Phone number')).toHaveValue('+212612345678');
});

test('download your data, then delete the account', async ({ page, player }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile' }).click();
  const dialog = page.getByRole('dialog', { name: 'Your profile' });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('link', { name: 'Download my data' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`tic-tac-toe-${player.username}.json`);

  const del = dialog.locator('#deleteForm');
  await del.getByLabel('Your password').fill('not my password');
  page.once('dialog', (d) => d.accept());
  await del.getByRole('button', { name: 'Delete my account' }).click();
  await expect(del.locator('[data-err="password"]')).toHaveText('That is not your password.');

  await del.getByLabel('Your password').fill(player.password);
  page.once('dialog', (d) => d.accept());
  await del.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.locator('#loginForm .form-msg')).toHaveText('Your account has been deleted.');

  const login = page.locator('#loginForm');
  await login.getByLabel('Username').fill(player.username);
  await login.getByLabel('Password').fill(player.password);
  await login.getByRole('button', { name: 'Log in' }).click();
  await expect(login.getByRole('alert')).toHaveText('Wrong username or password.');
});
