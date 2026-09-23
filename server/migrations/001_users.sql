-- Player accounts.
--
-- Only what the game needs to look things up is stored in plain form: the
-- username (unique, for login) and the country (to filter online players).
-- First name, last name, date of birth and phone number are encrypted
-- together in `pii` with AES-256-GCM by the server (see server/security.js),
-- so a leaked database dump or backup does not expose them.

CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      text        NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'),
  country       char(2)     NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  pii           bytea       NOT NULL,
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Usernames are unique regardless of case: "Alice" and "alice" are the same player
CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));
