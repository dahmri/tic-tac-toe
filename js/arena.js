// The weekly arena: every Saturday, 18:00 to 20:00 UTC, players who join
// are paired again and again, one classic game at a time, and score points:
// 2 for a win, 1 for a draw. Most points at the end wins.
// Shared by the server (server/arena.js) and the page (arena-ui.js).

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const ARENA_WEEKDAY = 6; // Saturday (0 is Sunday), in UTC
export const ARENA_START_HOUR = 18; // UTC
export const ARENA_HOURS = 2;
export const POINTS = { W: 2, D: 1, L: 0 };

const dayId = (ms) => new Date(ms).toISOString().slice(0, 10);

// The arena on at `now`, or else the next one:
// { id: 'YYYY-MM-DD', startsAt, endsAt (ms), running }. With `always`
// (tests only) one runs all day, every day.
export function arenaAt(now = Date.now(), always = false) {
  const d = new Date(now);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let startsAt;
  let endsAt;
  if (always) {
    startsAt = today;
    endsAt = today + DAY;
  } else {
    const ahead = (ARENA_WEEKDAY - d.getUTCDay() + 7) % 7;
    startsAt = today + ahead * DAY + ARENA_START_HOUR * HOUR;
    endsAt = startsAt + ARENA_HOURS * HOUR;
    // This week's is over: next week's
    if (now >= endsAt) {
      startsAt += 7 * DAY;
      endsAt += 7 * DAY;
    }
  }
  return { id: dayId(startsAt), startsAt, endsAt, running: now >= startsAt && now < endsAt };
}

// The id of the arena before this one
export const previousArena = (arena, always = false) =>
  dayId(arena.startsAt - (always ? DAY : 7 * DAY));
