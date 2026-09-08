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
      new Map(),
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
      new Map(),
    )
    expect(standings[0].userId).toBe('alice')
  })

  it('includes players who never entered, on zero', () => {
    const standings = buildStandings([], players, new Map())
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
      new Map(),
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
      new Map(),
    )
    expect(standings.find((s) => s.userId === 'alice')!.golds).toBe(1)
    expect(standings.find((s) => s.userId === 'bob')!.golds).toBe(1)
  })

  it('breaks a full tie (points, golds, display name) deterministically on userId', () => {
    const tiedPlayers = [
      { id: 'zed', display_name: 'Sam', avatar_seed: 1 },
      { id: 'amy', display_name: 'Sam', avatar_seed: 2 },
    ]
    const standings = buildStandings([], tiedPlayers, new Map())
    // Both players are tied on every prior key (points 0, golds 0, same
    // displayName), so only the userId tiebreak decides the order.
    expect(standings.map((s) => s.userId)).toEqual(['amy', 'zed'])
  })
})

describe('buildStandings participation count', () => {
  const entries = new Map([['alice', 7], ['bob', 2]])

  it('reports how many objectives each player has posted for', () => {
    const standings = buildStandings([], players, entries)
    expect(standings.find((s) => s.userId === 'alice')!.entries).toBe(7)
    expect(standings.find((s) => s.userId === 'bob')!.entries).toBe(2)
  })

  // Someone who has never posted is exactly who this feature is for: the
  // count must render as 0, not go missing.
  it('reports zero for a player with no submissions at all', () => {
    const standings = buildStandings([], players, entries)
    expect(standings.find((s) => s.userId === 'carol')!.entries).toBe(0)
  })

  // THE CORRUPTION RISK. The count is drawn from every dropped week, while
  // points come only from weeks that finished voting. Participation must be
  // decorative: if it could reach points, golds or the order, an unscored
  // week would leak into the table.
  it('never affects points, medals or order', () => {
    const objectives = [
      {
        tier: 'hard' as const,
        entrantIds: ['alice', 'bob'],
        ballots: [{ voterId: 'carol', ranking: ['bob', 'alice'] }],
        ratifications: [],
      },
    ]
    const without = buildStandings(objectives, players, new Map())
    const with_ = buildStandings(objectives, players, new Map([['alice', 99], ['carol', 50]]))

    expect(with_.map((s) => s.userId)).toEqual(without.map((s) => s.userId))
    for (let i = 0; i < without.length; i++) {
      expect(with_[i].points).toBe(without[i].points)
      expect(with_[i].golds).toBe(without[i].golds)
      expect(with_[i].silvers).toBe(without[i].silvers)
      expect(with_[i].bronzes).toBe(without[i].bronzes)
    }
  })

  // A huge participation count must not lift anyone above a better-scoring
  // player. Ranking stays points, then golds.
  it('does not let participation outrank points', () => {
    const objectives = [
      {
        tier: 'hard' as const,
        entrantIds: ['alice', 'bob'],
        ballots: [{ voterId: 'carol', ranking: ['alice', 'bob'] }],
        ratifications: [],
      },
    ]
    const standings = buildStandings(objectives, players, new Map([['carol', 24]]))
    expect(standings[0].userId).toBe('alice')
  })
})
