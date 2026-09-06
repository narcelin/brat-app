-- Which of the cast a player picked. Nullable: everyone falls back to a
-- deterministic face until they choose, so a ballot never shows a blank.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_id SMALLINT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_avatar_id_range;
ALTER TABLE users ADD CONSTRAINT users_avatar_id_range
  CHECK (avatar_id IS NULL OR (avatar_id >= 1 AND avatar_id <= 8));
