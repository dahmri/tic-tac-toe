-- Blocking and reporting players.
--
-- blocks   one row per block, one way; its effects go both ways: neither
--          player can invite the other, quick match never pairs them, and
--          they don't see each other in the lobby. Redis mirrors it for
--          matchmaking (avoid:<id>, see server/safety.js).
-- reports  a player's report about another, for whoever runs the site

CREATE TABLE blocks (
  user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_id),
  CHECK (user_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);

CREATE TABLE reports (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporter_id bigint      REFERENCES users (id) ON DELETE SET NULL,
  reported_id bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason      text        NOT NULL CHECK (reason IN ('username', 'cheating', 'harassment', 'other')),
  details     text        NOT NULL DEFAULT '' CHECK (length(details) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  handled_at  timestamptz
);
CREATE INDEX reports_open_idx ON reports (created_at) WHERE handled_at IS NULL;
