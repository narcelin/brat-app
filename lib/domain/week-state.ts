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
