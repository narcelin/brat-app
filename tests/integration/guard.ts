/** Refuses to run the integration suite against anything but a test branch.
 *
 *  These tests write: they create seasons, weeks, objectives, submissions and
 *  votes. Run against the live database they can damage a real week — which
 *  has happened, leaving the active week stuck CLOSED.
 *
 *  The check asks the DATABASE whether it is disposable, rather than trusting
 *  the env file's name or the connection string's shape. A wrong --env-file, a
 *  stale .env, or a command copied from the wrong doc all fail closed, because
 *  only db/test-branch.sql creates this table and it is never applied to
 *  production.
 *
 *  Runs once, before any test file. */
import { neon } from '@neondatabase/serverless'

const PROVISION = `
Integration tests need their own Neon branch. To provision one:

  neon branch create --name test
  neon connection-string test > /dev/null   # then write it to .env.test.local
  node --env-file=.env.test.local db/apply.mjs db/schema.sql db/test-branch.sql

See docs/TESTING.md.
`

export async function setup() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      `DATABASE_URL is not set, so the integration suite has nothing to run against.\n${PROVISION}`,
    )
  }

  const sql = neon(url)

  let marked = false
  try {
    const rows = await sql`SELECT 1 AS ok FROM test_branch_marker LIMIT 1`
    marked = rows.length > 0
  } catch {
    // Missing table, missing database, no permission — all mean "not a
    // database we have been told is safe to write to". Fail closed.
    marked = false
  }

  if (!marked) {
    // Deliberately does not print the connection string: it carries the
    // password, and this message lands in CI logs.
    throw new Error(
      'REFUSING TO RUN: DATABASE_URL does not point at a test branch.\n\n' +
        'The integration suite writes to the database, and this one has no\n' +
        'test_branch_marker row — so it may be production. Nothing was run.\n' +
        PROVISION,
    )
  }
}
