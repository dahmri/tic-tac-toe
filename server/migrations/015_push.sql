-- Web push subscriptions (server/push.js): one per browser a player turned
-- notifications on in. `lang` is the page's language, for the text.
-- Subscriptions the push service says are gone are deleted.

CREATE TABLE push_subscriptions (
  endpoint   text        PRIMARY KEY CHECK (length(endpoint) <= 1000),
  user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  p256dh     text        NOT NULL CHECK (length(p256dh) <= 200),
  auth       text        NOT NULL CHECK (length(auth) <= 100),
  lang       text        NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);
