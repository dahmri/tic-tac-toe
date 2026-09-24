// Seasons: ratings run by calendar month (UTC). Everyone starts each
// season at 1200; the leaderboard shows the current one, and the podium of
// the last. A season is named by its month: '2026-09'.

export const seasonOf = (date = new Date()) => date.toISOString().slice(0, 7);

export function previousSeason(season) {
  const [y, m] = season.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

// When the season ends (the first moment of the next month, UTC)
export function seasonEnd(season) {
  const [y, m] = season.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1));
}

// "September 2026", in the page's language
export const seasonName = (season, lang) =>
  new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${season}-01T00:00:00Z`),
  );
