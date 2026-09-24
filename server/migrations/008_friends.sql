-- Friends: players someone saved to find and invite easily. One way, like
-- a bookmark: adding a friend asks nothing of them.

CREATE TABLE friends (
  user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  friend_id  bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
