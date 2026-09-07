import { describe, it, expect } from 'vitest'
import { bordaScores, scoreObjective, scoreRatify } from '../../lib/domain/scoring'
import { medalsFor } from '../../lib/domain/tiers'

const hard = medalsFor('hard') // 30 / 20 / 10, effort 3

describe('bordaScores', () => {
  it('weights a first place above a second above a third', () => {
    const scores = bordaScores(
      [{ voterId: 'zoe', ranking: ['alice', 'bob', 'carol'] }],
      ['alice', 'bob', 'carol'],
    )
    expect(scores.get('alice')).toBe(3)
    expect(scores.get('bob')).toBe(2)
    expect(scores.get('carol')).toBe(1)
  })

  it('gives an entrant nobody ranked a zero rather than leaving them out', () => {
    const scores = bordaScores([{ voterId: 'zoe', ranking: ['alice'] }], ['alice', 'dave'])
    expect(scores.get('dave')).toBe(0)
  })

  it('sums across voters', () => {
    const scores = bordaScores(
      [
        { voterId: 'zoe', ranking: ['alice', 'bob'] },
        { voterId: 'yan', ranking: ['bob', 'alice'] },
      ],
      ['alice', 'bob'],
    )
    expect(scores.get('alice')).toBe(5)
    expect(scores.get('bob')).toBe(5)
  })
})

describe('scoreObjective', () => {
  const entrants = ['alice', 'bob', 'carol', 'dave']

  it('awards gold, silver and bronze by total', () => {
    const awards = scoreObjective(
      [
        { voterId: 'zoe', ranking: ['alice', 'bob', 'carol'] },
        { voterId: 'yan', ranking: ['alice', 'bob', 'carol'] },
      ],
      entrants,
      'hard',
    )
    const by = (id: string) => awards.find((a) => a.userId === id)!
    expect(by('alice').place).toBe(1)
    expect(by('alice').points).toBe(hard.first)
    expect(by('bob').place).toBe(2)
    expect(by('bob').points).toBe(hard.second)
    expect(by('carol').place).toBe(3)
    expect(by('carol').points).toBe(hard.third)
  })

  it('gives effort points to an entrant who did not medal', () => {
    const awards = scoreObjective(
      [{ voterId: 'zoe', ranking: ['alice', 'bob', 'carol'] }],
      entrants,
      'hard',
    )
    const dave = awards.find((a) => a.userId === 'dave')!
    expect(dave.place).toBeNull()
    expect(dave.points).toBe(hard.effort)
  })

  it('shares a place on a tie and skips the next', () => {
    // Alice and Bob both total 5; Carol trails.
    const awards = scoreObjective(
      [
        { voterId: 'zoe', ranking: ['alice', 'bob', 'carol'] },
        { voterId: 'yan', ranking: ['bob', 'alice', 'carol'] },
      ],
      ['alice', 'bob', 'carol'],
      'hard',
    )
    const by = (id: string) => awards.find((a) => a.userId === id)!
    expect(by('alice').place).toBe(1)
    expect(by('bob').place).toBe(1)
    expect(by('alice').points).toBe(hard.first)
    expect(by('bob').points).toBe(hard.first)
    // Silver is skipped; the next distinct score takes bronze.
    expect(by('carol').place).toBe(3)
    expect(by('carol').points).toBe(hard.third)
  })

  it('awards only as many places as there were entrants', () => {
    const awards = scoreObjective(
      [{ voterId: 'zoe', ranking: ['alice', 'bob'] }],
      ['alice', 'bob'],
      'hard',
    )
    expect(awards.find((a) => a.userId === 'alice')!.place).toBe(1)
    expect(awards.find((a) => a.userId === 'bob')!.place).toBe(2)
    expect(awards.some((a) => a.place === 3)).toBe(false)
  })

  it('gives everyone effort points when nobody voted at all', () => {
    const awards = scoreObjective([], entrants, 'hard')
    // No ballots means no ranking is defensible, so nobody takes a medal.
    expect(awards.every((a) => a.place === null)).toBe(true)
    expect(awards.every((a) => a.points === hard.effort)).toBe(true)
  })

  it('returns nothing for an objective nobody entered', () => {
    expect(scoreObjective([], [], 'hard')).toEqual([])
  })
})

describe('scoreRatify', () => {
  it('awards first place when a majority of votes cast approve', () => {
    const awards = scoreRatify([true, true, false], 'alice', 'hard')
    expect(awards[0].place).toBe(1)
    expect(awards[0].points).toBe(hard.first)
  })

  it('gives only effort points when the majority say no', () => {
    const awards = scoreRatify([true, false, false], 'alice', 'hard')
    expect(awards[0].place).toBeNull()
    expect(awards[0].points).toBe(hard.effort)
  })

  it('counts a majority of votes cast, not of the whole group', () => {
    // Two votes, both yes: that is a majority even in a group of sixteen.
    expect(scoreRatify([true, true], 'alice', 'hard')[0].place).toBe(1)
  })

  it('treats an exact split as not ratified', () => {
    expect(scoreRatify([true, false], 'alice', 'hard')[0].place).toBeNull()
  })

  it('gives effort points when nobody voted', () => {
    const awards = scoreRatify([], 'alice', 'hard')
    expect(awards[0].place).toBeNull()
    expect(awards[0].points).toBe(hard.effort)
  })
})
