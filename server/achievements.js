// Works out a player's achievements (js/achievements.js) from their stats,
// friends, daily puzzles and seasons.

import { ACHIEVEMENTS } from '../js/achievements.js';
import { dayKey } from '../js/puzzle.js';

export function createAchievements({ db, stats, friends, puzzles }) {
  return {
    async of(userId, now = new Date()) {
      const [row, friendIds, puzzle, medals, vanish] = await Promise.all([
        db.query('SELECT * FROM player_stats WHERE user_id = $1', [userId]).then((r) => r.rows[0]),
        friends.ids(userId),
        puzzles.stats(userId, dayKey(now)),
        stats.medals(userId, now),
        db.query(
          `SELECT 1 FROM games WHERE x_id = $1 AND mode = 'cpu' AND variant = 'vanish'
             AND difficulty = 'hard' AND result = 'X' LIMIT 1`,
          [userId],
        ),
      ]);
      const z = (k) => row?.[k] ?? 0;
      // Progress towards each: [how far, done?]
      const progress = {
        first_win: [0, z('won') + z('cpu_won') > 0],
        online_win: [0, z('won') > 0],
        streak_3: [z('best_streak'), z('best_streak') >= 3],
        streak_10: [z('best_streak'), z('best_streak') >= 10],
        games_100: [z('played') + z('cpu_played'), z('played') + z('cpu_played') >= 100],
        unbeatable_draw: [0, z('hard_drawn') > 0],
        vanish_hard_win: [0, vanish.rows.length > 0],
        puzzle_first: [0, puzzle.totalSolved > 0],
        puzzle_7: [puzzle.bestStreak, puzzle.bestStreak >= 7],
        friends_5: [friendIds.length, friendIds.length >= 5],
        rating_1400: [0, z('peak_rating') >= 1400],
        podium: [0, medals.length > 0],
      };
      return ACHIEVEMENTS.map((a) => {
        const [count, earned] = progress[a.id];
        return a.goal ? { id: a.id, earned, count: Math.min(count, a.goal) } : { id: a.id, earned };
      });
    },
  };
}
