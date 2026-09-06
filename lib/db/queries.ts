import { sql } from './client'
import type { Tier } from '../domain/tiers'
import { weekState, type WeekState, type WeekWindows } from '../domain/week-state'

export interface WeekRow {
  week_id: number
  week_number: number
  drops_at: Date
  submissions_close_at: Date
  voting_closes_at: Date
  objective_id: number
  title: string
  description: string
  tier: Tier
  submission_id: number | null
  submission_user_id: string | null
}

export interface ObjectiveWithMine {
  id: number
  title: string
  description: string
  tier: Tier
  /** The viewer's own submission, if any. Other players' submissions are
   *  never included here — they are not visible until reveal. */
  mySubmissionId: number | null
}

export interface CurrentWeek {
  id: number
  number: number
  windows: WeekWindows
  state: WeekState
  objectives: ObjectiveWithMine[]
}

export function shapeCurrentWeek(
  rows: WeekRow[],
  viewerId: string,
  now: Date,
): CurrentWeek | null {
  if (rows.length === 0) return null

  const first = rows[0]
  const windows: WeekWindows = {
    dropsAt: first.drops_at,
    submissionsCloseAt: first.submissions_close_at,
    votingClosesAt: first.voting_closes_at,
  }

  const objectives: ObjectiveWithMine[] = rows.map((row) => ({
    id: row.objective_id,
    title: row.title,
    description: row.description,
    tier: row.tier,
    mySubmissionId: row.submission_user_id === viewerId ? row.submission_id : null,
  }))

  return {
    id: first.week_id,
    number: first.week_number,
    windows,
    state: weekState(windows, now),
    objectives,
  }
}

/** Loads the active week. The join is restricted to the viewer's own
 *  submission, so other players' proof never leaves the database before
 *  reveal — the hiding rule is enforced here, not in the UI. */
export async function getCurrentWeek(
  viewerId: string,
  now: Date = new Date(),
): Promise<CurrentWeek | null> {
  const rows = (await sql`
    SELECT
      w.id   AS week_id,
      w.number AS week_number,
      w.drops_at,
      w.submissions_close_at,
      w.voting_closes_at,
      o.id   AS objective_id,
      o.title,
      o.description,
      o.tier,
      s.id      AS submission_id,
      s.user_id AS submission_user_id
    FROM weeks w
    JOIN seasons se ON se.id = w.season_id AND se.is_active
    JOIN objectives o ON o.week_id = w.id
    LEFT JOIN submissions s
      ON s.objective_id = o.id AND s.user_id = ${viewerId}
    WHERE w.drops_at <= ${now}
    ORDER BY w.number DESC, o.id ASC
  `) as WeekRow[]

  if (rows.length === 0) return null

  const latestWeekId = rows[0].week_id
  return shapeCurrentWeek(
    rows.filter((r) => r.week_id === latestWeekId),
    viewerId,
    now,
  )
}
