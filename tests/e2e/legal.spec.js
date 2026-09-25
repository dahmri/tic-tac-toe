import { test, expect, answerChallenge } from './fixtures.js';

test.use({ signedIn: false });

test('privacy policy and terms open from the footer and from their own address', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.site-footer').getByRole('link', { name: 'Privacy' }).click();
  const privacy = page.getByRole('dialog', { name: 'Privacy policy' });
  await expect(privacy).toBeVisible();
  await expect(privacy).toContainText('You must be at least 16 to create an account.');
  await privacy.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/#terms');
  await expect(page.getByRole('dialog', { name: 'Terms of use' })).toBeVisible();

  // And from the sign-up form, in French
  await page.goto('/');
  await page.getByLabel('Language').selectOption('fr');
  await page.getByRole('tab', { name: 'Créer un compte' }).click();
  await page.locator('#signupForm').getByRole('link', { name: "conditions d'utilisation" }).click();
  await expect(page.getByRole('dialog', { name: "Conditions d'utilisation" })).toBeVisible();
});

test('the page loads nothing from other sites', async ({ page }) => {
  const elsewhere = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol.startsWith('http')) {
      elsewhere.push(r.url());
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Play as a guest/ }).click();
  await expect(page.locator('#board')).toBeVisible();
  // The handwriting font comes from this site
  await expect
    .poll(() => page.evaluate(() => globalThis.document.fonts.check('700 20px Caveat')))
    .toBe(true);
  expect(elsewhere).toEqual([]);
});

test('sign-up needs you to be 16', async ({ page }) => {
  const res = await page.request.post('/api/account', {
    data: {
      firstName: 'Young',
      lastName: 'Player',
      username: `yp_${Date.now().toString(36)}`,
      email: `yp_${Date.now().toString(36)}@example.com`,
      avatar: 'frog',
      birthDate: `${new Date().getFullYear() - 15}-01-01`,
      country: 'FR',
      password: 'a good long password',
      ...(await answerChallenge(page)),
    },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).fields.birthDate).toBe('You must be at least 16 to create an account.');
});
