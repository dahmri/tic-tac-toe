// Skill ratings (Elo). Every player starts at 1200. After each online
// round both players' ratings move by the same number of points in
// opposite directions: beating a stronger player earns more than beating a
// weaker one, and losing to a weaker player costs more.

export const START_RATING = 1200;
const K = 32; // the most one round can move a rating

// The chance that a player rated `a` beats one rated `b` (0 to 1)
export function expectedScore(a, b) {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

// Points gained by the player rated `a` (negative for a loss); the other
// player loses exactly as many. `score`: 1 win, 0.5 draw, 0 loss.
export function ratingChange(a, b, score) {
  return Math.round(K * (score - expectedScore(a, b)));
}
