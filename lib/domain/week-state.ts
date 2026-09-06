/** Lifecycle of a single week.
 *  PENDING   — objectives not yet revealed
 *  SUBMITTING— objectives visible, proof accepted, everything hidden from others
 *  VOTING    — submissions revealed, ranked ballots accepted, no new proof
 *  CLOSED    — scored and final */
export type WeekState = 'PENDING' | 'SUBMITTING' | 'VOTING' | 'CLOSED'

export interface WeekWindows {
  dropsAt: Date
  submissionsCloseAt: Date
  votingClosesAt: Date
}

/** Boundaries are half-open: a window starts at its instant and ends just
 *  before the next. Submissions therefore always close before voting opens,
 *  which is what stops late submitters from seeing the field first. */
export function weekState(windows: WeekWindows, now: Date): WeekState {
  const { dropsAt, submissionsCloseAt, votingClosesAt } = windows

  if (!(dropsAt < submissionsCloseAt && submissionsCloseAt < votingClosesAt)) {
    throw new Error(
      'Week windows out of order: expected dropsAt < submissionsCloseAt < votingClosesAt',
    )
  }

  if (now < dropsAt) return 'PENDING'
  if (now < submissionsCloseAt) return 'SUBMITTING'
  if (now < votingClosesAt) return 'VOTING'
  return 'CLOSED'
}

/** States an admin may force. `PENDING` is absent deliberately: un-dropping a
 *  week would hide objectives players have already seen. */
export const FORCEABLE_STATES = ['SUBMITTING', 'VOTING', 'CLOSED'] as const
export type ForcedState = (typeof FORCEABLE_STATES)[number]

export function isForcedState(value: unknown): value is ForcedState {
  return typeof value === 'string' && (FORCEABLE_STATES as readonly string[]).includes(value)
}

const ORDER: Record<WeekState, number> = {
  PENDING: 0,
  SUBMITTING: 1,
  VOTING: 2,
  CLOSED: 3,
}

/** The state actually in force: an admin override wins over the clock.
 *  Without an override the week still runs itself on its timestamps, so the
 *  game keeps working if nobody intervenes. */
export function effectiveWeekState(
  windows: WeekWindows,
  forced: ForcedState | null,
  now: Date,
): WeekState {
  const natural = weekState(windows, now)
  return forced ?? natural
}

export type ForceResult = { ok: true } | { ok: false; reason: string }

/** Advancing is one-way. Going backwards would reopen submissions after the
 *  field had been revealed, letting a player see everyone else's proof and
 *  then post their own — the exact thing the hidden-until-reveal rule exists
 *  to prevent. */
export function canForceState(current: WeekState, target: ForcedState): ForceResult {
  if (current === 'CLOSED') {
    return { ok: false, reason: 'This week is closed. Closed weeks cannot be changed.' }
  }
  if (ORDER[target] <= ORDER[current]) {
    return {
      ok: false,
      reason: `Cannot go from ${current} back to ${target}. Weeks only move forward.`,
    }
  }
  return { ok: true }
}

/** Clearing hands the week back to its timestamps. Refused once closed, since
 *  the clock could put it back into submissions. */
export function canClearOverride(current: WeekState): ForceResult {
  if (current === 'CLOSED') {
    return { ok: false, reason: 'A closed week cannot be reopened.' }
  }
  return { ok: true }
}
