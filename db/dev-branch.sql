-- Marks a database as a disposable development branch.
--
-- The sibling of db/test-branch.sql, for the same reason and with a different
-- consumer. The test marker stops the integration suite from WRITING to
-- production. This one stops scripts/sweep-orphan-blobs.mjs from DELETING
-- production's media.
--
-- Why that script in particular: there is one Vercel Blob store, shared by
-- every database branch. The sweep computes "orphan" as "no row references
-- this blob" — so pointed at a dev branch, whose submissions are seeded or
-- absent, every file production depends on looks unreferenced. Its documented
-- invocation is `--env-file=.env.development.local`, which is exactly the file
-- that now points at dev, so this is a mistake the happy path invites.
--
-- Like the test marker, the check is a property of the DATABASE rather than of
-- an env file's name or a hostname pattern. Production will never have this
-- table, because nothing but this file creates it.
--
-- Applied by `npm run db:apply`, after db/schema.sql and db/seed.sql.

CREATE TABLE IF NOT EXISTS dev_branch_marker (
  id            int PRIMARY KEY DEFAULT 1,
  note          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dev_branch_marker_single_row CHECK (id = 1)
);

INSERT INTO dev_branch_marker (id, note)
VALUES (1, 'Disposable development branch. Safe to wipe. Never point this at production.')
ON CONFLICT (id) DO NOTHING;
