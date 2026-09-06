/** Objective difficulty. Fixes the medal values so per-objective point
 *  values never have to be argued about individually. */
export type Tier = 'easy' | 'hard' | 'unhinged'

export interface MedalValues {
  first: number
  second: number
  third: number
  /** Awarded to every entrant who did not medal. */
  effort: number
}

/** Point table from the design spec. Effort points are deliberately small
 *  relative to medals: posting garbage on every objective must never beat
 *  genuinely trying once. */
export const MEDALS: Record<Tier, MedalValues> = {
  easy: { first: 15, second: 10, third: 5, effort: 2 },
  hard: { first: 30, second: 20, third: 10, effort: 3 },
  unhinged: { first: 50, second: 35, third: 20, effort: 5 },
}

export function medalsFor(tier: Tier): MedalValues {
  return MEDALS[tier]
}
