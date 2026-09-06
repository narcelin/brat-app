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

-- 1a. For every (objective group, user) pair, keep only the submission
-- with the lowest id and delete the rest. "Objective group" spans ALL
-- objectives sharing a (week_id, title) - the eventual canonical one
-- included - not just the non-canonical duplicates, because a user may
-- have a real submission on the canonical objective AND on one or more
-- duplicates; ranking across the whole group is what makes the survivor
-- unique per user before the re-point in step 1b runs. Without this, two
-- duplicate (non-canonical) submissions from the same user could each
-- independently pass a "does the canonical row already have my
-- submission?" check (evaluated against the pre-statement snapshot) and
-- both attempt to move to the canonical objective, violating
-- submissions UNIQUE (objective_id, user_id) - unique enforcement is
-- immediate, not deferred, so that would abort the migration.
WITH canonical_objective AS (
  SELECT week_id, title, MIN(id) AS canonical_id
  FROM objectives
  GROUP BY week_id, title
),
group_map AS (
  SELECT o.id AS objective_id, c.week_id, c.title, c.canonical_id
  FROM objectives o
  JOIN canonical_objective c ON c.week_id = o.week_id AND c.title = o.title
),
ranked AS (
  SELECT
    s.id AS submission_id,
    ROW_NUMBER() OVER (
      PARTITION BY gm.week_id, gm.title, s.user_id
      ORDER BY s.id
    ) AS rn
  FROM submissions s
  JOIN group_map gm ON gm.objective_id = s.objective_id
)
DELETE FROM submissions s
USING ranked r
WHERE s.id = r.submission_id
  AND r.rn > 1;

-- 1b. Exactly one submission per (objective group, user) now remains, so
-- re-pointing the survivors that sit on a non-canonical duplicate cannot
-- collide with anything: any other submission that could have collided
-- was already deleted in step 1a.
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
