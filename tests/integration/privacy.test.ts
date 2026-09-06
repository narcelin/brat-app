import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from '../../lib/db/client'
import { fetchWeekRows, getCurrentWeek, getObjectiveRoster } from '../../lib/db/queries'

// This test hits a real database (DATABASE_URL) and exercises the single
// most important rule in Phase 1: submissions must stay hidden from other
// players until reveal. It is skipped entirely when no DATABASE_URL is
// present, so `npm test` stays green with no env files.
describe.skipIf(!process.env.DATABASE_URL)('submission privacy (integration)', () => {
  const ALICE = 'itest_alice'
  const BOB = 'itest_bob'
  const ALICE_MEDIA_URL = 'https://itest.example.invalid/alice-secret-proof.mp4'
  const ALICE_MEDIA_PATHNAME = 'submissions/itest/alice-secret-pathname'

  let objectiveId: number | null = null
  let submissionId: number | null = null
  let usersCreated = false

  beforeAll(async () => {
    // Find a real objective in the current week by calling the real
    // getCurrentWeek — never reimplement that query here. Use a viewer id
    // that owns no submissions so this lookup has no side effects.
    const week = await getCurrentWeek('itest_probe_nonexistent')
    if (!week || week.objectives.length === 0) {
      throw new Error(
        'No current week with objectives found in the database under test; ' +
          'cannot exercise the privacy rule without one.',
      )
    }
    objectiveId = week.objectives[0].id

    await sql`
      INSERT INTO users (id, display_name)
      VALUES (${ALICE}, 'Integration Test Alice'), (${BOB}, 'Integration Test Bob')
      ON CONFLICT (id) DO NOTHING
    `
    usersCreated = true

    const rows = (await sql`
      INSERT INTO submissions
        (objective_id, user_id, media_url, media_pathname, media_type)
      VALUES
        (${objectiveId}, ${ALICE}, ${ALICE_MEDIA_URL}, ${ALICE_MEDIA_PATHNAME}, 'photo')
      ON CONFLICT (objective_id, user_id) DO UPDATE
        SET media_url = EXCLUDED.media_url,
            media_pathname = EXCLUDED.media_pathname
      RETURNING id
    `) as { id: number }[]
    submissionId = rows[0].id
  })

  afterAll(async () => {
    if (submissionId !== null) {
      await sql`DELETE FROM submissions WHERE id = ${submissionId}`.catch(() => {})
    }
    if (usersCreated) {
      await sql`DELETE FROM users WHERE id IN (${ALICE}, ${BOB})`.catch(() => {})
    }
  })

  it("never lets alice's row leave the database for bob's query", async () => {
    // This is the layer that actually matters: assert directly on the raw
    // SQL rows, before shapeCurrentWeek gets anywhere near them. A leak here
    // cannot be masked by JS-layer filtering, unlike an assertion on
    // getCurrentWeek's output (whose shape has no field capable of carrying
    // another player's data in the first place).
    const rows = await fetchWeekRows(BOB, new Date())
    expect(rows.length).toBeGreaterThan(0)

    for (const row of rows) {
      expect(row.submission_user_id === null || row.submission_user_id === BOB).toBe(true)
    }

    const serializedRows = JSON.stringify(rows)
    expect(serializedRows).not.toContain(ALICE)
    expect(serializedRows).not.toContain(ALICE_MEDIA_URL)
    expect(serializedRows).not.toContain(ALICE_MEDIA_PATHNAME)
  })

  it("hides alice's submission from bob entirely", async () => {
    const week = await getCurrentWeek(BOB)
    expect(week).not.toBeNull()

    const objective = week!.objectives.find((o) => o.id === objectiveId)
    expect(objective).toBeDefined()
    expect(objective!.mySubmissionId).toBeNull()

    const serialized = JSON.stringify(week)
    expect(serialized).not.toContain(ALICE)
    expect(serialized).not.toContain(ALICE_MEDIA_URL)
    expect(serialized).not.toContain(ALICE_MEDIA_PATHNAME)
  })

  it('shows alice her own submission', async () => {
    const week = await getCurrentWeek(ALICE)
    expect(week).not.toBeNull()

    const objective = week!.objectives.find((o) => o.id === objectiveId)
    expect(objective).toBeDefined()
    expect(objective!.mySubmissionId).toBe(submissionId)
  })

  // The roster deliberately reveals WHO has posted, because that cannot be
  // copied and it drives participation. It must never reveal WHAT they posted.
  it('shows that alice has posted without exposing any of her media', async () => {
    const roster = await getObjectiveRoster(objectiveId!)
    const alice = roster.find((r) => r.userId === ALICE)

    expect(alice, 'alice should appear on the roster').toBeDefined()
    expect(alice!.hasSubmitted).toBe(true)

    const serialized = JSON.stringify(roster)
    expect(serialized).not.toContain(ALICE_MEDIA_URL)
    expect(serialized).not.toContain(ALICE_MEDIA_PATHNAME)
    expect(serialized).not.toContain('media')
  })

  it('shows bob as not having posted', async () => {
    const roster = await getObjectiveRoster(objectiveId!)
    expect(roster.find((r) => r.userId === BOB)?.hasSubmitted).toBe(false)
  })

  it('puts players who have posted above those who have not', async () => {
    const roster = await getObjectiveRoster(objectiveId!)
    const firstUnsubmitted = roster.findIndex((r) => !r.hasSubmitted)
    const lastSubmitted = roster.map((r) => r.hasSubmitted).lastIndexOf(true)
    if (firstUnsubmitted !== -1 && lastSubmitted !== -1) {
      expect(lastSubmitted).toBeLessThan(firstUnsubmitted)
    }
  })
})
