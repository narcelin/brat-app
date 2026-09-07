import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from '../../lib/db/client'
import { findMediaOwner } from '../../lib/db/media'
import { canViewSubmission } from '../../lib/domain/submission-rules'

// This suite creates its own season, week, objective and submission, and
// never reads or writes a row belonging to the real, live season. It used to
// pick a real objective (`ORDER BY o.id LIMIT 1`) and insert an entrant into
// it, which gave a genuine objective a phantom competitor on every run — and
// could flip a real single-entrant objective from ratify to ranked. Same
// hazard, and same fix, as tests/integration/voting.test.ts.
//
// What it actually tests: the seam from a database row to a reveal decision.
// The assertions read `findMediaOwner(...)!.weekState`, so if the query, the
// join to weeks, or effectiveWeekState computed the wrong state, these fail.
// Asserting on canViewSubmission with a hardcoded state string instead would
// only re-test the pure rule that tests/domain/submission-rules.test.ts
// already covers, and would pass even if the week state were never computed.
describe.skipIf(!process.env.DATABASE_URL)('media privacy (integration)', () => {
  const ALICE = 'itest_reveal_alice'
  const BOB = 'itest_reveal_bob'
  const PATH = 'submissions/itest/reveal-alice-secret'
  const SEASON_NAME = 'itest_reveal_season'
  // Deliberately no "media" anywhere in these ids or display names:
  // tests/integration/privacy.test.ts asserts that a serialised roster
  // contains no such substring, and the whole integration suite shares one
  // database, so a fixture user called "Media Alice" fails that test
  // whenever the two suites overlap.

  let seasonId = 0
  let weekId = 0
  let objectiveId = 0

  /** Rewrite the fixture week's windows. Ordering always satisfies the
   *  weeks CHECK (drops_at < submissions_close_at < voting_closes_at). */
  async function setWindows(drops: string, closes: string, votingCloses: string) {
    await sql`
      UPDATE weeks
      SET drops_at = now() + ${drops}::interval,
          submissions_close_at = now() + ${closes}::interval,
          voting_closes_at = now() + ${votingCloses}::interval,
          forced_state = NULL
      WHERE id = ${weekId}
    `
  }

  beforeAll(async () => {
    await sql`
      INSERT INTO users (id, display_name)
      VALUES (${ALICE}, 'Reveal Alice'), (${BOB}, 'Reveal Bob')
      ON CONFLICT (id) DO NOTHING
    `

    // is_active = false: the seasons_one_active partial unique index allows
    // only one active season, and nothing here needs the fixture to be the
    // active one — findMediaOwner reaches the week through the submission.
    //
    // seasons.name is UNIQUE. afterAll swallows delete failures with
    // .catch(() => {}), so a season from a prior run whose teardown failed
    // (or whose process was killed after beforeAll) can survive and make a
    // plain INSERT here throw forever — and since seasonId is never
    // assigned when the insert throws, afterAll has nothing to delete
    // either, so the suite could never recover on its own. Deleting any
    // stray season by name first makes this self-healing: the FK cascade
    // takes its weeks, objectives, submissions, votes and ratifications
    // with it, so every run starts from a clean slate regardless of how
    // the previous one ended.
    await sql`DELETE FROM seasons WHERE name = ${SEASON_NAME}`
    const [season] = (await sql`
      INSERT INTO seasons (name, is_active) VALUES (${SEASON_NAME}, false)
      RETURNING id
    `) as { id: number }[]
    seasonId = season.id

    const [week] = (await sql`
      INSERT INTO weeks (season_id, number, drops_at, submissions_close_at, voting_closes_at)
      VALUES (
        ${seasonId}, 1,
        now() - interval '2 days',
        now() + interval '1 day',
        now() + interval '2 days'
      )
      RETURNING id
    `) as { id: number }[]
    weekId = week.id

    const [objective] = (await sql`
      INSERT INTO objectives (week_id, title, tier)
      VALUES (${weekId}, 'itest reveal objective', 'easy')
      RETURNING id
    `) as { id: number }[]
    objectiveId = objective.id

    await sql`
      INSERT INTO submissions (objective_id, user_id, media_url, media_pathname, media_type)
      VALUES (${objectiveId}, ${ALICE}, 'https://itest.invalid/a', ${PATH}, 'photo')
      ON CONFLICT (objective_id, user_id) DO UPDATE SET media_pathname = EXCLUDED.media_pathname
    `
  })

  afterAll(async () => {
    // Deleting the season cascades, but delete children first and
    // defensively so a run killed part-way still leaves nothing behind.
    await sql`DELETE FROM votes WHERE voter_id IN (${ALICE}, ${BOB})`.catch(() => {})
    await sql`DELETE FROM ratifications WHERE voter_id IN (${ALICE}, ${BOB})`.catch(() => {})
    await sql`DELETE FROM submissions WHERE user_id IN (${ALICE}, ${BOB})`.catch(() => {})
    if (objectiveId) {
      await sql`DELETE FROM objectives WHERE id = ${objectiveId}`.catch(() => {})
    }
    if (weekId) {
      await sql`DELETE FROM weeks WHERE id = ${weekId}`.catch(() => {})
    }
    if (seasonId) {
      await sql`DELETE FROM seasons WHERE id = ${seasonId}`.catch(() => {})
    }
    await sql`DELETE FROM users WHERE id IN (${ALICE}, ${BOB})`.catch(() => {})
  })

  it('finds the owner of a path, and nothing for a path nobody owns', async () => {
    const owner = await findMediaOwner(PATH)
    expect(owner?.userId).toBe(ALICE)
    expect(owner?.mediaPathname).toBe(PATH)
    expect(await findMediaOwner('submissions/itest/no-such-file')).toBeNull()
  })

  it('computes SUBMITTING from the row, and hides alice from bob', async () => {
    await setWindows('-1 day', '1 day', '2 days')

    const owner = (await findMediaOwner(PATH))!
    expect(owner.weekState).toBe('SUBMITTING')
    // The reveal decision the media route makes, on the state this row
    // actually produced — not on a string typed into the test.
    expect(canViewSubmission(owner.weekState, owner.userId, BOB)).toBe(false)
    expect(canViewSubmission(owner.weekState, owner.userId, ALICE)).toBe(true)
  })

  it('computes VOTING once submissions have closed, and reveals alice to bob', async () => {
    await setWindows('-2 days', '-1 day', '1 day')

    const owner = (await findMediaOwner(PATH))!
    expect(owner.weekState).toBe('VOTING')
    expect(canViewSubmission(owner.weekState, owner.userId, BOB)).toBe(true)
  })

  it('computes CLOSED once voting has closed, and keeps the proof visible', async () => {
    await setWindows('-3 days', '-2 days', '-1 day')

    const owner = (await findMediaOwner(PATH))!
    expect(owner.weekState).toBe('CLOSED')
    expect(canViewSubmission(owner.weekState, owner.userId, BOB)).toBe(true)
  })

  it("lets an admin's forced_state beat the clock, re-hiding the proof", async () => {
    // The clock says CLOSED, the admin says SUBMITTING. If forced_state did
    // not survive the trip from the row through effectiveWeekState, bob would
    // still be able to stream alice's proof on a week deliberately reopened.
    await setWindows('-3 days', '-2 days', '-1 day')
    await sql`UPDATE weeks SET forced_state = 'SUBMITTING' WHERE id = ${weekId}`

    const owner = (await findMediaOwner(PATH))!
    expect(owner.weekState).toBe('SUBMITTING')
    expect(canViewSubmission(owner.weekState, owner.userId, BOB)).toBe(false)
  })
})
