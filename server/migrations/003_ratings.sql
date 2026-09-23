-- Skill ratings (see server/rating.js) and the leaderboard.
--
-- Everyone starts at 1200, including players who had already played:
-- ratings only move from online rounds played from now on.

ALTER TABLE player_stats
  ADD COLUMN rating      integer NOT NULL DEFAULT 1200,
  ADD COLUMN peak_rating integer NOT NULL DEFAULT 1200;

-- Points won or lost in each online round, for the history
ALTER TABLE player_games ADD COLUMN rating_change smallint;

-- The leaderboard, and a player's rank, walk this index: only players who
-- have played online are ranked
CREATE INDEX player_stats_rating_idx ON player_stats (rating DESC, user_id) WHERE played > 0;
