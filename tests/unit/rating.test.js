import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedScore, ratingChange, START_RATING } from '../../server/rating.js';

test('equal players are expected to score evenly', () => {
  assert.equal(expectedScore(START_RATING, START_RATING), 0.5);
  assert.equal(ratingChange(1200, 1200, 1), 16);
  assert.equal(ratingChange(1200, 1200, 0), -16);
  assert.equal(ratingChange(1200, 1200, 0.5), 0);
});

test('beating a stronger player earns more than beating a weaker one', () => {
  const upset = ratingChange(1200, 1600, 1);
  const expected = ratingChange(1600, 1200, 1);
  assert.ok(upset > 16 && upset <= 32, `upset gave ${upset}`);
  assert.ok(expected >= 0 && expected < 16, `expected win gave ${expected}`);
  // A draw moves the weaker player up and the stronger one down
  assert.ok(ratingChange(1200, 1600, 0.5) > 0);
  assert.ok(ratingChange(1600, 1200, 0.5) < 0);
});

test('a round never moves a rating by more than 32 points', () => {
  for (const [a, b] of [
    [100, 3000],
    [3000, 100],
    [1200, 1200],
  ]) {
    for (const score of [0, 0.5, 1]) {
      assert.ok(Math.abs(ratingChange(a, b, score)) <= 32);
    }
  }
});

test('the points one player wins are the points the other loses', () => {
  for (const [a, b] of [
    [1200, 1350],
    [1510, 1190],
  ]) {
    for (const score of [0, 0.5, 1]) {
      // Recording uses -change for the other player, so this only has to
      // match up to rounding: the other player's own view agrees within a point
      assert.ok(Math.abs(ratingChange(a, b, score) + ratingChange(b, a, 1 - score)) <= 1);
    }
  }
});
