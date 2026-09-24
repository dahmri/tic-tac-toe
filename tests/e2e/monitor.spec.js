import { test, expect } from './fixtures.js';

// Its own browser context: the usual fixtures fail a test on any page error
test('an error in the page is reported to the server', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Log in' })).toBeVisible();
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.url().endsWith('/api/client-errors')),
    page.evaluate(() =>
      setTimeout(() => {
        throw new Error('Something broke on purpose');
      }),
    ),
  ]);
  const body = request.postDataJSON();
  expect(body.kind).toBe('error');
  expect(body.message).toContain('Something broke on purpose');
  expect(body.page).toBe('/');
  await context.close();
});
