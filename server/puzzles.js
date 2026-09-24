// Daily puzzle results and streaks (migrations/009_puzzles.sql). The
// puzzle itself is generated from the day (js/puzzle.js), and every
// attempt is checked here, not taken from the browser.

import { checkAttempt, puzzleFor, shiftDay as shift, streaks } from '../js/puzzle.js';

// Players' days follow their own clock: accept the server's day, give or
// take one, so every time zone works
export function isPlayableDay(day, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return day === today || day === shift(today, -1) || day === shift(today, 1);
}

export function createPuzzles(db) {
  async function stats(userId, day) {
    const { rows } = await db.query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, solved FROM puzzle_results
       WHERE user_id = $1 ORDER BY day DESC`,
      [userId],
    );
    const solvedDays = rows.filter((r) => r.solved).map((r) => r.day);
    const today = rows.find((r) => r.day === day);
    const { current, best } = streaks(solvedDays, day);
    return {
      played: !!today,
      solved: today?.solved ?? false,
      streak: current,
      bestStreak: best,
      totalSolved: solvedDays.length,
    };
  }

  return {
    stats,

    // Records the first try at `day`'s puzzle; later tries change nothing
    async record(userId, day, moves) {
      const { solved } = checkAttempt(puzzleFor(day), moves);
      await db.query(
        `INSERT INTO puzzle_results (user_id, day, solved, moves) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, day) DO NOTHING`,
        [userId, day, solved, moves.slice(0, 3)],
      );
      return { attemptSolved: solved, ...(await stats(userId, day)) };
    },
  };
}
