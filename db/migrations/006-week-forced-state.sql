-- An admin override of the week's state. Null means the week runs on its own
-- timestamps, so the game still works if nobody intervenes.
ALTER TABLE weeks ADD COLUMN IF NOT EXISTS forced_state TEXT;

ALTER TABLE weeks DROP CONSTRAINT IF EXISTS weeks_forced_state_valid;
ALTER TABLE weeks ADD CONSTRAINT weeks_forced_state_valid
  CHECK (forced_state IS NULL OR forced_state IN ('SUBMITTING', 'VOTING', 'CLOSED'));
