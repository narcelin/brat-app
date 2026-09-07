import { describe, it, expect } from 'vitest'
import { clampPlaybackTime } from '../../lib/media/playback-clamp'

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
