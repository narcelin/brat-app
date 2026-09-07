import { get } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../../lib/auth/current-player'
import { findMediaOwner } from '../../../../lib/db/media'
import { canViewSubmission } from '../../../../lib/domain/submission-rules'

export async function GET(
  request: Request,
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

  // iOS Safari refuses to play a <video> element unless the server supports
  // byte-range requests (a 206 with Content-Range) — so the incoming Range
  // header, if any, is forwarded to the blob store and the upstream's
  // partial-content response is passed back faithfully. Range handling only
  // happens here, after every guard above has already decided the caller
  // gets *some* bytes.
  const range = request.headers.get('range')
  const blob = await get(owner.mediaPathname, {
    access: 'private',
    ...(range ? { headers: { range } } : {}),
  })
  if (!blob) {
    return notFound()
  }

  const commonHeaders = {
    // Per-player authorisation decides this response, so it must never land
    // in a shared cache.
    'Cache-Control': 'private, no-store',
    // Advertised unconditionally, even on a first, un-ranged request, so the
    // browser knows it can come back with a Range header.
    'Accept-Ranges': 'bytes',
  }

  // The SDK collapses any 2xx upstream response (206 partial content
  // included) into `statusCode: 200` — the true status only survives in the
  // raw headers, so a Content-Range header is what actually distinguishes a
  // partial response from a full one.
  if (blob.statusCode === 200) {
    const contentRange = blob.headers.get('content-range')
    const contentLength = blob.headers.get('content-length')
    return new NextResponse(blob.stream, {
      status: contentRange ? 206 : 200,
      headers: {
        ...commonHeaders,
        'Content-Type': blob.headers.get('content-type') ?? 'application/octet-stream',
        ...(contentRange ? { 'Content-Range': contentRange } : {}),
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
      },
    })
  }

  // statusCode === 304: the upstream had nothing new to send. `stream` is
  // null here — passing a null body into a 200 response would silently
  // serve an empty video, so this is forwarded as its own bodyless 304
  // instead.
  return new NextResponse(null, {
    status: 304,
    headers: commonHeaders,
  })
}
