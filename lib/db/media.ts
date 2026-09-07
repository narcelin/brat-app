import { sql } from './client'
import {
  effectiveWeekState, type ForcedState, type WeekState,
} from '../domain/week-state'

export interface MediaOwnerRow {
  user_id: string
  media_pathname: string
  drops_at: Date
  submissions_close_at: Date
  voting_closes_at: Date
  forced_state: ForcedState | null
}

export interface MediaOwner {
  userId: string
  weekState: WeekState
  mediaPathname: string
}

export function shapeMediaOwner(rows: MediaOwnerRow[], now: Date): MediaOwner | null {
  const row = rows[0]
  if (!row) return null

  return {
    userId: row.user_id,
    weekState: effectiveWeekState(
      {
        dropsAt: row.drops_at,
        submissionsCloseAt: row.submissions_close_at,
        votingClosesAt: row.voting_closes_at,
      },
      row.forced_state,
      now,
    ),
    mediaPathname: row.media_pathname,
  }
}

/** Who owns this file and which week governs it. The path is matched exactly
 *  rather than trusted: it arrives from the URL. */
export async function findMediaOwner(
  pathname: string,
  now: Date = new Date(),
): Promise<MediaOwner | null> {
  const rows = (await sql`
    SELECT s.user_id, s.media_pathname,
           w.drops_at, w.submissions_close_at, w.voting_closes_at, w.forced_state
    FROM submissions s
    JOIN objectives o ON o.id = s.objective_id
    JOIN weeks w ON w.id = o.week_id
    WHERE s.media_pathname = ${pathname}
    LIMIT 1
  `) as MediaOwnerRow[]

  return shapeMediaOwner(rows, now)
}
