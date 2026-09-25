-- Running the site: admins, suspensions, and a record of what admins did.
--
-- role             'player', or 'admin' (set with npm run make-admin)
-- suspended_until  no logging in before then; far in the future for "until
--                  further notice"
-- reports.outcome  what was done about a report: dismissed, renamed,
--                  suspended or deleted
-- admin_log        every admin action, with the player's name at the time

ALTER TABLE users
  ADD COLUMN role text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  ADD COLUMN suspended_until timestamptz;

ALTER TABLE reports
  ADD COLUMN outcome text CHECK (outcome IN ('dismissed', 'renamed', 'suspended', 'deleted'));

CREATE TABLE admin_log (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id   bigint      REFERENCES users (id) ON DELETE SET NULL,
  action     text        NOT NULL,
  player     text        NOT NULL,
  details    text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_log_created_idx ON admin_log (created_at DESC);
