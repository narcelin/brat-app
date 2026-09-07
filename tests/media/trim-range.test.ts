import { describe, it, expect } from 'vitest'
import {
  MIN_TRIM_SECONDS, adjustEnd, adjustStart, initialRange, timeFromPosition,
} from '../../lib/media/trim-range'
import { MAX_TRIM_SECONDS, validateTrim } from '../../lib/domain/trim'

const DURATION = 60

describe('initialRange', () => {
  it('opens on the first 15 seconds of a long recording', () => {
    expect(initialRange(60)).toEqual({ start: 0, end: 15 })
  })

  it('selects the whole of a short recording', () => {
    expect(initialRange(4)).toEqual({ start: 0, end: 4 })
  })
})

describe('adjustStart', () => {
  it('moves the start handle', () => {
    expect(adjustStart(5, { start: 0, end: 15 }, DURATION)).toEqual({ start: 5, end: 15 })
  })

  it('drags the end along rather than refusing, so the handle stays under the finger', () => {
    // Pulling start back to 0 from a full 15s window at 20..35.
    expect(adjustStart(0, { start: 20, end: 35 }, DURATION)).toEqual({ start: 0, end: 15 })
  })

  it('stops at the minimum gap instead of crossing the end handle', () => {
    const r = adjustStart(30, { start: 10, end: 20 }, DURATION)
    expect(r.start).toBe(20 - MIN_TRIM_SECONDS)
    expect(r.end).toBe(20)
  })

  it('never goes negative', () => {
    expect(adjustStart(-10, { start: 5, end: 12 }, DURATION).start).toBe(0)
  })
})

describe('adjustEnd', () => {
  it('moves the end handle', () => {
    expect(adjustEnd(10, { start: 0, end: 15 }, DURATION)).toEqual({ start: 0, end: 10 })
  })

  it('drags the start along when pushed past the cap', () => {
    expect(adjustEnd(40, { start: 10, end: 25 }, DURATION)).toEqual({ start: 25, end: 40 })
  })

  it('stops at the minimum gap instead of crossing the start handle', () => {
    const r = adjustEnd(2, { start: 10, end: 20 }, DURATION)
    expect(r.end).toBe(10 + MIN_TRIM_SECONDS)
    expect(r.start).toBe(10)
  })

  it('never runs past the end of the recording', () => {
    expect(adjustEnd(999, { start: 0, end: 10 }, DURATION).end).toBe(DURATION)
  })
})

describe('every reachable range is one the server will accept', () => {
  it('holds across a sweep of drags on both handles', () => {
    for (const duration of [3, 12, 30, 60]) {
      let range = initialRange(duration)
      for (let step = -5; step <= duration + 5; step += 0.5) {
        range = adjustStart(step, range, duration)
        expect(validateTrim(range.start, range.end, duration).ok).toBe(true)
        range = adjustEnd(duration - step, range, duration)
        expect(validateTrim(range.start, range.end, duration).ok).toBe(true)
      }
    }
  })

  it('never exceeds the 15 second cap', () => {
    let range = initialRange(60)
    range = adjustEnd(60, range, 60)
    expect(range.end - range.start).toBeLessThanOrEqual(MAX_TRIM_SECONDS)
  })
})

describe('timeFromPosition', () => {
  it('maps the track to the timeline', () => {
    expect(timeFromPosition(150, 300, 60)).toBe(30)
    expect(timeFromPosition(0, 300, 60)).toBe(0)
    expect(timeFromPosition(300, 300, 60)).toBe(60)
  })

  it('clamps a drag that leaves the track', () => {
    expect(timeFromPosition(-50, 300, 60)).toBe(0)
    expect(timeFromPosition(9999, 300, 60)).toBe(60)
  })

  it('survives a zero-width track rather than dividing by zero', () => {
    expect(timeFromPosition(10, 0, 60)).toBe(0)
  })
})
