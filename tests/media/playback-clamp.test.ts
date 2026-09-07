import { describe, it, expect } from 'vitest'
import { clampPlaybackTime, playStartPosition } from '../../lib/media/playback-clamp'

describe('clampPlaybackTime', () => {
  it('snaps back to trimStart once playback reaches trimEnd', () => {
    expect(clampPlaybackTime(10, 2, 10)).toBe(2)
    expect(clampPlaybackTime(10.5, 2, 10)).toBe(2)
  })

  it('snaps forward to trimStart when the position is dragged back before it', () => {
    // Well below trimStart, e.g. the native scrubber dragged to the lead-in.
    expect(clampPlaybackTime(0, 5, 10)).toBe(5)
    expect(clampPlaybackTime(4, 5, 10)).toBe(5)
  })

  it('does not correct small jitter just under trimStart during ordinary playback', () => {
    expect(clampPlaybackTime(4.9, 5, 10)).toBeNull()
  })

  it('does not correct positions within the trimmed range', () => {
    expect(clampPlaybackTime(5, 5, 10)).toBeNull()
    expect(clampPlaybackTime(7.5, 5, 10)).toBeNull()
    expect(clampPlaybackTime(9.99, 5, 10)).toBeNull()
  })

  it('handles the no-trim case (trimStart 0, trimEnd = duration)', () => {
    expect(clampPlaybackTime(0, 0, 30)).toBeNull()
    expect(clampPlaybackTime(15, 0, 30)).toBeNull()
    expect(clampPlaybackTime(30, 0, 30)).toBe(0)
  })
})

describe('playStartPosition', () => {
  it('starts from the current position when it sits inside the selection', () => {
    expect(playStartPosition(7, 5, 10)).toBe(7)
  })

  it('starts from range.start when the current position is before the selection', () => {
    expect(playStartPosition(1, 5, 10)).toBe(5)
  })

  it('starts from the current position exactly at the start boundary', () => {
    expect(playStartPosition(5, 5, 10)).toBe(5)
  })

  it('starts from range.start when the current position sits exactly at the end boundary', () => {
    // Playing from exactly trimEnd would have nothing left to play, so this
    // counts as "outside" and resets to the top of the selection.
    expect(playStartPosition(10, 5, 10)).toBe(5)
  })

  it('starts from range.start when the current position is past the end', () => {
    expect(playStartPosition(12, 5, 10)).toBe(5)
  })
})
