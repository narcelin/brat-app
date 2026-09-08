/** The order entrants are shown in on a ballot.
 *
 *  Ballots used to come back in `ORDER BY s.id` — submission id, so insertion
 *  order — which put whoever posted first at the top of every objective, for
 *  every voter, all week. First position is where attention is highest, so
 *  that was a standing advantage for posting early.
 *
 *  The shuffle is deterministic in (voter, objective) rather than random per
 *  render. A fresh shuffle on every render would reorder the list under the
 *  voter's thumb: tap someone into first place, the component re-renders, and
 *  everything moves. Deterministic means one voter sees one stable order, and
 *  two voters almost always see different ones. */

/** Same mixing as `seedFromPlayerId`, kept local so a change to avatar seeding
 *  can never silently reshuffle everyone's ballots. */
function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0
  }
  // A non-zero, odd-ish start keeps the generator below off the fixed point at
  // zero, where every subsequent value would also be zero.
  return (h ^ 0x9e3779b9) >>> 0
}

/** Fisher-Yates, driven by a small deterministic PRNG.
 *
 *  Fisher-Yates specifically because it is a permutation: every element is
 *  placed exactly once. A sort with a random comparator — the obvious
 *  shorthand — is neither uniform nor guaranteed to preserve the list, and
 *  dropping an entrant here would silently remove them from the vote. */
export function shuffleEntrants<T extends { userId: string }>(
  entrants: readonly T[],
  viewerId: string,
  objectiveId: number,
): T[] {
  // Copied, never sorted in place: the caller's array is shared state.
  const out = [...entrants]

  let state = hash(`${viewerId}:${objectiveId}`)
  const next = () => {
    // xorshift32. Small, deterministic, and good enough to break up an
    // ordering — this is not, and must not be used as, a security PRNG.
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state
  }

  for (let i = out.length - 1; i > 0; i--) {
    const j = next() % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }

  return out
}
