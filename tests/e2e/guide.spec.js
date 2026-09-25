import { test, expect } from './fixtures.js';

test.use({ signedIn: false });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as a guest' }).click();
});

const square = (dialog, row, col) =>
  dialog.getByRole('button', { name: new RegExp(`^Row ${row}, column ${col}:`) });

test('the 3-mark guide: place a third mark, then win as the oldest vanishes', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'How to play' })).toBeHidden();
  await page.getByRole('button', { name: '3 marks' }).click();
  await page.getByRole('button', { name: 'How to play' }).click();

  const dialog = page.getByRole('dialog', { name: 'How to play: 3 marks' });
  await expect(dialog.locator('#guideStep')).toHaveText('Step 1 of 5');
  await dialog.getByRole('button', { name: 'Next' }).click();

  const next = dialog.getByRole('button', { name: 'Next' });
  await expect(next).toBeDisabled();
  await expect(square(dialog, 1, 1)).toBeDisabled(); // taken
  await square(dialog, 3, 2).click();
  await expect(dialog.locator('#guideMsg')).toHaveText(
    'Not that one: look for the highlighted square.',
  );
  await square(dialog, 3, 1).click();
  await expect(dialog.locator('#guideText')).toContainText('each new one wipes out your oldest');
  await next.click();
  await expect(dialog.locator('.cell.fading')).toHaveCount(1);
  await next.click();
  await square(dialog, 3, 2).click();
  await expect(dialog.locator('#guideText')).toHaveText('Three in a row: you win!');
  await expect(square(dialog, 1, 1)).toHaveAttribute('data-mark', '');
  await next.click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
});

test('the Ultimate guide: sent from board to board, then a free move', async ({ page }) => {
  await page.getByRole('button', { name: 'Ultimate' }).click();
  await page.getByRole('button', { name: 'How to play' }).click();
  const dialog = page.getByRole('dialog', { name: 'How to play: Ultimate' });
  const next = dialog.getByRole('button', { name: 'Next' });
  const sq = (b, c) => dialog.getByRole('button', { name: `Board ${b}, square ${c}: empty` });

  await next.click();
  await sq(1, 5).click();
  await expect(dialog.locator('#guideText')).toContainText('sends O to the centre board');
  await next.click();
  await sq(1, 3).click();
  await next.click();
  await sq(1, 7).click();
  await expect(dialog.locator('#guideText')).toHaveText(
    'Three in a row: the top-left board is yours!',
  );
  await next.click();
  await sq(9, 9).click(); // anywhere open
  await expect(dialog.locator('#guideText')).toContainText('belongs to nobody');
  await expect(next).toBeEnabled();
  await dialog.getByRole('button', { name: 'Back' }).click();
  await expect(dialog.locator('#guideStep')).toHaveText('Step 4 of 6');
  await dialog.getByRole('button', { name: 'Close' }).click();
});
