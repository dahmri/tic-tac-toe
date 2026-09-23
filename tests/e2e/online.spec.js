// Two players in two separate browser contexts (separate storage, like two
// computers) play over a real WebRTC connection. Needs internet access for
// the PeerJS matchmaking server; skip with: npm run test:e2e -- --grep-invert @online

import { test, expect, cell, status, chooseMode, watchPage } from './fixtures.js';

const CONNECT_TIMEOUT = 30_000;
test.describe.configure({ timeout: 90_000 });

async function openPlayer(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page, errors: watchPage(page) };
}

async function hostGame(page) {
  await page.goto('/');
  await chooseMode(page, 'Online');
  await page.getByRole('button', { name: 'Start a game' }).click();
  const code = page.locator('#roomCode');
  await expect(code).toHaveText(/^[A-Z2-9]{6}$/, { timeout: CONNECT_TIMEOUT });
  return code.textContent();
}

test('@online two players on separate browsers play a full game', async ({ browser }) => {
  const host = await openPlayer(browser);
  const guest = await openPlayer(browser);

  const code = await hostGame(host.page);

  await guest.page.goto('/');
  await chooseMode(guest.page, 'Online');
  await guest.page.getByLabel('Game code').fill(code.toLowerCase());
  await guest.page.getByRole('button', { name: 'Join' }).click();

  await expect(status(host.page)).toContainText('Your move', { timeout: CONNECT_TIMEOUT });
  await expect(status(guest.page)).toContainText('Your friend is thinking');
  await expect(guest.page.locator('#lblO')).toHaveText('You · O');

  // Host (X) takes the top row; guest (O) plays the middle row
  const moves = [
    [host.page, 0, 'X'],
    [guest.page, 3, 'O'],
    [host.page, 1, 'X'],
    [guest.page, 4, 'O'],
    [host.page, 2, 'X'],
  ];
  for (const [player, i, mark] of moves) {
    await cell(player, i).click();
    await expect(cell(host.page, i)).toHaveAttribute('data-mark', mark);
    await expect(cell(guest.page, i)).toHaveAttribute('data-mark', mark);
  }

  await expect(status(host.page)).toContainText('You win!');
  await expect(status(guest.page)).toContainText('Your friend wins.');
  await expect(guest.page.locator('#tX svg')).toHaveCount(1);

  // The guest can start the next round, and O opens it
  await guest.page.getByRole('button', { name: 'New round' }).click();
  await expect(status(guest.page)).toContainText('Your move');
  await expect(status(host.page)).toContainText('Your friend is thinking');
  await expect(host.page.locator('.cell[data-mark]')).toHaveCount(0);

  // After the guest moves, its board locks until the host plays
  await cell(guest.page, 8).click();
  await expect(cell(host.page, 8)).toHaveAttribute('data-mark', 'O');
  await expect(cell(guest.page, 7)).toBeDisabled();

  // When the guest leaves, the host is told and keeps the code
  await guest.context.close();
  await expect(host.page.locator('#netMsg')).toContainText('Your friend left', {
    timeout: CONNECT_TIMEOUT,
  });
  await expect(host.page.locator('#roomCode')).toHaveText(code);

  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
  await host.context.close();
});

test('@online an invite link joins the game directly', async ({ browser }) => {
  const host = await openPlayer(browser);
  const guest = await openPlayer(browser);

  await hostGame(host.page);
  const link = await host.page.locator('#invite').inputValue();
  expect(link).toMatch(/#room-[A-Z2-9]{6}$/);

  await guest.page.goto(link);
  await expect(status(guest.page)).toContainText('Your friend is thinking', {
    timeout: CONNECT_TIMEOUT,
  });
  await expect(guest.page.getByRole('button', { name: 'Online' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
  await host.context.close();
  await guest.context.close();
});

test('@online an unknown code shows a clear error', async ({ page }) => {
  await page.goto('/');
  await chooseMode(page, 'Online');
  await page.getByLabel('Game code').fill('ZZZZZZ');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('#netMsg')).toContainText('No game found', {
    timeout: CONNECT_TIMEOUT,
  });
  await expect(page.getByRole('button', { name: 'Start a game' })).toBeVisible();
});

test('a malformed code is rejected before connecting', async ({ page }) => {
  await page.goto('/');
  await chooseMode(page, 'Online');
  await page.getByLabel('Game code').fill('AB1');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('#netMsg')).toContainText('Codes are 6 letters and numbers');
});
