import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock every collaborator so this exercises the route handler itself, with
// no HTTP session, no database, and no blob store — just the branching
// logic that decides which status a caller sees.
vi.mock('../../lib/auth/current-player', () => ({
  currentPlayer: vi.fn(),
}))
vi.mock('../../lib/db/media', () => ({
  findMediaOwner: vi.fn(),
}))
vi.mock('@vercel/blob', () => ({
  get: vi.fn(),
}))

import { currentPlayer } from '../../lib/auth/current-player'
import { findMediaOwner } from '../../lib/db/media'
import { get } from '@vercel/blob'
import { GET } from '../../app/api/media/[...pathname]/route'

const player = { id: 'bob', displayName: 'Bob', avatarUrl: null, avatarSeed: null }

function call(pathname: string) {
  return GET({} as Request, { params: Promise.resolve({ pathname: pathname.split('/') }) })
}

describe('GET /api/media/[...pathname]', () => {
  beforeEach(() => {
    vi.mocked(currentPlayer).mockReset()
    vi.mocked(findMediaOwner).mockReset()
    vi.mocked(get).mockReset()
  })

  it('reports an unknown path and a refused-but-existing path identically', async () => {
    vi.mocked(currentPlayer).mockResolvedValue(player)

    // Unknown pathname: no row at all.
    vi.mocked(findMediaOwner).mockResolvedValueOnce(null)
    const unknown = await call('submissions/1/alice/proof.mp4')

    // Known pathname, but the reveal rule refuses this viewer (still
    // SUBMITTING, and bob isn't alice).
    vi.mocked(findMediaOwner).mockResolvedValueOnce({
      userId: 'alice',
      weekState: 'SUBMITTING',
      mediaPathname: 'submissions/1/alice/proof.mp4',
    })
    const refused = await call('submissions/1/alice/proof.mp4')

    expect(unknown.status).toBe(refused.status)
    expect(unknown.status).toBe(404)

    const [unknownBody, refusedBody] = await Promise.all([unknown.json(), refused.json()])
    expect(unknownBody).toEqual(refusedBody)

    // Neither response is cacheable by a shared cache.
    expect(unknown.headers.get('Cache-Control')).toBe('private, no-store')
    expect(refused.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('still lets the owner (or anyone once revealed) through to the blob', async () => {
    vi.mocked(currentPlayer).mockResolvedValue(player)
    vi.mocked(findMediaOwner).mockResolvedValue({
      userId: 'bob',
      weekState: 'SUBMITTING',
      mediaPathname: 'submissions/1/bob/proof.mp4',
    })
    vi.mocked(get).mockResolvedValue({
      stream: new ReadableStream(),
      headers: new Headers({ 'content-type': 'video/mp4' }),
    } as never)

    const res = await call('submissions/1/bob/proof.mp4')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('carries the no-store header on the signed-out response too', async () => {
    vi.mocked(currentPlayer).mockResolvedValue(null)
    const res = await call('submissions/1/alice/proof.mp4')
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
