/** Tolerance below `trimStart` before we correct playback. Browsers fire
 *  `timeupdate` at coarse, irregular intervals and `currentTime` can land a
 *  hair before the exact boundary even during ordinary forward playback, so
 *  clamping on any shortfall at all would fight the video element every tick
 *  near the start. A small dead zone lets that jitter through while still
 *  catching a real seek back into the trimmed-out lead-in. */
const START_TOLERANCE_SECONDS = 0.25

/** Where playback should land, given the current position and the
 *  submitter's trim. Returns `null` when no correction is needed.
 *
 *  Enforces both edges: past `trimEnd` snaps back to `trimStart` (existing
 *  behaviour, e.g. the clip looping), and before `trimStart` (by more than
 *  the tolerance — reachable by dragging the native scrubber back to 0)
 *  snaps forward to `trimStart` so the cut lead-in stays unwatchable. */
export function clampPlaybackTime(
  currentTime: number,
  trimStart: number,
  trimEnd: number,
): number | null {
  if (currentTime >= trimEnd) return trimStart
  if (currentTime < trimStart - START_TOLERANCE_SECONDS) return trimStart
  return null
}
