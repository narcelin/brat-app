/** Recording length drives file size and upload reliability. */
export const MAX_RECORDING_SECONDS = 60

/** Full duration probing needs a media parser and is out of scope for the
 *  server route, so this is the cheap check that stands in for it: a hard
 *  cap on upload size. 60s at the ~1.5 Mbps capture bitrate is roughly
 *  (1.5 Mbps / 8) * 60s =~ 11MB, so 25MB is generous headroom above a
 *  legitimate max-length recording while still refusing a wildly oversized
 *  upload. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/** How far past MAX_RECORDING_SECONDS a source may measure.
 *
 *  The recorder auto-stops AT the cap, so a full-length take's container
 *  reports a fraction over it — and MediaRecorder reports durations that are
 *  simply wrong on some devices. Validated against an exact 60, a legitimate
 *  max-length recording was refused.
 *
 *  That refusal was uniquely bad because the rule is about the SOURCE: no
 *  amount of trimming can satisfy it, so the review screen became a dead end
 *  with Submit disabled and nothing the player could do about it. The real
 *  guarantees are elsewhere and unaffected — MAX_TRIM_SECONDS caps what
 *  anyone has to watch, and MAX_UPLOAD_BYTES is checked against the stored
 *  blob's actual size rather than a client's claim about duration. */
export const RECORDING_TOLERANCE_SECONDS = 5

/** Trim length drives *viewing* time, which is the real constraint: with 16
 *  entrants, 60s clips would be 16 minutes to review a single objective.
 *  Capping the visible range at 15s keeps a week's voting near 15 minutes. */
export const MAX_TRIM_SECONDS = 15

export type TrimResult = { ok: true } | { ok: false; reason: string }

/** Trims are non-destructive: these offsets are stored as metadata and the
 *  player plays only that range. The file itself is never cut, which avoids
 *  transcoding entirely and keeps the full recording available. */
export function validateTrim(
  startSeconds: number,
  endSeconds: number,
  durationSeconds: number,
): TrimResult {
  for (const [name, value] of [
    ['start', startSeconds],
    ['end', endSeconds],
    ['duration', durationSeconds],
  ] as const) {
    if (!Number.isFinite(value)) {
      return { ok: false, reason: `Trim ${name} must be a finite number` }
    }
  }

  if (durationSeconds > MAX_RECORDING_SECONDS + RECORDING_TOLERANCE_SECONDS) {
    return { ok: false, reason: `Recording must be ${MAX_RECORDING_SECONDS}s or shorter` }
  }
  if (startSeconds < 0) {
    return { ok: false, reason: 'Trim start must not be negative' }
  }
  if (endSeconds <= startSeconds) {
    return { ok: false, reason: 'Trim end must come after trim start' }
  }
  if (endSeconds > durationSeconds) {
    return { ok: false, reason: 'Trim end must not run past the end of the recording' }
  }
  if (endSeconds - startSeconds > MAX_TRIM_SECONDS) {
    return { ok: false, reason: `Trimmed clip must be ${MAX_TRIM_SECONDS}s or shorter` }
  }

  return { ok: true }
}
