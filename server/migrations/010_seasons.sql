-- Seasons (js/seasons.js): ratings run by calendar month. `rating` is now
-- the rating in `season`; a player's first rated game of a new season
-- archives the old one in season_results and starts again from 1200
-- (server/stats.js). peak_rating stays the best ever.
--
-- The season this runs in starts with everyone's rating and totals so far.

ALTER TABLE player_stats
  ADD COLUMN season        text    NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'),
  ADD COLUMN season_played integer NOT NULL DEFAULT 0,
  ADD COLUMN season_won    integer NOT NULL DEFAULT 0;

UPDATE player_stats SET season_played = played, season_won = won;

-- Final ratings of past seasons, for podiums and medals
CREATE TABLE season_results (
  season  text    NOT NULL,
  user_id bigint  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating  integer NOT NULL,
  played  integer NOT NULL,
  won     integer NOT NULL,
  PRIMARY KEY (season, user_id)
);

-- The leaderboard walks the current season's ratings
DROP INDEX player_stats_rating_idx;
CREATE INDEX player_stats_season_rating_idx
  ON player_stats (season, rating DESC, user_id) WHERE season_played > 0;
