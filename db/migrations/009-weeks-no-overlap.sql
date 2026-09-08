-- Makes the week 3 / week 4 collision impossible rather than merely fixed.
--
-- Two weeks in a season overlapping is never valid: getCurrentWeek picks the
-- most recently dropped week, so the later one silently shadows the earlier —
-- its objectives unreachable, nothing logged, no error. See migration 008,
-- which repaired exactly that. A bad date should fail loudly at write time.
--
-- btree_gist supplies the `=` operator class for season_id, so the exclusion
-- can be scoped per season: weeks in DIFFERENT seasons may overlap freely,
-- which matters if a season ever runs long or two are staged at once.
--
-- The range is half-open, [drops_at, voting_closes_at), so one week ending at
-- the exact instant the next drops is allowed — which is how weeks 2 and 3
-- are already scheduled.
--
-- Written as DROP IF EXISTS then ADD so re-applying is safe. db/apply.mjs
-- refuses dollar-quoted blocks, so a DO ... IF NOT EXISTS guard is not
-- available here.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE weeks DROP CONSTRAINT IF EXISTS weeks_no_overlap;

ALTER TABLE weeks ADD CONSTRAINT weeks_no_overlap
  EXCLUDE USING gist (
    season_id WITH =,
    tstzrange(drops_at, voting_closes_at, '[)') WITH &&
  );
