import { canSubmit } from './submission-rules'
import type { WeekState } from './week-state'
import { MAX_UPLOAD_BYTES, validateTrim } from './trim'

export type MediaKind = 'photo' | 'video'

/** The slice of a week this validator needs. Deliberately narrow: it must be
 *  constructible in a test without a database. */
export interface SubmissionWeek {
  state: WeekState
  objectives: { id: number }[]
}

/** Everything the caller knows about the attempt. All fields are `unknown`
 *  because every one of them arrives from the client (or, for `contentType`
 *  and `sizeBytes` at finalize time, from the blob store) and none may be
 *  trusted before it is checked here. */
export interface SubmissionRequest {
  objectiveId: unknown
  kind: unknown
  contentType: unknown
  sizeBytes: unknown
  trimStart?: unknown
  trimEnd?: unknown
  duration?: unknown
}

/** A request that passed every rule, narrowed to real types. */
export interface ValidSubmission {
  objectiveId: number
  kind: MediaKind
  contentType: string
  sizeBytes: number
  /** Null for photos: only video carries a trim range. */
  trimStart: number | null
  trimEnd: number | null
  duration: number | null
}

export type SubmissionValidation =
  | { ok: true; value: ValidSubmission }
  | { ok: false; status: number; error: string }

/** Content types the blob store will accept for proof. Anything else is
 *  neither a photo nor a video and has no business in the store. */
export const ALLOWED_CONTENT_TYPES = ['image/*', 'video/*'] as const

function contentTypePrefix(kind: MediaKind): string {
  return kind === 'video' ? 'video/' : 'image/'
}

/** Blob keys are derived entirely from the *session*, never from anything the
 *  client sends, and each player gets their own directory under the
 *  objective. The trailing slash matters: without it `user_A` would be a
 *  prefix of `user_AB`, and one player could claim another's upload. */
export function submissionPathnamePrefix(objectiveId: number, playerId: string): string {
  return `submissions/${objectiveId}/${playerId}/`
}

/** The exact key a client is allowed to upload to for this objective. */
export function submissionPathname(
  objectiveId: number,
  playerId: string,
  extension: string,
): string {
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  return `${submissionPathnamePrefix(objectiveId, playerId)}proof.${ext}`
}

/** True when `pathname` is a plain filename inside this player's own
 *  directory for this objective. `addRandomSuffix` appends to the *filename*,
 *  so a suffixed key still matches. Anything with a further path segment, or
 *  under another player's or objective's prefix, is rejected — a client must
 *  not be able to claim a key it did not upload. */
export function isOwnSubmissionPathname(
  pathname: unknown,
  objectiveId: number,
  playerId: string,
): pathname is string {
  if (typeof pathname !== 'string') return false
  const prefix = submissionPathnamePrefix(objectiveId, playerId)
  if (!pathname.startsWith(prefix)) return false
  const rest = pathname.slice(prefix.length)
  return rest.length > 0 && !rest.includes('/')
}

/** Every server-side rule for accepting proof, in one pure function.
 *
 *  The route is a thin caller of this: authentication and blob I/O stay in
 *  the route, but nothing about *whether the submission is allowed* does.
 *  That is what makes the fairness rules — in particular `canSubmit`, which
 *  is the only thing stopping a player posting after the deadline — testable
 *  without a running server. */
export function validateSubmissionRequest(
  week: SubmissionWeek | null,
  request: SubmissionRequest,
): SubmissionValidation {
  if (!week) {
    return { ok: false, status: 400, error: 'No active week' }
  }

  const objectiveId = request.objectiveId
  if (typeof objectiveId !== 'number' || !Number.isInteger(objectiveId)) {
    return { ok: false, status: 400, error: 'Invalid objective id' }
  }

  const kind = request.kind
  if (kind !== 'photo' && kind !== 'video') {
    return { ok: false, status: 400, error: 'Unknown media kind' }
  }

  // The objective must belong to the week that is open right now. Without
  // this, last week's objective id would be a back door into a closed week.
  if (!week.objectives.some((o) => o.id === objectiveId)) {
    return { ok: false, status: 400, error: 'Objective is not in the current week' }
  }

  if (!canSubmit(week.state)) {
    return { ok: false, status: 403, error: 'Submissions are closed' }
  }

  const contentType = request.contentType
  if (typeof contentType !== 'string' || !contentType.startsWith(contentTypePrefix(kind))) {
    return {
      ok: false,
      status: 400,
      error: `File does not look like a ${kind === 'video' ? 'video' : 'photo'}`,
    }
  }

  const sizeBytes = request.sizeBytes
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, status: 400, error: 'File is empty or has an unknown size' }
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: 'File is too large' }
  }

  if (kind === 'photo') {
    return {
      ok: true,
      value: {
        objectiveId,
        kind,
        contentType,
        sizeBytes,
        trimStart: null,
        trimEnd: null,
        duration: null,
      },
    }
  }

  const trimStart = Number(request.trimStart)
  const trimEnd = Number(request.trimEnd)
  const duration = Number(request.duration)

  const trim = validateTrim(trimStart, trimEnd, duration)
  if (!trim.ok) {
    return { ok: false, status: 400, error: trim.reason }
  }

  // NOTE: trimStart/trimEnd/duration are client-reported. validateTrim only
  // bounds them against MAX_RECORDING_SECONDS / MAX_TRIM_SECONDS — it does
  // not verify them against the actual media, which would need a media
  // parser. Do not treat duration_seconds as trustworthy downstream.
  return {
    ok: true,
    value: { objectiveId, kind, contentType, sizeBytes, trimStart, trimEnd, duration },
  }
}
