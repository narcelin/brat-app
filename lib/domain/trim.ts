/** Recording length drives file size and upload reliability. */
export const MAX_RECORDING_SECONDS = 60

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

  if (durationSeconds > MAX_RECORDING_SECONDS) {
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
