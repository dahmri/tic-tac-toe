-- The vanish variant, a Medium computer, and what a replay needs.
--
-- variant  'classic' or 'vanish' (each player keeps only three marks)
-- starter  who made the first move, so a game can be replayed. Games saved
--          before this didn't store it: it's worked out from the winner
--          (who made the last move), and taken to be X for draws and
--          forfeits, where it can't be known.

ALTER TABLE games
  ADD COLUMN variant text NOT NULL DEFAULT 'classic' CHECK (variant IN ('classic', 'vanish')),
  ADD COLUMN starter char(1) CHECK (starter IN ('X', 'O'));

UPDATE games SET starter = CASE
  WHEN result IN ('X', 'O') AND NOT forfeit THEN
    CASE WHEN cardinality(moves) % 2 = 1 THEN result
         WHEN result = 'X' THEN 'O' ELSE 'X' END
  ELSE 'X' END;

ALTER TABLE games ALTER COLUMN starter SET NOT NULL;

ALTER TABLE games DROP CONSTRAINT games_difficulty_check;
ALTER TABLE games ADD CONSTRAINT games_difficulty_check
  CHECK (difficulty IN ('casual', 'medium', 'hard'));
