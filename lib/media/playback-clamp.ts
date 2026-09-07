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

/** Where a play press should start from, given the current playhead position
 *  and the selected range. Playing only the selection (rather than the whole
 *  recording) is only meaningful if a fresh press always lands inside it: a
 *  playhead left outside the range — before it, or sitting at/past the end
 *  from a previous play running to completion — resets to `trimStart`, so
 *  pressing play always replays the selection rather than silently doing
 *  nothing. A playhead already inside the range (e.g. paused mid-clip) is
 *  left where it is. The end boundary itself counts as "outside": starting
 *  exactly at `trimEnd` would have nothing left to play. */
export function playStartPosition(
  currentTime: number,
  trimStart: number,
  trimEnd: number,
): number {
  if (currentTime < trimStart || currentTime >= trimEnd) return trimStart
  return currentTime
}
