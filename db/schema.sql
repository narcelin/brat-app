CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,          -- Clerk user id
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  -- Which of the cast the player picked; null until they choose.
  avatar_id     SMALLINT CHECK (avatar_id IS NULL OR (avatar_id >= 1 AND avatar_id <= 8)),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seasons (
  id         SERIAL PRIMARY KEY,
  -- UNIQUE so the seed's ON CONFLICT DO NOTHING has something to conflict on.
  -- Without it the seed is not idempotent and re-running duplicates rows.
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT false
);

-- At most one active season. getCurrentWeek picks "the latest dropped week of
-- the active season"; with two active seasons that choice is arbitrary.
CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active
  ON seasons ((is_active)) WHERE is_active;

CREATE TABLE IF NOT EXISTS weeks (
  id                   SERIAL PRIMARY KEY,
  season_id            INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  number               INTEGER NOT NULL,
  drops_at             TIMESTAMPTZ NOT NULL,
  submissions_close_at TIMESTAMPTZ NOT NULL,
  voting_closes_at     TIMESTAMPTZ NOT NULL,
  UNIQUE (season_id, number),
  -- The rule that stops voting from overlapping submitting, enforced by the
  -- database so a bad seed can never create an unfair week.
  CHECK (drops_at < submissions_close_at AND submissions_close_at < voting_closes_at)
);

CREATE TABLE IF NOT EXISTS objectives (
  id          SERIAL PRIMARY KEY,
  week_id     INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tier        TEXT NOT NULL CHECK (tier IN ('easy', 'hard', 'unhinged')),
  -- Same reason as seasons.name: makes the seed genuinely idempotent.
  UNIQUE (week_id, title)
);

CREATE TABLE IF NOT EXISTS submissions (
  id           SERIAL PRIMARY KEY,
  objective_id INTEGER NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url    TEXT NOT NULL,
  media_pathname TEXT,
  media_type   TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  duration_seconds  REAL,
  trim_start        REAL,
  trim_end          REAL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One entry per player per objective; re-submitting replaces.
  UNIQUE (objective_id, user_id),
  -- Photos carry no trim; videos must carry a complete, ordered one.
  CHECK (
    (media_type = 'photo' AND trim_start IS NULL AND trim_end IS NULL)
    OR
    (media_type = 'video' AND trim_start IS NOT NULL AND trim_end IS NOT NULL
     AND trim_start >= 0 AND trim_end > trim_start
     AND trim_end - trim_start <= 15
     AND duration_seconds IS NOT NULL AND duration_seconds <= 60
     -- Mirrors validateTrim's "trim end must not run past the end of the
     -- recording". Without this the database is looser than the domain rule.
     AND trim_end <= duration_seconds)
  )
);

CREATE INDEX IF NOT EXISTS submissions_objective_idx ON submissions(objective_id);
CREATE INDEX IF NOT EXISTS objectives_week_idx ON objectives(week_id);
