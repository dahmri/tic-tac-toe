// Sound and the win celebration.

import { test, expect, cell, status, chooseMode } from './fixtures.js';

// Counts the sounds the page makes: every pencil scratch is a noise buffer,
// every note an oscillator
async function countSounds(page) {
  await page.addInitScript(() => {
    globalThis.sounds = { scratches: 0, notes: 0 };
    const proto = (globalThis.AudioContext || globalThis.webkitAudioContext).prototype;
    const buffer = proto.createBufferSource;
    const osc = proto.createOscillator;
    proto.createBufferSource = function (...args) {
      globalThis.sounds.scratches++;
      return buffer.apply(this, args);
    };
    proto.createOscillator = function (...args) {
      globalThis.sounds.notes++;
      return osc.apply(this, args);
    };
  });
}
const sounds = (page) => page.evaluate(() => globalThis.sounds);

test('marks scratch, a win plays a tune and pops pencil stars', async ({ page, player }) => {
  await countSounds(page);
  await page.goto('/');
  await expect(page.locator('#meName')).toHaveText(player.username);
  await chooseMode(page, 'Same screen');

  await cell(page, 0).click();
  await expect.poll(async () => (await sounds(page)).scratches).toBe(2); // an X: two strokes
  for (const i of [3, 1, 4, 2]) await cell(page, i).click();
  await expect(status(page)).toContainText('X wins!');
  await expect.poll(async () => (await sounds(page)).notes).toBe(4);
  await expect(page.locator('#confetti path')).toHaveCount(10);

  await page.getByRole('button', { name: 'New round' }).click();
  await expect(page.locator('#confetti path')).toHaveCount(0);

  // A draw: no stars
  for (const i of [0, 1, 2, 4, 3, 5, 7, 6, 8]) await cell(page, i).click();
  await expect(status(page)).toContainText("Cat's game");
  await expect(page.locator('#confetti path')).toHaveCount(0);
});

test('sound can be turned off, and stays off', async ({ page, player }) => {
  await countSounds(page);
  await page.goto('/');
  await expect(page.locator('#meName')).toHaveText(player.username);
  const toggle = page.getByRole('button', { name: 'Sound' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveText('🔇');

  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await chooseMode(page, 'Same screen');
  await cell(page, 4).click();
  await expect(cell(page, 4)).toHaveAttribute('data-mark', 'X');
  expect((await sounds(page)).scratches).toBe(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await sounds(page)).scratches).toBeGreaterThan(0);
});

test('stars pop only for your own wins against the computer', async ({ page, player }) => {
  await page.goto('/');
  await expect(page.locator('#meName')).toHaveText(player.username);
  await chooseMode(page, 'Unbeatable');
  // Play the first free square each turn until the game ends: you can't win
  while (!(await status(page).textContent()).match(/wins|Cat's game/)) {
    if ((await status(page).textContent()).includes('Your move')) {
      await page.locator('.cell:not([data-mark]):not(:disabled)').first().click();
    }
    await page.waitForTimeout(150);
  }
  await expect(page.locator('#confetti path')).toHaveCount(0);
});
