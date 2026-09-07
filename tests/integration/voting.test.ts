import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from '../../lib/db/client'
import { getStandings } from '../../lib/db/standings'
import { medalsFor } from '../../lib/domain/tiers'

// This suite creates its own season, week and objectives and never reads or
// writes a row belonging to the real, live season. The live game may be
// mid-week while this runs (real players, real submissions), so nothing here
// may touch a week that isn't owned by this fixture — see task-10 fix report.
describe.skipIf(!process.env.DATABASE_URL)('voting end to end (integration)', () => {
  const A = 'itest_vote_a'
  const B = 'itest_vote_b'
  const C = 'itest_vote_c'
  const SEASON_NAME = 'itest_season'

  let seasonId = 0
  let weekId = 0
  let objectiveId = 0
  let soloObjectiveId = 0
  const tier: 'easy' | 'hard' | 'unhinged' = 'hard'
  const soloTier: 'easy' | 'hard' | 'unhinged' = 'easy'

  beforeAll(async () => {
    await sql`
      INSERT INTO users (id, display_name)
      VALUES (${A}, 'Vote A'), (${B}, 'Vote B'), (${C}, 'Vote C')
      ON CONFLICT (id) DO NOTHING
    `

    // is_active = false: seasons_one_active only allows one active season,
    // and getStandings takes a season id directly, so an inactive fixture
    // season is scored the same as an active one without risking a clash.
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

    // Timestamps are all in the past so the natural (clock) state is CLOSED;
    // individual tests still override with forced_state as needed. Must
    // satisfy drops_at < submissions_close_at < voting_closes_at.
    const [week] = (await sql`
      INSERT INTO weeks (season_id, number, drops_at, submissions_close_at, voting_closes_at)
      VALUES (
        ${seasonId}, 1,
        now() - interval '10 days',
        now() - interval '9 days',
        now() - interval '8 days'
      )
      RETURNING id
    `) as { id: number }[]
    weekId = week.id

    const [objective] = (await sql`
      INSERT INTO objectives (week_id, title, tier)
      VALUES (${weekId}, 'itest ranked objective', ${tier})
      RETURNING id
    `) as { id: number }[]
    objectiveId = objective.id

    const [soloObjective] = (await sql`
      INSERT INTO objectives (week_id, title, tier)
      VALUES (${weekId}, 'itest ratify objective', ${soloTier})
      RETURNING id
    `) as { id: number }[]
    soloObjectiveId = soloObjective.id

    for (const user of [A, B]) {
      await sql`
        INSERT INTO submissions (objective_id, user_id, media_url, media_pathname, media_type)
        VALUES (${objectiveId}, ${user}, 'https://itest.invalid/x', ${'p/' + user}, 'photo')
        ON CONFLICT (objective_id, user_id) DO NOTHING
      `
    }
    // C ranks A above B.
    await sql`
      INSERT INTO votes (objective_id, voter_id, submission_user_id, place)
      VALUES (${objectiveId}, ${C}, ${A}, 1), (${objectiveId}, ${C}, ${B}, 2)
    `
    // Force the week closed so it counts toward standings.
    await sql`UPDATE weeks SET forced_state = 'CLOSED' WHERE id = ${weekId}`
  })

  afterAll(async () => {
    // Deleting the season cascades to weeks -> objectives -> submissions,
    // votes and ratifications, but delete defensively (children first) so a
    // partial failure mid-run still leaves the database clean.
    await sql`DELETE FROM votes WHERE voter_id IN (${A}, ${B}, ${C})`.catch(() => {})
    await sql`DELETE FROM ratifications WHERE voter_id IN (${A}, ${B}, ${C})`.catch(() => {})
    await sql`DELETE FROM submissions WHERE user_id IN (${A}, ${B}, ${C})`.catch(() => {})
    if (objectiveId) {
      await sql`DELETE FROM objectives WHERE id = ${objectiveId}`.catch(() => {})
    }
    if (soloObjectiveId) {
      await sql`DELETE FROM objectives WHERE id = ${soloObjectiveId}`.catch(() => {})
    }
    if (weekId) {
      await sql`DELETE FROM weeks WHERE id = ${weekId}`.catch(() => {})
    }
    if (seasonId) {
      await sql`DELETE FROM seasons WHERE id = ${seasonId}`.catch(() => {})
    }
    await sql`DELETE FROM users WHERE id IN (${A}, ${B}, ${C})`.catch(() => {})
  })

  it('turns real votes into real points', async () => {
    const standings = await getStandings(seasonId)
    const a = standings.find((s) => s.userId === A)!
    const b = standings.find((s) => s.userId === B)!

    expect(a.points).toBeGreaterThanOrEqual(medalsFor(tier).first)
    expect(a.golds).toBe(1)
    expect(b.silvers).toBe(1)
    expect(a.points).toBeGreaterThan(b.points)
  })

  it('refuses a self-vote at the database level', async () => {
    await expect(
      sql`
        INSERT INTO votes (objective_id, voter_id, submission_user_id, place)
        VALUES (${objectiveId}, ${A}, ${A}, 1)
      `,
    ).rejects.toThrow()
  })

  it('scores a ratified lone entry, and counts every ratification', async () => {
    // Regression: the first version of getStandings keyed its ratification
    // dedup on the VOTES table's voter_id, which is null for a ratify-only
    // objective — so every approval was silently dropped and a lone entry
    // could never be ratified. Unit tests could not see this; only a real
    // join can.
    try {
      await sql`
        INSERT INTO submissions (objective_id, user_id, media_url, media_pathname, media_type)
        VALUES (${soloObjectiveId}, ${A}, 'https://itest.invalid/solo', ${'p/solo-' + A}, 'photo')
        ON CONFLICT (objective_id, user_id) DO NOTHING
      `
      await sql`
        INSERT INTO ratifications (objective_id, voter_id, approved)
        VALUES (${soloObjectiveId}, ${B}, true), (${soloObjectiveId}, ${C}, true)
      `

      const standings = await getStandings(seasonId)
      const a = standings.find((s) => s.userId === A)!
      // A already has one gold from the ranked objective (previous test), so
      // this must be an exact count, not >=1 — otherwise the assertion would
      // pass even if the ratified solo entry were never scored at all.
      expect(a.golds).toBe(2)
      expect(a.points).toBe(medalsFor(tier).first + medalsFor(soloTier).first)
    } finally {
      await sql`DELETE FROM ratifications WHERE objective_id = ${soloObjectiveId}`.catch(() => {})
      await sql`
        DELETE FROM submissions WHERE objective_id = ${soloObjectiveId} AND user_id = ${A}
      `.catch(() => {})
    }
  })

  it('excludes a week an admin has forced back open, even once the clock has passed', async () => {
    // Regression: the WHERE clause used to let the clock override a forced
    // state, so a week deliberately kept open for voting was published anyway.
    // The fixture week's timestamps are already in the past, so no timestamp
    // rewriting is needed here at all — only the forced_state changes.
    try {
      await sql`UPDATE weeks SET forced_state = 'VOTING' WHERE id = ${weekId}`
      const whileOpen = await getStandings(seasonId)
      expect(whileOpen.find((s) => s.userId === A)?.points ?? 0).toBe(0)

      await sql`UPDATE weeks SET forced_state = 'CLOSED' WHERE id = ${weekId}`
      const afterClose = await getStandings(seasonId)
      expect(afterClose.find((s) => s.userId === A)!.points).toBeGreaterThan(0)
    } finally {
      await sql`UPDATE weeks SET forced_state = 'CLOSED' WHERE id = ${weekId}`.catch(() => {})
    }
  })

  it('refuses two players in the same place', async () => {
    await expect(
      sql`
        INSERT INTO votes (objective_id, voter_id, submission_user_id, place)
        VALUES (${objectiveId}, ${C}, ${B}, 1)
      `,
    ).rejects.toThrow()
  })
})
