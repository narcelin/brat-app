import { placesAwarded } from './ballot'
import { medalsFor, type Tier } from './tiers'

export interface CastBallot {
  voterId: string
  ranking: string[]
}

export interface Award {
  userId: string
  /** 1, 2 or 3, or null for an entrant who did not medal. */
  place: number | null
  points: number
  bordaScore: number
}

/** A 1st-place vote is worth 3, a 2nd 2, a 3rd 1. Entrants nobody ranked score
 *  zero rather than being omitted, so every entrant appears in the result. */
export function bordaScores(
  ballots: CastBallot[],
  entrantIds: string[],
): Map<string, number> {
  const scores = new Map<string, number>(entrantIds.map((id) => [id, 0]))

  for (const ballot of ballots) {
    ballot.ranking.forEach((userId, index) => {
      if (!scores.has(userId)) return // not an entrant; ignore rather than throw
      scores.set(userId, (scores.get(userId) ?? 0) + Math.max(0, 3 - index))
    })
  }

  return scores
}

function medalPoints(tier: Tier, place: number | null): number {
  const medals = medalsFor(tier)
  if (place === 1) return medals.first
  if (place === 2) return medals.second
  if (place === 3) return medals.third
  return medals.effort
}

export function scoreObjective(
  ballots: CastBallot[],
  entrantIds: string[],
  tier: Tier,
): Award[] {
  if (entrantIds.length === 0) return []

  const scores = bordaScores(ballots, entrantIds)
  const places = placesAwarded(entrantIds.length)

  // With no ballots at all there is no defensible ranking, so nobody medals
  // and everyone who entered takes effort points.
  const anyVotes = [...scores.values()].some((score) => score > 0)

  const allScores = [...scores.values()]

  return entrantIds.map((userId) => {
    const score = scores.get(userId) ?? 0
    // Competition ranking: your place is one more than the number of people
    // who beat you. Ties therefore share a place and skip the next — two
    // golds means no silver, and the next distinct score takes bronze.
    // (Indexing into the distinct sorted scores would give DENSE ranking,
    // 1-1-2, which is not the agreed rule.)
    const rank = allScores.filter((other) => other > score).length + 1
    const place = anyVotes && score > 0 && rank <= places ? rank : null

    return { userId, place, points: medalPoints(tier, place), bordaScore: score }
  })
}

/** A lone entrant is not ranked but ratified: did they actually do it? A
 *  majority of the votes ACTUALLY CAST decides, not a majority of the group —
 *  otherwise a quiet week would fail an honest entry. */
export function scoreRatify(
  approvals: boolean[],
  entrantId: string,
  tier: Tier,
): Award[] {
  const yes = approvals.filter(Boolean).length
  const ratified = approvals.length > 0 && yes * 2 > approvals.length
  const place = ratified ? 1 : null

  return [{ userId: entrantId, place, points: medalPoints(tier, place), bordaScore: yes }]
}
