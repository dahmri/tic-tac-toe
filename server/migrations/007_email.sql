-- Email addresses, confirmed by a link sent to them.
--
-- The address itself is personal data: it is sealed in `pii` with the
-- rest. `email_hash` (an HMAC of the lowercased address, keyed with
-- DATA_ENCRYPTION_KEY) keeps addresses unique without storing them in
-- plain form. Players who signed up before emails existed have none until
-- they add one.

ALTER TABLE users
  ADD COLUMN email_hash text,
  ADD COLUMN email_verified_at timestamptz;

CREATE UNIQUE INDEX users_email_hash_key ON users (email_hash) WHERE email_hash IS NOT NULL;
