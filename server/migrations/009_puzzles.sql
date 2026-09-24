-- Daily puzzles (js/puzzle.js): each player's first try at each day's
-- puzzle. Later tries are practice and aren't stored.

CREATE TABLE puzzle_results (
  user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day        date        NOT NULL,
  solved     boolean     NOT NULL,
  moves      smallint[]  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
