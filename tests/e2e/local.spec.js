import { test, expect, cell, status, chooseMode } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('vs computer: the computer answers each move', async ({ page }) => {
  await expect(status(page)).toContainText('Your move');
  await cell(page, 4).click();
  await expect(page.locator('.cell[data-mark="O"]')).toHaveCount(1);
  await expect(status(page)).toContainText('Your move');
});

test('unbeatable computer blocks a winning threat', async ({ page }) => {
  await chooseMode(page, 'Unbeatable');
  await cell(page, 0).click();
  // Against a corner opening, the center is the only reply that doesn't lose
  await expect(cell(page, 4)).toHaveAttribute('data-mark', 'O');
  await cell(page, 1).click();
  await expect(cell(page, 2)).toHaveAttribute('data-mark', 'O');
});

test('same screen: X wins the top row and scores a point', async ({ page }) => {
  await chooseMode(page, 'Same screen');
  for (const i of [0, 3, 1, 4, 2]) await cell(page, i).click();
  await expect(status(page)).toContainText('X wins!');
  await expect(page.locator('#tX svg')).toHaveCount(1);
  await expect(cell(page, 5)).toBeDisabled();
});

test('same screen: a full board with no line is a draw', async ({ page }) => {
  await chooseMode(page, 'Same screen');
  // X O X / X O O / O X X
  for (const i of [0, 1, 2, 4, 3, 5, 7, 6, 8]) await cell(page, i).click();
  await expect(status(page)).toContainText("Cat's game");
  await expect(page.locator('#tD svg')).toHaveCount(1);
});

test('keyboard: number keys play squares in keypad layout', async ({ page }) => {
  await chooseMode(page, 'Same screen');
  await page.keyboard.press('7');
  await page.keyboard.press('5');
  await expect(cell(page, 0)).toHaveAttribute('data-mark', 'X');
  await expect(cell(page, 4)).toHaveAttribute('data-mark', 'O');
});

test('new round clears the board and scores survive a reload', async ({ page }) => {
  await chooseMode(page, 'Same screen');
  for (const i of [0, 3, 1, 4, 2]) await cell(page, i).click();
  await page.getByRole('button', { name: 'New round' }).click();
  await expect(page.locator('.cell[data-mark]')).toHaveCount(0);
  // O opens the second round
  await expect(status(page)).toContainText('O to play');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Same screen' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#tX svg')).toHaveCount(1);
});
