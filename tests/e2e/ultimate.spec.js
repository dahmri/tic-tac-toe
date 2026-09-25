import { test, expect, chooseMode, status } from './fixtures.js';

test.use({ signedIn: false });

const square = (page, i) => page.locator('#uboard .usq').nth(i);
const mini = (page, b) => page.locator('#uboard .umini').nth(b);

test('Ultimate against the computer: the move sends the reply to that board', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Play as a guest/ }).click();
  await page.getByRole('button', { name: 'Ultimate' }).click();
  await expect(page.locator('#board')).toBeHidden();
  await expect(page.locator('#uboard .usq')).toHaveCount(81);
  await expect(page.locator('#ruleNote')).toContainText('Win three small boards in a row');
  await expect(page.locator('#diff-hard')).toHaveText('Hard');

  // X plays the centre board's top-right square: O must answer in board 2
  await square(page, 4 * 9 + 2).click();
  await expect(square(page, 4 * 9 + 2)).toHaveAttribute('data-mark', 'X');
  await expect(status(page)).toContainText('Your move');
  const oSquares = await page
    .locator('#uboard .usq[data-mark="O"]')
    .evaluateAll((els) =>
      els.map((el) => [...el.parentElement.parentElement.children].indexOf(el.parentElement)),
    );
  expect(oSquares).toEqual([2]);

  // Now only one board is open to X, highlighted
  await expect(page.locator('#uboard .umini.active')).toHaveCount(1);
  const open = await page.locator('#uboard .usq:not(:disabled)').count();
  expect(open).toBeLessThanOrEqual(9);

  // The hint picks a legal square
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.locator('#uboard .usq.hinted:not(:disabled)')).toHaveCount(1);
});

test('Ultimate on the same screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Play as a guest/ }).click();
  await chooseMode(page, 'Same screen');
  await page.getByRole('button', { name: 'Ultimate' }).click();
  await square(page, 0).click();
  await expect(status(page)).toContainText('O to play');
  await expect(mini(page, 0)).toHaveClass(/active/);
  await expect(square(page, 80)).toBeDisabled();
});
