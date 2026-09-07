import { describe, it, expect } from 'vitest'
import { shapeTurnout, type TurnoutRow } from '../../lib/db/turnout'

const rows: TurnoutRow[] = [
  { objective_id: 1, title: 'Fridge', entrants: 3, voters: 5, eligible: 16 },
  { objective_id: 2, title: 'Handstand', entrants: 1, voters: 0, eligible: 16 },
]

describe('shapeTurnout', () => {
  it('reports voters against eligible players per objective', () => {
    const turnout = shapeTurnout(rows)
    expect(turnout[0]).toEqual({
      objectiveId: 1, title: 'Fridge', entrants: 3, voters: 5, eligible: 16,
    })
  })

  it('handles an objective nobody has voted on yet', () => {
    expect(shapeTurnout(rows)[1].voters).toBe(0)
  })

  it('handles a week with no objectives', () => {
    expect(shapeTurnout([])).toEqual([])
  })
})
