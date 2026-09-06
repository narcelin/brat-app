import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../../lib/auth/current-player'
import { getCurrentWeek } from '../../../../lib/db/queries'
import { MAX_UPLOAD_BYTES } from '../../../../lib/domain/trim'
import {
  ALLOWED_CONTENT_TYPES,
  isOwnSubmissionPathname,
  validateSubmissionRequest,
} from '../../../../lib/domain/submission-request'

/** Mints a short-lived, tightly scoped token so the browser can PUT the
 *  recording straight to Blob.
 *
 *  Why this exists at all: a request body routed through a serverless
 *  function is capped at ~4.5MB by the platform, well below a legitimate
 *  60s clip (~11MB at the capture bitrate), so anything past ~24s used to
 *  fail with a generic error before the route ever ran. Uploading from the
 *  client bypasses the function body limit entirely.
 *
 *  The token is not a blank cheque: every rule that governs whether this
 *  player may submit is re-checked here, server-side, and the destination
 *  key is pinned to the player's own directory.
 *
 *  There is deliberately no `onUploadCompleted`: that callback never fires on
 *  localhost, so putting the database insert in it would make local
 *  development silently broken. The client posts the resulting url and
 *  pathname to /api/submissions instead — a tiny JSON body, so the function
 *  body limit does not apply. */
export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let claim: Record<string, unknown>
        try {
          claim = JSON.parse(clientPayload ?? '') as Record<string, unknown>
        } catch {
          throw new Error('Invalid upload request')
        }

        // Re-read the week server-side. Nothing the client says about the
        // objective, the window, or the trim is taken on trust.
        const week = await getCurrentWeek(player.id)
        const check = validateSubmissionRequest(week, {
          objectiveId: claim.objectiveId,
          kind: claim.kind,
          contentType: claim.contentType,
          sizeBytes: claim.sizeBytes,
          trimStart: claim.trimStart,
          trimEnd: claim.trimEnd,
          duration: claim.duration,
        })
        if (!check.ok) {
          throw new Error(check.error)
        }

        // The destination key is derived from the session, not chosen by the
        // client: the requested pathname is only accepted if it already sits
        // in this player's own directory for this objective. Otherwise a
        // client could write over — or masquerade as — someone else's proof.
        if (!isOwnSubmissionPathname(pathname, check.value.objectiveId, player.id)) {
          throw new Error('Invalid upload path')
        }

        return {
          allowedContentTypes: [...ALLOWED_CONTENT_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          // No payload: the insert happens in /api/submissions, driven by the
          // client, so nothing needs to survive into onUploadCompleted.
          tokenPayload: null,
        }
      },
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload could not be authorised' },
      { status: 400 },
    )
  }
}
