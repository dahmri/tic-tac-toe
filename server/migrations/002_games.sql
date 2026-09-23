-- Game history and statistics.
--
-- games          one row per finished round (online or vs the computer)
-- player_games   one row per player per game, so "my history" is a single
--                index range scan, newest first, however many games exist
-- player_stats   running totals per player, updated in the same
--                transaction as each game, so reading stats is one row
-- head_to_head   running totals per pair of players ("against whom")

CREATE TABLE games (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mode        text        NOT NULL CHECK (mode IN ('online', 'cpu')),
  match_id    uuid,                        -- online matches only
  round       integer,                     -- round number within the match
  difficulty  text        CHECK (difficulty IN ('casual', 'hard')), -- cpu only
  x_id        bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  o_id        bigint      REFERENCES users (id) ON DELETE CASCADE, -- null: the computer
  result      char(1)     NOT NULL CHECK (result IN ('X', 'O', 'D')),
  forfeit     boolean     NOT NULL DEFAULT false,
  moves       smallint[]  NOT NULL,
  started_at  timestamptz NOT NULL,
  ended_at    timestamptz NOT NULL,
  CHECK ((mode = 'online') = (match_id IS NOT NULL AND o_id IS NOT NULL))
);

-- A round is recorded once, even if the recording is retried
CREATE UNIQUE INDEX games_match_round_key ON games (match_id, round) WHERE match_id IS NOT NULL;

CREATE TABLE player_games (
  user_id     bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ended_at    timestamptz NOT NULL,
  game_id     bigint      NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  mode        text        NOT NULL,
  symbol      char(1)     NOT NULL CHECK (symbol IN ('X', 'O')),
  outcome     char(1)     NOT NULL CHECK (outcome IN ('W', 'L', 'D')),
  opponent_id bigint      REFERENCES users (id) ON DELETE SET NULL, -- null: the computer
  PRIMARY KEY (user_id, ended_at, game_id)
);

CREATE TABLE player_stats (
  user_id          bigint  PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- online, against other players
  played           integer NOT NULL DEFAULT 0,
  won              integer NOT NULL DEFAULT 0,
  lost             integer NOT NULL DEFAULT 0,
  drawn            integer NOT NULL DEFAULT 0,
  won_as_x         integer NOT NULL DEFAULT 0,
  played_as_x      integer NOT NULL DEFAULT 0,
  won_as_o         integer NOT NULL DEFAULT 0,
  played_as_o      integer NOT NULL DEFAULT 0,
  wins_by_forfeit  integer NOT NULL DEFAULT 0,
  losses_by_forfeit integer NOT NULL DEFAULT 0,
  current_streak   integer NOT NULL DEFAULT 0, -- wins in a row, right now
  best_streak      integer NOT NULL DEFAULT 0,
  fastest_win      smallint,                   -- fewest moves on the board in a win
  -- against the computer
  cpu_played       integer NOT NULL DEFAULT 0,
  cpu_won          integer NOT NULL DEFAULT 0,
  cpu_lost         integer NOT NULL DEFAULT 0,
  cpu_drawn        integer NOT NULL DEFAULT 0,
  hard_played      integer NOT NULL DEFAULT 0,
  hard_drawn       integer NOT NULL DEFAULT 0,
  first_played_at  timestamptz,
  last_played_at   timestamptz
);

CREATE TABLE head_to_head (
  user_id        bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  opponent_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  played         integer     NOT NULL DEFAULT 0,
  won            integer     NOT NULL DEFAULT 0,
  lost           integer     NOT NULL DEFAULT 0,
  drawn          integer     NOT NULL DEFAULT 0,
  last_played_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, opponent_id)
);
