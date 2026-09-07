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

function call(pathname: string, headers?: Record<string, string>) {
  return GET(new Request(`https://example.com/api/media/${pathname}`, { headers }), {
    params: Promise.resolve({ pathname: pathname.split('/') }),
  })
}

describe('GET /api/media/[...pathname]', () => {
  // A blob that looks exactly like a real one. Every test starts with the
  // blob read SUCCEEDING, so a 404 can only ever come from a decision the
  // route made — never from a missing mock. Without this the "refused" case
  // 404s through the `if (!blob)` branch and the reveal check could be
  // deleted outright with the suite still green.
  const realBlob = () => ({
    statusCode: 200,
    stream: new ReadableStream(),
    headers: new Headers({ 'content-type': 'video/mp4' }),
  })

  // What the blob store hands back when a Range header was forwarded to it:
  // a genuine 206 partial response, still labelled statusCode 200 by the
  // SDK (which collapses any 2xx onto that field) — Content-Range is the
  // only thing that actually says "this is a partial response".
  const partialBlob = () => ({
    statusCode: 200,
    stream: new ReadableStream(),
    headers: new Headers({
      'content-type': 'video/mp4',
      'content-range': 'bytes 0-99/1000',
      'content-length': '100',
    }),
  })

  beforeEach(() => {
    vi.mocked(currentPlayer).mockReset()
    vi.mocked(findMediaOwner).mockReset()
    vi.mocked(get).mockReset()
    vi.mocked(get).mockResolvedValue(realBlob() as never)
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

    const res = await call('submissions/1/bob/proof.mp4')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('lets a non-owner through once the week reveals (VOTING)', async () => {
    // The actual reveal behaviour: bob is not alice, but submissions have
    // closed, so alice's proof is now everyone's to watch and judge.
    vi.mocked(currentPlayer).mockResolvedValue(player)
    vi.mocked(findMediaOwner).mockResolvedValue({
      userId: 'alice',
      weekState: 'VOTING',
      mediaPathname: 'submissions/1/alice/proof.mp4',
    })

    const res = await call('submissions/1/alice/proof.mp4')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('carries the no-store header on the signed-out response too', async () => {
    vi.mocked(currentPlayer).mockResolvedValue(null)
    const res = await call('submissions/1/alice/proof.mp4')
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('forwards a Range request as a 206 with Content-Range, the way iOS Safari requires', async () => {
    vi.mocked(currentPlayer).mockResolvedValue(player)
    vi.mocked(findMediaOwner).mockResolvedValue({
      userId: 'bob',
      weekState: 'SUBMITTING',
      mediaPathname: 'submissions/1/bob/proof.mp4',
    })
    vi.mocked(get).mockResolvedValue(partialBlob() as never)

    const res = await call('submissions/1/bob/proof.mp4', { Range: 'bytes=0-99' })

    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-99/1000')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    // The Range header itself must have reached the blob store.
    expect(vi.mocked(get)).toHaveBeenCalledWith(
      'submissions/1/bob/proof.mp4',
      expect.objectContaining({ headers: { range: 'bytes=0-99' } }),
    )
  })

  it('still advertises Accept-Ranges on a plain, un-ranged 200', async () => {
    vi.mocked(currentPlayer).mockResolvedValue(player)
    vi.mocked(findMediaOwner).mockResolvedValue({
      userId: 'bob',
      weekState: 'SUBMITTING',
      mediaPathname: 'submissions/1/bob/proof.mp4',
    })

    const res = await call('submissions/1/bob/proof.mp4')

    expect(res.status).toBe(200)
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
  })

  it('still 404s a refused viewer even when a Range header is present', async () => {
    // A range request must not become a side door around the reveal rule.
    vi.mocked(currentPlayer).mockResolvedValue(player)
    vi.mocked(findMediaOwner).mockResolvedValue({
      userId: 'alice',
      weekState: 'SUBMITTING',
      mediaPathname: 'submissions/1/alice/proof.mp4',
    })

    const res = await call('submissions/1/alice/proof.mp4', { Range: 'bytes=0-99' })

    expect(res.status).toBe(404)
    expect(get).not.toHaveBeenCalled()
  })
})
