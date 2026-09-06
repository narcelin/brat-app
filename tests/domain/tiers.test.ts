import { describe, it, expect } from 'vitest'
import { MEDALS, medalsFor, type Tier } from '../../lib/domain/tiers'

describe('tiers', () => {
  it('matches the point table in the spec', () => {
    expect(MEDALS.easy).toEqual({ first: 15, second: 10, third: 5, effort: 1 })
    expect(MEDALS.hard).toEqual({ first: 30, second: 20, third: 10, effort: 3 })
    expect(MEDALS.unhinged).toEqual({ first: 50, second: 35, third: 20, effort: 5 })
  })

  it('returns medal values for a tier', () => {
    expect(medalsFor('hard').first).toBe(30)
  })

  it('keeps effort worth roughly a tenth of gold, so farming effort never competes', () => {
    const tiers: Tier[] = ['easy', 'hard', 'unhinged']
    for (const tier of tiers) {
      const { first, effort } = MEDALS[tier]
      expect(effort * 10).toBeLessThanOrEqual(first)
    }
  })
})
