import { get } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../../lib/auth/current-player'
import { findMediaOwner } from '../../../../lib/db/media'
import { canViewSubmission } from '../../../../lib/domain/submission-rules'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pathname: string[] }> },
) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { pathname: segments } = await params
  const pathname = segments.join('/')

  const owner = await findMediaOwner(pathname)
  // 404 rather than 403 for an unknown path: whether a given blob exists is
  // not something an unauthorised caller should be able to probe.
  if (!owner) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // The reveal rule, applied to the bytes themselves. Phase 1 keeps other
  // players' media out of the page; without this a player could stream a
  // rival's proof mid-week straight from the API.
  if (!canViewSubmission(owner.weekState, owner.userId, player.id)) {
    return NextResponse.json({ error: 'Not yet' }, { status: 403 })
  }

  const blob = await get(owner.mediaPathname, { access: 'private' })
  if (!blob) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': blob.headers.get('content-type') ?? 'application/octet-stream',
      // Per-player authorisation decides this response, so it must never land
      // in a shared cache.
      'Cache-Control': 'private, no-store',
    },
  })
}
