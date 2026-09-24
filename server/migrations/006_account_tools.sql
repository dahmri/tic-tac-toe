-- Recovery codes, and deleting accounts.
--
-- recovery_hash  SHA-256 of the player's recovery code (100 random bits),
--                which resets a forgotten password. Null until they have one.
--
-- When a player deletes their account, their online games stay in their
-- opponents' histories with the player shown as "Deleted player": the
-- game's player columns become null instead of the game disappearing.
-- Their games against the computer are deleted with them (server/users.js).

ALTER TABLE users ADD COLUMN recovery_hash text;

ALTER TABLE games ALTER COLUMN x_id DROP NOT NULL;
ALTER TABLE games DROP CONSTRAINT games_x_id_fkey;
ALTER TABLE games ADD CONSTRAINT games_x_id_fkey
  FOREIGN KEY (x_id) REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE games DROP CONSTRAINT games_o_id_fkey;
ALTER TABLE games ADD CONSTRAINT games_o_id_fkey
  FOREIGN KEY (o_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE games DROP CONSTRAINT games_check;
ALTER TABLE games ADD CONSTRAINT games_check CHECK ((mode = 'online') = (match_id IS NOT NULL));
