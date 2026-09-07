-- Marks a database as safe for integration tests to write to.
--
-- Integration tests create seasons, weeks, objectives and submissions. Run
-- against the live database they can corrupt a real week — this has already
-- happened once, leaving the active week stuck CLOSED and unreopenable from
-- the admin UI.
--
-- The guard in tests/integration/guard.ts refuses to run unless this table is
-- present, so the check is a property of the DATABASE rather than of an env
-- file name or a hostname pattern. Point the tests at production by mistake —
-- wrong --env-file, a stale .env, a copied command — and they abort instead of
-- writing. Production will never have this table because nothing but this
-- file creates it.
--
-- Apply to a fresh Neon test branch, after db/schema.sql:
--   node --env-file=.env.test.local db/apply.mjs db/schema.sql db/test-branch.sql

CREATE TABLE IF NOT EXISTS test_branch_marker (
  id            int PRIMARY KEY DEFAULT 1,
  note          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT test_branch_marker_single_row CHECK (id = 1)
);

INSERT INTO test_branch_marker (id, note)
VALUES (1, 'Disposable branch for integration tests. Safe to wipe. Never point this at production.')
ON CONFLICT (id) DO NOTHING;
