import { test, expect, cell } from './fixtures.js';

test.use({ signedIn: false });

test('installable, and a guest can keep playing offline', async ({ page, context }) => {
  await page.goto('/');
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe('standalone');

  await page.getByRole('button', { name: /Play as a guest/ }).click();
  // Wait until the service worker has cached the game
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(async () => (await globalThis.caches.keys()).length))
    .toBeGreaterThan(0);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#meName')).toHaveText('Guest');
  await cell(page, 4).click();
  await expect(page.locator('.cell[data-mark="O"]')).toHaveCount(1);
  await context.setOffline(false);
});

test('offline without an account: the way in is guest play', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(async () => (await globalThis.caches.keys()).length))
    .toBeGreaterThan(0);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#loginForm .form-msg')).toHaveText(
    "You're offline. You can still play as a guest.",
  );
  await page.getByRole('button', { name: /Play as a guest/ }).click();
  await expect(page.locator('#board')).toBeVisible();
  await context.setOffline(false);
});
