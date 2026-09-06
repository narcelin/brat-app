import { describe, it, expect } from 'vitest'
import {
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

  it('rejects a recording longer than the 60s cap', () => {
    const result = validateTrim(0, 10, MAX_RECORDING_SECONDS + 1)
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
