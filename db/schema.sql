CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,          -- Clerk user id
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  -- Every avatar feature is derived from this one seed; null until rolled.
  avatar_seed   BIGINT CHECK (avatar_seed IS NULL OR (avatar_seed >= 0 AND avatar_seed <= 2147483647)),
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
  -- Admin override; null means this week runs on its timestamps alone.
  forced_state         TEXT CHECK (forced_state IS NULL OR forced_state IN ('SUBMITTING', 'VOTING', 'CLOSED')),
  UNIQUE (season_id, number),
  -- The rule that stops voting from overlapping submitting, enforced by the
  -- database so a bad seed can never create an unfair week.
  CHECK (drops_at < submissions_close_at AND submissions_close_at < voting_closes_at)
);

-- Two weeks in one season must never overlap. getCurrentWeek takes the most
-- recently dropped week, so an overlapping week silently shadows the earlier
-- one: its objectives unreachable for the rest of the season, nothing logged.
-- That happened once (weeks 3 and 4, fourteen minutes apart) and was repaired
-- by migration 008; this makes it impossible rather than merely fixed.
--
-- btree_gist provides the `=` operator class for season_id, scoping the
-- exclusion per season so separate seasons may overlap freely. The range is
-- half-open, so one week ending at the exact instant the next drops is
-- allowed — which is how consecutive weeks are already scheduled.
--
-- DROP then ADD because ADD CONSTRAINT has no IF NOT EXISTS, and db/apply.mjs
-- refuses the dollar-quoted DO block that would otherwise guard it.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE weeks DROP CONSTRAINT IF EXISTS weeks_no_overlap;

-- DEFERRABLE so a whole season can be rescheduled in one transaction. Weeks
-- are contiguous, so shifting the season by any amount under a week makes the
-- first moved row overlap the next unmoved one; checked immediately, every
-- reschedule fails. INITIALLY IMMEDIATE keeps ordinary bad writes failing at
-- once — only a transaction that asks for DEFERRED postpones the check.
ALTER TABLE weeks ADD CONSTRAINT weeks_no_overlap
  EXCLUDE USING gist (
    season_id WITH =,
    tstzrange(drops_at, voting_closes_at, '[)') WITH &&
  ) DEFERRABLE INITIALLY IMMEDIATE;

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

CREATE TABLE IF NOT EXISTS votes (
  id           SERIAL PRIMARY KEY,
  objective_id INTEGER NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  voter_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place        SMALLINT NOT NULL CHECK (place BETWEEN 1 AND 3),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A voter fills each place once per objective...
  UNIQUE (objective_id, voter_id, place),
  -- ...and ranks each player at most once.
  UNIQUE (objective_id, voter_id, submission_user_id),
  -- No self-voting, enforced by the database as well as the domain layer.
  CHECK (voter_id <> submission_user_id)
);

CREATE TABLE IF NOT EXISTS ratifications (
  id           SERIAL PRIMARY KEY,
  objective_id INTEGER NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  voter_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approved     BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (objective_id, voter_id)
);

CREATE INDEX IF NOT EXISTS submissions_objective_idx ON submissions(objective_id);
CREATE INDEX IF NOT EXISTS objectives_week_idx ON objectives(week_id);
CREATE INDEX IF NOT EXISTS votes_objective_idx ON votes(objective_id);
CREATE INDEX IF NOT EXISTS ratifications_objective_idx ON ratifications(objective_id);
