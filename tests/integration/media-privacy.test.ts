import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from '../../lib/db/client'
import { findMediaOwner } from '../../lib/db/media'
import { canViewSubmission } from '../../lib/domain/submission-rules'

describe.skipIf(!process.env.DATABASE_URL)('media privacy (integration)', () => {
  const ALICE = 'itest_media_alice'
  const BOB = 'itest_media_bob'
  const PATH = 'submissions/itest/alice-media-secret'
  let objectiveId: number | null = null

  beforeAll(async () => {
    const [objective] = (await sql`
      SELECT o.id FROM objectives o
      JOIN weeks w ON w.id = o.week_id
      ORDER BY o.id LIMIT 1
    `) as { id: number }[]
    objectiveId = objective.id

    await sql`
      INSERT INTO users (id, display_name)
      VALUES (${ALICE}, 'Media Alice'), (${BOB}, 'Media Bob')
      ON CONFLICT (id) DO NOTHING
    `
    await sql`
      INSERT INTO submissions (objective_id, user_id, media_url, media_pathname, media_type)
      VALUES (${objectiveId}, ${ALICE}, 'https://itest.invalid/a', ${PATH}, 'photo')
      ON CONFLICT (objective_id, user_id) DO UPDATE SET media_pathname = EXCLUDED.media_pathname
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM submissions WHERE user_id IN (${ALICE}, ${BOB})`.catch(() => {})
    await sql`DELETE FROM users WHERE id IN (${ALICE}, ${BOB})`.catch(() => {})
  })

  it('finds the owner and the governing week state', async () => {
    const owner = await findMediaOwner(PATH)
    expect(owner?.userId).toBe(ALICE)
    expect(owner?.mediaPathname).toBe(PATH)
  })

  it('refuses bob while submissions are open, and allows him once voting starts', async () => {
    const owner = await findMediaOwner(PATH)
    expect(canViewSubmission('SUBMITTING', owner!.userId, BOB)).toBe(false)
    expect(canViewSubmission('VOTING', owner!.userId, BOB)).toBe(true)
  })

  it('always allows alice her own media', async () => {
    const owner = await findMediaOwner(PATH)
    expect(canViewSubmission('SUBMITTING', owner!.userId, ALICE)).toBe(true)
  })
})
