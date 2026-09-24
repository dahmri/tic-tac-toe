import { test, expect, closePlayers, startMatch } from './fixtures.js';

test('the move clock counts down, and reactions pop up for both players', async ({ browser }) => {
  const { ann, bob } = await startMatch(browser);
  await expect(ann.page.locator('#turnClock')).toContainText(/Your time: \d+s/);
  await expect(bob.page.locator('#turnClock')).toContainText(`${ann.player.username}'s time`);

  await bob.page.getByRole('button', { name: 'React 😂' }).click();
  await expect(ann.page.locator('#reactionFeed .bubble.theirs')).toHaveText('😂');
  await expect(bob.page.locator('#reactionFeed .bubble.mine')).toHaveText('😂');
  await expect(ann.page.locator('#reactionSaid')).toHaveText(`${bob.player.username}: 😂`);
  await closePlayers(ann, bob);
});
