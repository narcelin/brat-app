import { describe, it, expect } from 'vitest'
import { buildStandings } from '../../lib/db/standings'
import { medalsFor } from '../../lib/domain/tiers'

const players = [
  { id: 'alice', display_name: 'Alice', avatar_seed: 1 },
  { id: 'bob', display_name: 'Bob', avatar_seed: 2 },
  { id: 'carol', display_name: 'Carol', avatar_seed: 3 },
]

const hard = medalsFor('hard')

describe('buildStandings', () => {
  it('totals points across objectives', () => {
    const standings = buildStandings(
      [
        {
          tier: 'hard',
          entrantIds: ['alice', 'bob'],
          ballots: [{ voterId: 'carol', ranking: ['alice', 'bob'] }],
          ratifications: [],
        },
        {
          tier: 'hard',
          entrantIds: ['alice', 'bob'],
          ballots: [{ voterId: 'carol', ranking: ['bob', 'alice'] }],
          ratifications: [],
        },
      ],
      players,
    )
    const alice = standings.find((s) => s.userId === 'alice')!
    expect(alice.points).toBe(hard.first + hard.second)
    expect(alice.golds).toBe(1)
    expect(alice.silvers).toBe(1)
  })

  it('orders by points, highest first', () => {
    const standings = buildStandings(
      [
        {
          tier: 'hard',
          entrantIds: ['alice', 'bob'],
          ballots: [{ voterId: 'carol', ranking: ['alice', 'bob'] }],
          ratifications: [],
        },
      ],
      players,
    )
    expect(standings[0].userId).toBe('alice')
  })

  it('includes players who never entered, on zero', () => {
    const standings = buildStandings([], players)
    expect(standings).toHaveLength(3)
    expect(standings.every((s) => s.points === 0)).toBe(true)
  })

  it('scores a ratified single entry', () => {
    const standings = buildStandings(
      [
        {
          tier: 'hard',
          entrantIds: ['alice'],
          ballots: [],
          ratifications: [true, true],
        },
      ],
      players,
    )
    expect(standings.find((s) => s.userId === 'alice')!.points).toBe(hard.first)
  })

  it('counts a shared gold for both players', () => {
    const standings = buildStandings(
      [
        {
          tier: 'hard',
          entrantIds: ['alice', 'bob'],
          ballots: [
            { voterId: 'carol', ranking: ['alice', 'bob'] },
            { voterId: 'dave', ranking: ['bob', 'alice'] },
          ],
          ratifications: [],
        },
      ],
      players,
    )
    expect(standings.find((s) => s.userId === 'alice')!.golds).toBe(1)
    expect(standings.find((s) => s.userId === 'bob')!.golds).toBe(1)
  })
})
