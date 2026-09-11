import { MAX_TRIM_SECONDS } from '../domain/trim'

/** Shortest clip worth submitting. Clamped against the recording itself, so a
 *  sub-second capture is still trimmable rather than impossible. */
export const MIN_TRIM_SECONDS = 1

export interface Range {
  start: number
  end: number
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function minGap(duration: number): number {
  return Math.min(MIN_TRIM_SECONDS, duration)
}

/** Dragging the start handle.
 *
 *  Pulling it away from the end past the 15s cap drags the end along rather
 *  than refusing to move — the handle stays under the finger, which is what
 *  makes the gesture feel right. Pushing it into the end stops at the minimum. */
export function adjustStart(next: number, current: Range, duration: number): Range {
  const gap = minGap(duration)
  const start = clamp(next, 0, Math.max(0, current.end - gap))
  const end = start + MAX_TRIM_SECONDS < current.end
    ? start + MAX_TRIM_SECONDS
    : current.end
  return { start, end: clamp(end, start + gap, duration) }
}

/** Dragging the end handle — the mirror of the above. */
export function adjustEnd(next: number, current: Range, duration: number): Range {
  const gap = minGap(duration)
  const end = clamp(next, Math.min(current.start + gap, duration), duration)
  const start = end - MAX_TRIM_SECONDS > current.start
    ? end - MAX_TRIM_SECONDS
    : current.start
  return { start: clamp(start, 0, end - gap), end }
}

/** Where a pointer landed on the track, in seconds. */
export function timeFromPosition(x: number, trackWidth: number, duration: number): number {
  if (trackWidth <= 0) return 0
  return clamp((x / trackWidth) * duration, 0, duration)
}

/** A sensible opening selection: the first 15 seconds, or the whole thing. */
export function initialRange(duration: number): Range {
  return { start: 0, end: Math.min(MAX_TRIM_SECONDS, duration) }
}

/** Re-fit a selection once the file's real duration is known.
 *
 *  The opening range is built from whatever duration the caller had at mount,
 *  which is 0 before anything has measured the file. This used to clamp with
 *  `Math.min` alone, and `Math.min(0, duration)` is 0 — so a range that
 *  started empty stayed empty however long the recording turned out to be,
 *  `validateTrim` refused it, and Submit was disabled with no way forward
 *  except Retake.
 *
 *  So a degenerate range is REBUILT rather than clamped. Clamping can only
 *  ever remove time, and the fault here is that there was none to begin with.
 */
export function reclampRange(current: Range, duration: number): Range {
  // Nothing known yet: leave the caller's range alone rather than rebuilding
  // it against a duration that is still missing.
  if (!Number.isFinite(duration) || duration <= 0) return current

  if (current.end <= current.start) return initialRange(duration)

  // `start` is clamped to at most `end - gap`, and `gap` is positive for any
  // usable duration, so the result cannot collapse. No separate guard for
  // that: an unreachable branch is one no test can hold to account.
  const gap = minGap(duration)
  const end = clamp(current.end, gap, duration)
  const start = clamp(current.start, 0, end - gap)

  return { start, end }
}
