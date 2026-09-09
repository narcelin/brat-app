/** Guard for the season reset.
 *
 *  Reset deletes every submission, vote and ratification in the active season
 *  and moves the schedule back to week 1. There is no undo — the media is
 *  deleted from the store too — so the request has to carry a phrase the
 *  caller can only have typed on purpose. A stray POST, a double-tapped
 *  button, or a replayed request without it does nothing. */
export const RESET_PHRASE = 'RESET'

export function isResetConfirmed(value: unknown): boolean {
  // Exact match, deliberately: no trimming, no case folding. Anything that
  // "nearly" says RESET is likelier to be an accident than an intention.
  return value === RESET_PHRASE
}
