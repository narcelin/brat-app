import { describe, it, expect } from 'vitest'
import { shapeMediaOwner, type MediaOwnerRow } from '../../lib/db/media'

const row: MediaOwnerRow = {
  user_id: 'alice',
  media_pathname: 'submissions/1/alice/proof.mp4',
  drops_at: new Date('2026-09-01T00:00:00Z'),
  submissions_close_at: new Date('2026-09-08T00:00:00Z'),
  voting_closes_at: new Date('2026-09-09T00:00:00Z'),
  forced_state: null,
}

describe('shapeMediaOwner', () => {
  it('returns null when nothing owns that path', () => {
    expect(shapeMediaOwner([], new Date())).toBeNull()
  })

  it('reports the owner and the week state that governs it', () => {
    const owner = shapeMediaOwner([row], new Date('2026-09-03T00:00:00Z'))
    expect(owner).toEqual({
      userId: 'alice',
      weekState: 'SUBMITTING',
      mediaPathname: 'submissions/1/alice/proof.mp4',
    })
  })

  it('respects an admin override, so forcing VOTING reveals media too', () => {
    const forced = [{ ...row, forced_state: 'VOTING' as const }]
    expect(shapeMediaOwner(forced, new Date('2026-09-03T00:00:00Z'))?.weekState).toBe('VOTING')
  })
})
