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
    return NextResponse.json(
      { error: 'Not signed in' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const { pathname: segments } = await params
  const pathname = segments.join('/')

  const notFound = () =>
    NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
    )

  const owner = await findMediaOwner(pathname)
  // A truly unknown pathname and a real submission the viewer isn't allowed
  // to see yet both report 404 "Not found", identically. Submission paths
  // are predictable (submissions/{objectiveId}/{playerId}/...), so if a
  // refused-but-existing blob answered differently (e.g. 403) a signed-in
  // player could enumerate paths and use the status code as an existence
  // oracle to learn who has submitted before the reveal — even though only
  // the response *shape* would leak that, since the roster already shows it
  // openly. The reveal rule (canViewSubmission) still gates the bytes below;
  // only the two "you don't get this" cases have been made indistinguishable.
  if (!owner) {
    return notFound()
  }

  // The reveal rule, applied to the bytes themselves. Phase 1 keeps other
  // players' media out of the page; without this a player could stream a
  // rival's proof mid-week straight from the API. Reported identically to
  // an unknown path (see above).
  if (!canViewSubmission(owner.weekState, owner.userId, player.id)) {
    return notFound()
  }

  const blob = await get(owner.mediaPathname, { access: 'private' })
  if (!blob) {
    return notFound()
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
