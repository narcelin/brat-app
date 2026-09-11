/** Deletes submission blobs that no database row references.
 *
 *  `addRandomSuffix` put every upload on a fresh key, so until the fix in
 *  "delete the blob a replacement leaves behind" every replaced proof left a
 *  file nobody could reach. This reclaims those. It is safe to re-run.
 *
 *  DRY RUN BY DEFAULT. Pass --delete to actually remove anything.
 *
 *  Run it against PRODUCTION — it is the only database allowed to decide what
 *  is unreferenced, and the guard below enforces that:
 *
 *    vercel env pull .env.production.local --environment=production
 *    node --env-file=.env.production.local scripts/sweep-orphan-blobs.mjs
 *    node --env-file=.env.production.local scripts/sweep-orphan-blobs.mjs --delete
 *
 *  Two deliberate safety properties:
 *
 *  1. Only keys under `submissions/` are ever considered. Avatars and
 *     anything else in the store are not listed and cannot be deleted.
 *  2. The referenced set is read from the database FIRST and must be
 *     non-empty before any delete runs. A failed or empty query would
 *     otherwise make every blob look orphaned and wipe the store.
 *  3. It refuses to run against any branch marked disposable — test or dev.
 *     There is one blob store shared by every branch, so a database whose
 *     rows have diverged would mark production's media as orphaned.
 */
import { list, del } from '@vercel/blob'
import { neon } from '@neondatabase/serverless'

const PREFIX = 'submissions/'
const apply = process.argv.includes('--delete')

const sql = neon(process.env.DATABASE_URL)

// The blob store is shared: there is one store, and every branch's rows point
// into it. Sweeping against a disposable branch would compute the orphan set
// from a database whose rows have diverged — deleting media that production
// still references and can never get back. Only the real database may decide
// what is unreferenced.
//
// Both markers are checked, not just the test one. The dev branch is the more
// dangerous of the two here: it is seeded rather than copied, so it references
// no production media at all, and the invocation this script documented until
// recently (`--env-file=.env.development.local`) is now precisely the file
// that points at it.
const marker = await sql`
  SELECT to_regclass('public.test_branch_marker') AS test,
         to_regclass('public.dev_branch_marker')  AS dev
`
const disposable = marker[0].test ? 'test' : marker[0].dev ? 'dev' : null
if (disposable) {
  console.error(
    `Refusing to continue: DATABASE_URL points at the ${disposable} branch.\n` +
    'There is only one blob store, shared by every branch, so sweeping from a\n' +
    'disposable branch would delete media production still references. Re-run\n' +
    'with the production env file.',
  )
  process.exit(1)
}

// Referenced set first, deliberately. See safety note 2 above.
const rows = await sql`SELECT media_pathname FROM submissions WHERE media_pathname IS NOT NULL`
const referenced = new Set(rows.map((r) => r.media_pathname))

console.log(`referenced by the database: ${referenced.size}`)

if (referenced.size === 0) {
  console.error(
    'Refusing to continue: no submission references any blob. That is either an\n' +
    'empty database or a broken query, and in both cases every blob would look\n' +
    'orphaned. Check the database before re-running.',
  )
  process.exit(1)
}

// Paginate: the store holds more than one page once a season is under way.
const blobs = []
let cursor
do {
  const page = await list({ prefix: PREFIX, cursor, limit: 1000 })
  blobs.push(...page.blobs)
  cursor = page.hasMore ? page.cursor : undefined
} while (cursor)

console.log(`blobs under ${PREFIX}: ${blobs.length}`)

const orphans = blobs.filter((b) => !referenced.has(b.pathname))
const bytes = orphans.reduce((sum, b) => sum + b.size, 0)

if (orphans.length === 0) {
  console.log('\nNothing to sweep — every blob is referenced.')
  process.exit(0)
}

console.log(`\norphans: ${orphans.length}  (${(bytes / 1024 / 1024).toFixed(1)} MB)\n`)
for (const b of orphans) {
  console.log(`  ${b.pathname}  ${(b.size / 1024 / 1024).toFixed(2)} MB  ${b.uploadedAt}`)
}

if (!apply) {
  console.log('\nDRY RUN — nothing deleted. Re-run with --delete to remove these.')
  process.exit(0)
}

for (const b of orphans) {
  await del(b.url)
  console.log(`deleted ${b.pathname}`)
}
console.log(`\nDone. Reclaimed ${(bytes / 1024 / 1024).toFixed(1)} MB.`)
