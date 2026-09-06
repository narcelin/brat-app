-- One integer replaces the fixed cast: every feature is derived from it, so
-- "roll again" is just a new number and validation is a range check.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_seed BIGINT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_avatar_seed_range;
ALTER TABLE users ADD CONSTRAINT users_avatar_seed_range
  CHECK (avatar_seed IS NULL OR (avatar_seed >= 0 AND avatar_seed <= 2147483647));

-- The eight presets no longer exist, so a stored preset id means nothing.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_avatar_id_range;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_id;
