import { describe, it, expect } from 'vitest'
import { MEDALS, medalsFor } from '../../lib/domain/tiers'

describe('tiers', () => {
  it('matches the point table in the spec', () => {
    expect(MEDALS.easy).toEqual({ first: 15, second: 10, third: 5, effort: 2 })
    expect(MEDALS.hard).toEqual({ first: 30, second: 20, third: 10, effort: 3 })
    expect(MEDALS.unhinged).toEqual({ first: 50, second: 35, third: 20, effort: 5 })
  })

  it('returns medal values for a tier', () => {
    expect(medalsFor('hard').first).toBe(30)
  })

  it('makes a full week of effort points worth less than a single gold, so farming never competes', () => {
    // A week is exactly one objective of each tier, so this is the most a
    // player can earn by entering everything and medalling in nothing.
    const weekOfPureEffort = MEDALS.easy.effort + MEDALS.hard.effort + MEDALS.unhinged.effort
    const cheapestGold = Math.min(MEDALS.easy.first, MEDALS.hard.first, MEDALS.unhinged.first)
    expect(weekOfPureEffort).toBeLessThan(cheapestGold)
  })
})
