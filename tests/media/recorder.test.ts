import { describe, it, expect } from 'vitest'
import {
  pickMimeType,
  MAX_PHOTO_EDGE,
  canStartRecording,
  canStopRecording,
  isVideoFrameReady,
} from '../../lib/media/recorder'

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

describe('canStartRecording', () => {
  it('allows starting when no recorder has ever been created', () => {
    expect(canStartRecording(null)).toBe(true)
  })

  it('allows starting once a prior recorder has fully stopped', () => {
    expect(canStartRecording('inactive')).toBe(true)
  })

  it('refuses a second start while a recorder is already recording (double-tap guard)', () => {
    expect(canStartRecording('recording')).toBe(false)
  })

  it('refuses a second start while a recorder is paused', () => {
    expect(canStartRecording('paused')).toBe(false)
  })
})

describe('canStopRecording', () => {
  it('refuses to stop when no recorder exists', () => {
    expect(canStopRecording(null)).toBe(false)
  })

  it('refuses to stop a recorder that already wound down', () => {
    expect(canStopRecording('inactive')).toBe(false)
  })

  it('allows stopping an active recording', () => {
    expect(canStopRecording('recording')).toBe(true)
  })

  it('allows stopping a paused recording', () => {
    expect(canStopRecording('paused')).toBe(true)
  })
})

describe('isVideoFrameReady', () => {
  it('is not ready before the stream has produced a frame', () => {
    expect(isVideoFrameReady(0, 0)).toBe(false)
  })

  it('is not ready with a zero width or height alone', () => {
    expect(isVideoFrameReady(0, 480)).toBe(false)
    expect(isVideoFrameReady(640, 0)).toBe(false)
  })

  it('is ready once both dimensions are populated', () => {
    expect(isVideoFrameReady(640, 480)).toBe(true)
  })
})
