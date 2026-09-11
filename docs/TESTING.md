# Testing

Two suites, deliberately separated.

## Unit suite — `npm test`

Pure functions and route handlers with the database mocked. **Must pass with no
env files present at all**, on a fresh clone and in CI. Nothing here does I/O.

`vitest.config.ts` explicitly excludes `tests/integration/**`. Without that,
`npm test` would pick the integration files up and run them against whatever
`DATABASE_URL` happened to be exported in the shell, with no guard in front.

## Integration suite — `npm run test:integration`

Writes to a real database: it creates seasons, weeks, objectives, submissions
and votes. It runs only against a disposable Neon branch.

**This is not a style preference.** The suite previously ran against the same
database as production and once left the live week stuck `CLOSED`, which the
admin UI could not reopen.

### Provisioning the test branch (once)

Requires an authenticated Neon CLI — `neon auth` opens a browser, or set
`NEON_API_KEY`.

```bash
neon branch create --name test
```

Write that branch's connection string into `.env.test.local` as `DATABASE_URL`
(the file is gitignored by `.env*`), then apply the schema and the marker:

```bash
npm run db:apply:test
```

That runs `db/schema.sql` followed by `db/test-branch.sql`.

### The guard

`tests/integration/guard.ts` runs before any test file and aborts unless the
database contains a `test_branch_marker` row.

The check asks **the database** whether it is disposable, rather than trusting
an env file's name or a hostname pattern. A wrong `--env-file`, a stale `.env`,
or a command copied from the wrong place all fail closed, because only
`db/test-branch.sql` creates that table and it is never applied to production.

### The dev branch uses the same trick, backwards

Since 2026-09-11 there is also a `dev` branch, which `npm run dev` uses, marked
by `dev_branch_marker` from `db/dev-branch.sql`. The marker exists for a
different consumer and points the opposite way:

- This suite **refuses to run without** `test_branch_marker` — a guard against
  writing to production.
- `scripts/sweep-orphan-blobs.mjs` **refuses to run with** either marker — a
  guard against deleting from production's blob store, which every branch
  shares and which nothing branches alongside the database.

Full arrangement in [STACK.md](STACK.md#branches).

Verified by pointing the suite at production: it refuses and runs nothing.

### The blob store is NOT branched

There is one Vercel Blob store, shared by every database branch. A branch
clones the rows that point into it; it does not clone the media.

Two consequences:

- Integration tests must never delete a blob. They don't — they only write
  rows — but a future test that cleans up "its" media would delete a real
  player's proof.
- `scripts/sweep-orphan-blobs.mjs` refuses to run against a test branch, for
  the same reason: a diverged test database would report production's media as
  unreferenced and delete it.

### Refreshing the branch

The branch is disposable. To reset it from production's current schema, delete
and recreate:

```bash
neon branch delete test
neon branch create --name test
npm run db:apply:test
```

Re-applying the marker is required after any recreate — without it the guard
correctly refuses to run.
