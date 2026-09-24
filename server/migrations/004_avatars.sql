-- Avatars: every player picks one when signing up (ids from js/avatars.js).
--
-- Players who signed up before avatars existed get the T-Rex; they can
-- change it in their profile. New accounts must always name one.

ALTER TABLE users ADD COLUMN avatar text NOT NULL DEFAULT 'dino'
  CHECK (avatar ~ '^[a-z]{2,20}$');
ALTER TABLE users ALTER COLUMN avatar DROP DEFAULT;
