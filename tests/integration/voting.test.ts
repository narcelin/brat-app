import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from '../../lib/db/client'
import { getStandings } from '../../lib/db/standings'
import { medalsFor } from '../../lib/domain/tiers'

describe.skipIf(!process.env.DATABASE_URL)('voting end to end (integration)', () => {
  const A = 'itest_vote_a'
  const B = 'itest_vote_b'
  const C = 'itest_vote_c'
  let objectiveId = 0
  let seasonId = 0
  let tier: 'easy' | 'hard' | 'unhinged' = 'hard'

  beforeAll(async () => {
    const [objective] = (await sql`
      SELECT o.id, o.tier, w.season_id
      FROM objectives o JOIN weeks w ON w.id = o.week_id
      ORDER BY o.id LIMIT 1
    `) as { id: number; tier: typeof tier; season_id: number }[]
    objectiveId = objective.id
    seasonId = objective.season_id
    tier = objective.tier

    await sql`
      INSERT INTO users (id, display_name)
      VALUES (${A}, 'Vote A'), (${B}, 'Vote B'), (${C}, 'Vote C')
      ON CONFLICT (id) DO NOTHING
    `
    for (const user of [A, B]) {
      await sql`
        INSERT INTO submissions (objective_id, user_id, media_url, media_pathname, media_type)
        VALUES (${objectiveId}, ${user}, 'https://itest.invalid/x', ${'p/' + user}, 'photo')
        ON CONFLICT (objective_id, user_id) DO NOTHING
      `
    }
    // C ranks A above B.
    await sql`DELETE FROM votes WHERE voter_id = ${C} AND objective_id = ${objectiveId}`
    await sql`
      INSERT INTO votes (objective_id, voter_id, submission_user_id, place)
      VALUES (${objectiveId}, ${C}, ${A}, 1), (${objectiveId}, ${C}, ${B}, 2)
    `
    // Force the week closed so it counts toward standings.
    await sql`
      UPDATE weeks SET forced_state = 'CLOSED'
      WHERE id = (SELECT week_id FROM objectives WHERE id = ${objectiveId})
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM votes WHERE voter_id IN (${A}, ${B}, ${C})`.catch(() => {})
    await sql`DELETE FROM submissions WHERE user_id IN (${A}, ${B}, ${C})`.catch(() => {})
    await sql`DELETE FROM users WHERE id IN (${A}, ${B}, ${C})`.catch(() => {})
    await sql`
      UPDATE weeks SET forced_state = NULL
      WHERE id = (SELECT week_id FROM objectives WHERE id = ${objectiveId})
    `.catch(() => {})
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
    const [solo] = (await sql`
      SELECT o.id, o.tier, w.season_id
      FROM objectives o JOIN weeks w ON w.id = o.week_id
      WHERE o.id <> ${objectiveId}
      ORDER BY o.id LIMIT 1
    `) as { id: number; tier: typeof tier; season_id: number }[]

    await sql`
      INSERT INTO submissions (objective_id, user_id, media_url, media_pathname, media_type)
      VALUES (${solo.id}, ${A}, 'https://itest.invalid/solo', ${'p/solo-' + A}, 'photo')
      ON CONFLICT (objective_id, user_id) DO NOTHING
    `
    await sql`DELETE FROM ratifications WHERE objective_id = ${solo.id}`
    await sql`
      INSERT INTO ratifications (objective_id, voter_id, approved)
      VALUES (${solo.id}, ${B}, true), (${solo.id}, ${C}, true)
    `
    await sql`
      UPDATE weeks SET forced_state = 'CLOSED'
      WHERE id = (SELECT week_id FROM objectives WHERE id = ${solo.id})
    `

    const standings = await getStandings(solo.season_id)
    const a = standings.find((s) => s.userId === A)!
    expect(a.golds).toBeGreaterThanOrEqual(1)

    await sql`DELETE FROM ratifications WHERE objective_id = ${solo.id}`
    await sql`DELETE FROM submissions WHERE objective_id = ${solo.id} AND user_id = ${A}`
    await sql`
      UPDATE weeks SET forced_state = NULL
      WHERE id = (SELECT week_id FROM objectives WHERE id = ${solo.id})
    `
  })

  it('excludes a week an admin has forced back open, even once the clock has passed', async () => {
    // Regression: the WHERE clause used to let the clock override a forced
    // state, so a week deliberately kept open for voting was published anyway.
    const weekId = (await sql`
      SELECT week_id FROM objectives WHERE id = ${objectiveId}
    `)[0].week_id as number

    // The live season's week 1 has submissions_close_at in the future (the
    // schema's CHECK requires drops_at < submissions_close_at <
    // voting_closes_at), so pushing only voting_closes_at into the past
    // would itself violate that constraint. Push all three back together —
    // unrelated to the forced_state/clock behavior under test — and restore
    // the originals afterward regardless of outcome.
    const [original] = (await sql`
      SELECT drops_at, submissions_close_at, voting_closes_at
      FROM weeks WHERE id = ${weekId}
    `) as { drops_at: Date; submissions_close_at: Date; voting_closes_at: Date }[]

    try {
      await sql`
        UPDATE weeks
        SET forced_state = 'VOTING',
            drops_at = now() - interval '3 days',
            submissions_close_at = now() - interval '2 days',
            voting_closes_at = now() - interval '1 day'
        WHERE id = ${weekId}
      `
      const whileOpen = await getStandings(seasonId)
      expect(whileOpen.find((s) => s.userId === A)?.points ?? 0).toBe(0)

      await sql`UPDATE weeks SET forced_state = 'CLOSED' WHERE id = ${weekId}`
      const afterClose = await getStandings(seasonId)
      expect(afterClose.find((s) => s.userId === A)!.points).toBeGreaterThan(0)
    } finally {
      await sql`
        UPDATE weeks
        SET drops_at = ${original.drops_at},
            submissions_close_at = ${original.submissions_close_at},
            voting_closes_at = ${original.voting_closes_at}
        WHERE id = ${weekId}
      `
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
