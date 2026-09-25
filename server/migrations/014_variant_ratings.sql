-- A rating for each set of rules (classic, vanish, ultimate): being good at
-- one says little about the others. Each has its own seasons, leaderboard
-- and podiums, and matchmaking pairs players by the rating for the rules
-- they chose.
--
-- player_ratings  one row per player per rules they've played online:
--                 rating in `season`, best ever, and the season's totals
-- season_results  now per rules too
--
-- The ratings so far become the classic ones (most games were classic).
-- player_stats keeps peak_rating: the best rating in any rules.

CREATE TABLE player_ratings (
  user_id       bigint  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  variant       text    NOT NULL CHECK (variant IN ('classic', 'vanish', 'ultimate')),
  rating        integer NOT NULL DEFAULT 1200,
  peak_rating   integer NOT NULL DEFAULT 1200,
  season        text    NOT NULL,
  season_played integer NOT NULL DEFAULT 0,
  season_won    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, variant)
);

-- The leaderboards walk this
CREATE INDEX player_ratings_board_idx
  ON player_ratings (variant, season, rating DESC, user_id) WHERE season_played > 0;

INSERT INTO player_ratings (user_id, variant, rating, peak_rating, season, season_played,
  season_won)
SELECT user_id, 'classic', rating, peak_rating, season, season_played, season_won
FROM player_stats WHERE played > 0;

ALTER TABLE season_results ADD COLUMN variant text NOT NULL DEFAULT 'classic'
  CHECK (variant IN ('classic', 'vanish', 'ultimate'));
ALTER TABLE season_results DROP CONSTRAINT season_results_pkey;
ALTER TABLE season_results ADD PRIMARY KEY (season, variant, user_id);
ALTER TABLE season_results ALTER COLUMN variant DROP DEFAULT;

DROP INDEX player_stats_season_rating_idx;
ALTER TABLE player_stats
  DROP COLUMN rating,
  DROP COLUMN season,
  DROP COLUMN season_played,
  DROP COLUMN season_won;
