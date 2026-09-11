import { describe, it, expect } from 'vitest'
import {
  hasCameraApi,
  hasMultipleCameras,
  isStandalone,
  pickMimeType,
  MAX_PHOTO_EDGE,
  photoScale,
  photoTargetSize,
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

describe('photoScale', () => {
  it('scales a landscape frame against its long edge, not its short one', () => {
    // 4032x3024 -> long edge is the width.
    expect(photoScale(4032, 3024, 1600)).toBeCloseTo(1600 / 4032)
  })

  it('scales a portrait frame against its long edge, not its short one', () => {
    // 3024x4032 -> long edge is the height. Scaling against the short edge
    // here would give 1600/3024 and leave the height well over the cap.
    expect(photoScale(3024, 4032, 1600)).toBeCloseTo(1600 / 4032)
  })

  it('scales a square frame by either edge', () => {
    expect(photoScale(2400, 2400, 1600)).toBeCloseTo(1600 / 2400)
  })

  it('never upscales a frame already under the cap', () => {
    expect(photoScale(640, 480, 1600)).toBe(1)
    expect(photoScale(1600, 900, 1600)).toBe(1)
  })

  it('is a no-op for a frame with no pixels yet', () => {
    expect(photoScale(0, 0, 1600)).toBe(1)
  })

  it('defaults to the spec cap of 1600px on the long edge', () => {
    expect(MAX_PHOTO_EDGE).toBe(1600)
    expect(photoScale(3200, 1800)).toBeCloseTo(0.5)
  })
})

describe('photoTargetSize', () => {
  it('brings the long edge to the cap and keeps the aspect ratio', () => {
    expect(photoTargetSize(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it('caps the height for a portrait frame', () => {
    expect(photoTargetSize(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('leaves a small frame at its original size', () => {
    expect(photoTargetSize(640, 480, 1600)).toEqual({ width: 640, height: 480 })
  })

  it('rounds to whole pixels rather than producing a fractional canvas', () => {
    const size = photoTargetSize(1000, 3333, 1600)
    expect(Number.isInteger(size.width)).toBe(true)
    expect(Number.isInteger(size.height)).toBe(true)
    expect(size.height).toBe(1600)
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

describe('hasCameraApi', () => {
  it('is true when getUserMedia exists', () => {
    expect(hasCameraApi({ mediaDevices: { getUserMedia: () => {} } })).toBe(true)
  })

  it('is false when mediaDevices is missing entirely', () => {
    // The iOS standalone / insecure-context case. Reaching for .getUserMedia
    // here throws synchronously and no catch block sees it.
    expect(hasCameraApi({})).toBe(false)
  })

  it('is false when mediaDevices exists but getUserMedia does not', () => {
    expect(hasCameraApi({ mediaDevices: {} })).toBe(false)
  })
})

describe('isStandalone', () => {
  it('detects the iOS home-screen flag', () => {
    expect(isStandalone({ navigator: { standalone: true } })).toBe(true)
  })

  it('detects the standalone display mode', () => {
    expect(isStandalone({ matchMedia: () => ({ matches: true }) })).toBe(true)
  })

  it('is false in an ordinary browser tab', () => {
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigator: {} })).toBe(false)
  })

  it('survives a window without matchMedia', () => {
    expect(isStandalone({})).toBe(false)
  })
})

describe('hasMultipleCameras', () => {
  const cam = { kind: 'videoinput' }
  const mic = { kind: 'audioinput' }
  const speaker = { kind: 'audiooutput' }

  it('offers the flip when there are two cameras', () => {
    expect(hasMultipleCameras([cam, cam, mic])).toBe(true)
  })

  // A laptop with one camera and several audio devices must not get a flip
  // button: flipping stops the current camera first, so a flip with nowhere
  // to go costs the player their preview.
  it('does not count microphones or speakers as cameras', () => {
    expect(hasMultipleCameras([cam, mic, mic, speaker])).toBe(false)
    expect(hasMultipleCameras([mic, speaker])).toBe(false)
  })

  it('handles an empty device list', () => {
    expect(hasMultipleCameras([])).toBe(false)
  })
})
