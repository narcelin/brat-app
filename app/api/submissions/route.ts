import { del, head } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../lib/auth/current-player'
import { getCurrentWeek } from '../../../lib/db/queries'
import { sql } from '../../../lib/db/client'
import {
  isOwnSubmissionPathname,
  validateSubmissionRequest,
} from '../../../lib/domain/submission-request'

/** Best-effort cleanup of a blob we are about to stop referencing. A cleanup
 *  failure must never mask the reason we are cleaning up. */
async function discard(pathname: string) {
  try {
    await del(pathname)
  } catch {
    // best-effort only
  }
}

/** Records a submission whose media has already been uploaded straight to
 *  Blob by the client (see ./upload/route.ts for why).
 *
 *  The body here is tiny JSON — a url, a pathname and the trim metadata — so
 *  the platform's ~4.5MB function body limit is irrelevant.
 *
 *  Everything is re-checked. Holding a token from the upload route is not
 *  proof that the submission is still allowed: the window may have closed
 *  between minting the token and finishing the upload, and the client may
 *  simply be lying. In particular the pathname is verified against the key
 *  this player is allowed to write, and the blob is confirmed to actually
 *  exist — a client must not be able to claim a pathname it did not upload,
 *  nor point the row at someone else's media. */
export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const objectiveId = body.objectiveId
  const pathname = body.pathname

  // Pure string checks against the session, so they run before any I/O.
  if (typeof objectiveId !== 'number' || !Number.isInteger(objectiveId)) {
    return NextResponse.json({ error: 'Invalid objective id' }, { status: 400 })
  }
  if (!isOwnSubmissionPathname(pathname, objectiveId, player.id)) {
    return NextResponse.json({ error: 'Invalid upload reference' }, { status: 400 })
  }

  // The blob's own metadata is the trustworthy source for size and content
  // type — far better than the client's claim, which is all the old
  // multipart route ever had.
  let blob
  try {
    blob = await head(pathname)
  } catch {
    return NextResponse.json({ error: 'Upload not found' }, { status: 400 })
  }

  const week = await getCurrentWeek(player.id)
  const check = validateSubmissionRequest(week, {
    objectiveId,
    kind: body.kind,
    contentType: blob.contentType,
    sizeBytes: blob.size,
    trimStart: body.trimStart,
    trimEnd: body.trimEnd,
    duration: body.duration,
  })

  if (!check.ok) {
    // The upload is already in the store and will never be referenced, so
    // clean it up rather than leaving an orphan behind.
    await discard(blob.pathname)
    return NextResponse.json({ error: check.error }, { status: check.status })
  }

  const { kind, trimStart, trimEnd, duration } = check.value

  let rows: { id: number }[]
  try {
    rows = (await sql`
      INSERT INTO submissions
        (objective_id, user_id, media_url, media_pathname, media_type, duration_seconds, trim_start, trim_end)
      VALUES
        (${objectiveId}, ${player.id}, ${blob.url}, ${blob.pathname}, ${kind}, ${duration}, ${trimStart}, ${trimEnd})
      ON CONFLICT (objective_id, user_id) DO UPDATE
        SET media_url = EXCLUDED.media_url,
            media_pathname = EXCLUDED.media_pathname,
            media_type = EXCLUDED.media_type,
            duration_seconds = EXCLUDED.duration_seconds,
            trim_start = EXCLUDED.trim_start,
            trim_end = EXCLUDED.trim_end,
            created_at = now()
      RETURNING id
    `) as { id: number }[]
  } catch (err) {
    await discard(blob.pathname)
    throw err
  }

  return NextResponse.json({ id: rows[0].id })
}
