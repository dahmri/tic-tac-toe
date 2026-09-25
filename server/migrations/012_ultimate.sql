-- Ultimate tic-tac-toe (js/ultimate.js): a third set of rules. Its moves
-- are squares 0-80 of the big board.

ALTER TABLE games DROP CONSTRAINT games_variant_check;
ALTER TABLE games ADD CONSTRAINT games_variant_check
  CHECK (variant IN ('classic', 'vanish', 'ultimate'));
