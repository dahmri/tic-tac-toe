-- The weekly arena (js/arena.js, server/arena.js): each player's score in
-- each arena. `arena` is the day it ran (YYYY-MM-DD).

CREATE TABLE arena_players (
  arena     text        NOT NULL,
  user_id   bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  points    integer     NOT NULL DEFAULT 0,
  played    integer     NOT NULL DEFAULT 0,
  won       integer     NOT NULL DEFAULT 0,
  drawn     integer     NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (arena, user_id)
);
CREATE INDEX arena_players_standings_idx ON arena_players (arena, points DESC, won DESC, user_id);
