/** Gold, silver, bronze. */
export const MAX_PLACES = 3

/** Nobody wins a medal in a race they ran alone, so an objective can never
 *  award more places than it had entrants. */
export function placesAwarded(entrantCount: number): number {
  return Math.max(0, Math.min(MAX_PLACES, entrantCount))
}

/** One entrant means there is nothing to rank. It becomes "did they actually
 *  do this?" instead — without which an uncontested entry would score with
 *  nobody having verified it, and voting is the only verification the game
 *  has. */
export function isRatifyObjective(entrantCount: number): boolean {
  return entrantCount === 1
}

export type BallotResult = { ok: true } | { ok: false; reason: string }

/** A voter ranks as many places as the objective awards — minus themselves,
 *  since a player cannot vote for their own entry. */
export function validateBallot(
  ranking: string[],
  entrantIds: string[],
  voterId: string,
): BallotResult {
  if (entrantIds.length === 0) {
    return { ok: false, reason: 'Nobody entered this objective' }
  }

  if (ranking.includes(voterId)) {
    return { ok: false, reason: 'You cannot vote for yourself' }
  }

  if (new Set(ranking).size !== ranking.length) {
    return { ok: false, reason: 'Each player can be ranked only once' }
  }

  for (const id of ranking) {
    if (!entrantIds.includes(id)) {
      return { ok: false, reason: 'Someone on this ballot did not enter this objective' }
    }
  }

  // The voter's own entry is not theirs to rank, so it does not count toward
  // how many places they are being asked to fill.
  const rankable = entrantIds.filter((id) => id !== voterId).length
  const expected = Math.min(placesAwarded(entrantIds.length), rankable)

  if (ranking.length !== expected) {
    return {
      ok: false,
      reason: `Rank exactly ${expected} ${expected === 1 ? 'entry' : 'entries'}`,
    }
  }

  return { ok: true }
}
