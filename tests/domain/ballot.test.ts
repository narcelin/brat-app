import { describe, it, expect } from 'vitest'
import {
  MAX_PLACES, isRatifyObjective, placesAwarded, validateBallot,
} from '../../lib/domain/ballot'

describe('placesAwarded', () => {
  it('never awards more places than there were entrants', () => {
    expect(placesAwarded(1)).toBe(1)
    expect(placesAwarded(2)).toBe(2)
    expect(placesAwarded(3)).toBe(3)
  })

  it('caps at three however many entered', () => {
    expect(placesAwarded(4)).toBe(MAX_PLACES)
    expect(placesAwarded(16)).toBe(MAX_PLACES)
  })

  it('awards nothing when nobody entered', () => {
    expect(placesAwarded(0)).toBe(0)
  })
})

describe('isRatifyObjective', () => {
  it('is a ratify vote with exactly one entrant', () => {
    expect(isRatifyObjective(1)).toBe(true)
  })

  it('is a ranked ballot with two or more', () => {
    expect(isRatifyObjective(2)).toBe(false)
  })

  it('is neither with no entrants', () => {
    expect(isRatifyObjective(0)).toBe(false)
  })
})

describe('validateBallot', () => {
  const entrants = ['alice', 'bob', 'carol', 'dave']

  it('accepts a full ranking from someone who did not enter', () => {
    expect(validateBallot(['alice', 'bob', 'carol'], entrants, 'zoe')).toEqual({ ok: true })
  })

  it('rejects a voter ranking themselves', () => {
    const result = validateBallot(['alice', 'bob', 'carol'], entrants, 'alice')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/yourself/i)
  })

  it('rejects the same player twice', () => {
    const result = validateBallot(['alice', 'alice', 'bob'], entrants, 'zoe')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/once/i)
  })

  it('rejects a player who did not enter this objective', () => {
    const result = validateBallot(['alice', 'bob', 'stranger'], entrants, 'zoe')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/did not enter/i)
  })

  it('requires exactly as many places as the objective awards', () => {
    expect(validateBallot(['alice', 'bob'], entrants, 'zoe').ok).toBe(false)
    expect(validateBallot(['alice', 'bob', 'carol', 'dave'], entrants, 'zoe').ok).toBe(false)
  })

  it('ranks only two when only two entered', () => {
    expect(validateBallot(['alice', 'bob'], ['alice', 'bob'], 'zoe')).toEqual({ ok: true })
  })

  it('lets an entrant rank everyone except themselves', () => {
    // Alice entered a three-way race, so she ranks the other two.
    expect(validateBallot(['bob', 'carol'], ['alice', 'bob', 'carol'], 'alice')).toEqual({ ok: true })
  })

  it('rejects a ballot on an objective nobody entered', () => {
    expect(validateBallot([], [], 'zoe').ok).toBe(false)
  })
})
