import { test, expect, cell, chooseMode, status } from './fixtures.js';

test.use({ signedIn: false });

test('after a loss, "Why did I lose?" shows the mistake and the move that held', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Play as a guest/ }).click();
  await chooseMode(page, 'Unbeatable');
  await expect(page.getByRole('button', { name: /Why did I lose/ })).toBeHidden();

  // X 0, O 4, X 1, O 2 (a block), X 3 (the mistake: O wins at 6)
  for (const i of [0, 1, 3]) {
    await expect(status(page)).toContainText('Your move');
    await cell(page, i).click();
  }
  await expect(status(page)).toContainText('Computer wins');

  await page.getByRole('button', { name: /Why did I lose/ }).click();
  const replay = page.getByRole('dialog', { name: 'Replay' });
  await expect(replay.locator('#replayNote')).toHaveText(
    /^Move \d: row \d, column \d lost the game\. Row \d, column \d would have held the draw\.$/,
  );
  await expect(replay.locator('.cell.mistake')).toHaveCount(1);
  await expect(replay.locator('.cell.hinted')).not.toHaveCount(0);
});
