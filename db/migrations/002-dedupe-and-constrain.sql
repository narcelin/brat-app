-- One-time cleanup + constraint retrofit for pre-existing databases that were
-- created before db/schema.sql gained UNIQUE(seasons.name), UNIQUE
-- (objectives.week_id, title), and the single-active-season partial index.
--
-- CREATE TABLE IF NOT EXISTS is a silent no-op against a table that already
-- exists, so re-running db/schema.sql never retrofits these constraints onto
-- a live database. This file does that retrofit by hand, and is written so
-- it is safe to run more than once (every statement either uses IF NOT
-- EXISTS or naturally does nothing once the data is already deduplicated).
--
-- Order matters:
--   1. Objectives are deduplicated first, keeping the lowest id per
--      (week_id, title). submissions.objective_id is ON DELETE CASCADE, so
--      any submission sitting on a duplicate objective is re-pointed to the
--      surviving canonical objective BEFORE the duplicate is deleted -
--      otherwise the cascade would silently destroy real submissions.
--   2. Seasons are deduplicated next, keeping the lowest id per name.
--      weeks.season_id is re-pointed to the surviving season BEFORE the
--      duplicate season rows are deleted, for the same cascade-safety
--      reason.
--   3. Any season left with is_active = true that is not the
--      lowest-id active season is deactivated, so "at most one active
--      season" holds before the partial unique index below is created.
--   4. The unique constraints/indexes themselves are added last, via
--      CREATE UNIQUE INDEX IF NOT EXISTS (functionally equivalent to a
--      named UNIQUE constraint for both future ON CONFLICT targets and
--      this retrofit) rather than ALTER TABLE ... ADD CONSTRAINT, because
--      Postgres has no ADD CONSTRAINT IF NOT EXISTS for table constraints -
--      this keeps every statement idempotent without a dollar-quoted DO
--      block, which db/apply.mjs refuses to run.

-- 1a. Re-point submissions that would NOT collide with an existing
-- submission on the canonical objective for the same user.
WITH canonical_objective AS (
  SELECT week_id, title, MIN(id) AS canonical_id
  FROM objectives
  GROUP BY week_id, title
)
UPDATE submissions s
SET objective_id = c.canonical_id
FROM objectives o, canonical_objective c
WHERE s.objective_id = o.id
  AND o.week_id = c.week_id
  AND o.title = c.title
  AND o.id <> c.canonical_id
  AND NOT EXISTS (
    SELECT 1 FROM submissions s2
    WHERE s2.objective_id = c.canonical_id AND s2.user_id = s.user_id
  );

-- 1b. Any submission that DOES collide (same user already has a submission
-- on the canonical objective) is dropped in favor of the canonical one,
-- rather than left to be destroyed non-deterministically by the delete
-- below or to block it with a unique-constraint violation.
WITH canonical_objective AS (
  SELECT week_id, title, MIN(id) AS canonical_id
  FROM objectives
  GROUP BY week_id, title
)
DELETE FROM submissions s
USING objectives o, canonical_objective c
WHERE s.objective_id = o.id
  AND o.week_id = c.week_id
  AND o.title = c.title
  AND o.id <> c.canonical_id;

-- 1c. Now safe to delete duplicate objectives - no submission references a
-- non-canonical objective row any more.
WITH canonical_objective AS (
  SELECT week_id, title, MIN(id) AS canonical_id
  FROM objectives
  GROUP BY week_id, title
)
DELETE FROM objectives o
USING canonical_objective c
WHERE o.week_id = c.week_id
  AND o.title = c.title
  AND o.id <> c.canonical_id;

-- 2a. Re-point weeks off duplicate-named seasons onto the surviving
-- canonical (lowest id) season before those duplicates are deleted.
WITH canonical_season AS (
  SELECT name, MIN(id) AS canonical_id
  FROM seasons
  GROUP BY name
)
UPDATE weeks w
SET season_id = cs.canonical_id
FROM seasons s, canonical_season cs
WHERE w.season_id = s.id
  AND s.name = cs.name
  AND s.id <> cs.canonical_id;

-- 2b. Now safe to delete duplicate-named seasons.
WITH canonical_season AS (
  SELECT name, MIN(id) AS canonical_id
  FROM seasons
  GROUP BY name
)
DELETE FROM seasons s
USING canonical_season cs
WHERE s.name = cs.name
  AND s.id <> cs.canonical_id;

-- 3. At most one active season: keep the lowest-id active season, deactivate
-- any others (covers the case where distinctly-named seasons were both left
-- active - dedup by name alone would not catch that).
UPDATE seasons s
SET is_active = false
WHERE s.is_active = true
  AND s.id <> (SELECT MIN(id) FROM seasons WHERE is_active = true);

-- 4. Retrofit the constraints. CREATE UNIQUE INDEX IF NOT EXISTS is
-- idempotent on its own and works as an ON CONFLICT target exactly like a
-- named UNIQUE constraint would.
CREATE UNIQUE INDEX IF NOT EXISTS seasons_name_key ON seasons (name);

CREATE UNIQUE INDEX IF NOT EXISTS objectives_week_id_title_key ON objectives (week_id, title);

CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active ON seasons ((is_active)) WHERE is_active;
