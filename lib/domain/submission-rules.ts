import type { WeekState } from './week-state'

/** Proof is only accepted while the submission window is open. */
export function canSubmit(state: WeekState): boolean {
  return state === 'SUBMITTING'
}

/** Submissions stay hidden from other players until the submission window
 *  closes. This is what makes reveal a synchronised event and stops players
 *  copying or one-upping each other mid-week.
 *
 *  You can always see your own proof once the week has dropped, so you can
 *  check what you posted. */
export function canViewSubmission(
  state: WeekState,
  submissionUserId: string,
  viewerId: string,
): boolean {
  if (state === 'PENDING') return false
  if (submissionUserId === viewerId) return true
  return state === 'VOTING' || state === 'CLOSED'
}
