-- Makes weeks_no_overlap DEFERRABLE so a whole season can be rescheduled.
--
-- Migration 009 added the constraint as immediate, which is checked row by
-- row during an UPDATE. Weeks are contiguous — each drops exactly when the
-- previous one's voting closes — so shifting the season by ANY amount under
-- a week makes the first moved row overlap the next row that has not moved
-- yet, and the statement fails. Every shift was rejected, not just awkward
-- ones: the constraint made legitimate rescheduling impossible.
--
-- INITIALLY IMMEDIATE keeps the normal behaviour: an ordinary bad insert
-- still fails at once, with the error pointing at the statement that caused
-- it. Only a transaction that explicitly runs
--   SET CONSTRAINTS weeks_no_overlap DEFERRED
-- postpones the check to commit, which is what a bulk reschedule needs — the
-- end state is valid even though intermediate rows are not.

ALTER TABLE weeks DROP CONSTRAINT IF EXISTS weeks_no_overlap;

ALTER TABLE weeks ADD CONSTRAINT weeks_no_overlap
  EXCLUDE USING gist (
    season_id WITH =,
    tstzrange(drops_at, voting_closes_at, '[)') WITH &&
  ) DEFERRABLE INITIALLY IMMEDIATE;
