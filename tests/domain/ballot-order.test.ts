import { describe, it, expect } from 'vitest'
import { shuffleEntrants } from '../../lib/domain/ballot-order'

const ids = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank']
const entrants = ids.map((userId) => ({ userId }))

describe('shuffleEntrants', () => {
  // THE DANGEROUS FAILURE. A shuffle that drops or duplicates an entrant
  // silently removes someone from the vote, or lets them be ranked twice.
  // Nothing downstream would notice: validateBallot checks the ranking
  // against the entrant list it was given, so a short list validates fine.
  it('returns every entrant exactly once', () => {
    for (const voter of ['alice', 'zed', 'x', '']) {
      for (let objectiveId = 1; objectiveId <= 40; objectiveId++) {
        const out = shuffleEntrants(entrants, voter, objectiveId)
        expect(out).toHaveLength(entrants.length)
        expect([...out.map((e) => e.userId)].sort()).toEqual([...ids].sort())
      }
    }
  })

  // Without this the list reorders under the voter's thumb: tap someone into
  // first place, the component re-renders, and everything moves.
  it('gives the same voter the same order every time', () => {
    const a = shuffleEntrants(entrants, 'alice', 7).map((e) => e.userId)
    const b = shuffleEntrants(entrants, 'alice', 7).map((e) => e.userId)
    expect(a).toEqual(b)
  })

  it('gives different voters different orders', () => {
    const orders = ['alice', 'bob', 'carol', 'dave', 'erin'].map((v) =>
      shuffleEntrants(entrants, v, 7).map((e) => e.userId).join(','),
    )
    expect(new Set(orders).size).toBeGreaterThan(1)
  })

  it('gives one voter different orders across objectives', () => {
    const orders = [1, 2, 3, 4, 5].map((id) =>
      shuffleEntrants(entrants, 'alice', id).map((e) => e.userId).join(','),
    )
    expect(new Set(orders).size).toBeGreaterThan(1)
  })

  // Posting order must not survive. This is the whole point: today the
  // earliest submission is always on top for everyone.
  it('does not leave the input order in place for most voters', () => {
    const original = ids.join(',')
    const unchanged = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].filter(
      (v) => shuffleEntrants(entrants, v, 3).map((e) => e.userId).join(',') === original,
    )
    expect(unchanged.length).toBeLessThan(4)
  })

  it('does not mutate the array it was given', () => {
    const input = [...entrants]
    shuffleEntrants(input, 'alice', 1)
    expect(input.map((e) => e.userId)).toEqual(ids)
  })

  it('handles zero and one entrant', () => {
    expect(shuffleEntrants([], 'alice', 1)).toEqual([])
    expect(shuffleEntrants([entrants[0]], 'alice', 1)).toEqual([entrants[0]])
  })
})
