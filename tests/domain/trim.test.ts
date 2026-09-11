import { describe, it, expect } from 'vitest'
import {
  RECORDING_TOLERANCE_SECONDS,
  validateTrim,
  MAX_RECORDING_SECONDS,
  MAX_TRIM_SECONDS,
  MAX_UPLOAD_BYTES,
} from '../../lib/domain/trim'

describe('MAX_UPLOAD_BYTES', () => {
  it('is 25MB, generous headroom above a 60s recording at ~1.5 Mbps', () => {
    const bitrateBytesPerSecond = (1.5 * 1_000_000) / 8
    const expectedRecordingBytes = bitrateBytesPerSecond * MAX_RECORDING_SECONDS
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024)
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(expectedRecordingBytes)
    // "generous headroom", not an order of magnitude off
    expect(MAX_UPLOAD_BYTES).toBeLessThan(expectedRecordingBytes * 5)
  })
})

describe('validateTrim', () => {
  it('accepts a trim inside both caps', () => {
    expect(validateTrim(5, 15, 60)).toEqual({ ok: true })
  })

  it('accepts a trim of exactly the maximum length', () => {
    expect(validateTrim(0, MAX_TRIM_SECONDS, 60)).toEqual({ ok: true })
  })

  it('rejects a trim longer than the 15s cap, which is what bounds voting time', () => {
    const result = validateTrim(0, 16, 60)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/15/)
  })

  // Was MAX_RECORDING_SECONDS + 1, which is now deliberately accepted: the
  // recorder auto-stops AT the cap, so a full-length take measures a shade
  // over it and was being refused with no way for the player to comply. The
  // rule the player is told still reads 60s; the slack absorbs measurement
  // error, it does not raise the limit.
  it('rejects a recording longer than the 60s cap', () => {
    const result = validateTrim(0, 10, MAX_RECORDING_SECONDS * 2)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/60/)
  })

  it('rejects a trim that ends past the end of the recording', () => {
    const result = validateTrim(5, 30, 20)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/recording/i)
  })

  it('rejects a zero-length trim', () => {
    expect(validateTrim(5, 5, 60).ok).toBe(false)
  })

  it('rejects a backwards trim', () => {
    expect(validateTrim(10, 5, 60).ok).toBe(false)
  })

  it('rejects a negative start', () => {
    expect(validateTrim(-1, 5, 60).ok).toBe(false)
  })

  it('rejects non-finite input rather than trusting the client', () => {
    expect(validateTrim(NaN, 5, 60).ok).toBe(false)
    expect(validateTrim(0, Infinity, 60).ok).toBe(false)
  })
})

describe('validateTrim source-length tolerance', () => {
  // THE BUG. The recorder auto-stops AT the cap, so a full-length recording's
  // container routinely reports a fraction over 60 — and MediaRecorder is
  // known to report durations that are simply wrong on some devices. An exact
  // ceiling therefore refused a legitimate recording, and no amount of
  // trimming can satisfy a SOURCE-length rule, so the review screen became a
  // dead end with Submit disabled forever.
  it('accepts a recording that overshoots the cap by the auto-stop margin', () => {
    expect(validateTrim(0, 10, MAX_RECORDING_SECONDS + 0.3).ok).toBe(true)
    expect(validateTrim(0, 10, MAX_RECORDING_SECONDS + RECORDING_TOLERANCE_SECONDS).ok).toBe(true)
  })

  it('still refuses a source far past the cap', () => {
    const result = validateTrim(0, 10, MAX_RECORDING_SECONDS + RECORDING_TOLERANCE_SECONDS + 0.1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('shorter')
  })

  // The tolerance exists for container overshoot, not to raise the limit. A
  // clip twice the length must still be refused.
  it('refuses a clearly over-length recording', () => {
    expect(validateTrim(0, 10, 120).ok).toBe(false)
  })
})
