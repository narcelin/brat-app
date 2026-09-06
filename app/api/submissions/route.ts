import { del, put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../lib/auth/current-player'
import { getCurrentWeek } from '../../../lib/db/queries'
import { sql } from '../../../lib/db/client'
import { canSubmit } from '../../../lib/domain/submission-rules'
import { MAX_UPLOAD_BYTES, validateTrim } from '../../../lib/domain/trim'

export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const form = await request.formData()
  const file = form.get('file')
  const objectiveId = Number(form.get('objectiveId'))
  const kind = String(form.get('kind'))

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file supplied' }, { status: 400 })
  }
  if (kind !== 'photo' && kind !== 'video') {
    return NextResponse.json({ error: 'Unknown media kind' }, { status: 400 })
  }

  // Cheap, meaningful checks on the file itself: full duration probing needs
  // a media parser and is out of scope, but a mismatched MIME type or a
  // wildly oversized upload are both detectable without one.
  const expectedPrefix = kind === 'video' ? 'video/' : 'image/'
  if (!file.type.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: `File does not look like a ${kind === 'video' ? 'video' : 'photo'}` },
      { status: 400 },
    )
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File is too large' }, { status: 413 })
  }

  if (!Number.isInteger(objectiveId)) {
    return NextResponse.json({ error: 'Invalid objective id' }, { status: 400 })
  }

  const week = await getCurrentWeek(player.id)
  if (!week) {
    return NextResponse.json({ error: 'No active week' }, { status: 400 })
  }
  if (!week.objectives.some((o) => o.id === objectiveId)) {
    return NextResponse.json({ error: 'Objective is not in the current week' }, { status: 400 })
  }
  if (!canSubmit(week.state)) {
    return NextResponse.json({ error: 'Submissions are closed' }, { status: 403 })
  }

  let trimStart: number | null = null
  let trimEnd: number | null = null
  let duration: number | null = null

  if (kind === 'video') {
    trimStart = Number(form.get('trimStart'))
    trimEnd = Number(form.get('trimEnd'))
    duration = Number(form.get('duration'))

    const trim = validateTrim(trimStart, trimEnd, duration)
    if (!trim.ok) {
      return NextResponse.json({ error: trim.reason }, { status: 400 })
    }
    // NOTE: `duration` (and trimStart/trimEnd) above are client-reported.
    // validateTrim only bounds them against MAX_RECORDING_SECONDS /
    // MAX_TRIM_SECONDS — it does not verify them against the actual media,
    // which would need a media parser. A client can still claim a false
    // duration for a real file. Do not treat duration_seconds as trustworthy
    // downstream.
  }

  // Private: the store is not publicly readable, so this URL is not a public
  // link. Phase 2 streams media back via get(pathname, { access: 'private' })
  // behind a Clerk check — which is why the pathname is persisted below.
  const blob = await put(`submissions/${objectiveId}/${player.id}-${Date.now()}`, file, {
    access: 'private',
    addRandomSuffix: true,
  })

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
    // The blob upload already succeeded; if the insert fails, best-effort
    // clean it up rather than leaving an orphaned blob. A cleanup failure
    // must never mask the original error.
    try {
      await del(blob.url)
    } catch {
      // best-effort only
    }
    throw err
  }

  return NextResponse.json({ id: rows[0].id })
}
