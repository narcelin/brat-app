import { describe, it, expect } from 'vitest'
import { pickMimeType, MAX_PHOTO_EDGE } from '../../lib/media/recorder'

describe('pickMimeType', () => {
  it('prefers mp4/h264, which Safari records and every browser plays', () => {
    expect(pickMimeType(() => true)).toBe('video/mp4;codecs=avc1')
  })

  it('falls back to webm when mp4 is unavailable', () => {
    expect(pickMimeType((t) => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp8')
  })

  it('returns null when nothing is supported, so the caller can say so plainly', () => {
    expect(pickMimeType(() => false)).toBeNull()
  })
})

describe('MAX_PHOTO_EDGE', () => {
  it('caps photos at 1600px on the long edge, per the spec', () => {
    expect(MAX_PHOTO_EDGE).toBe(1600)
  })
})
