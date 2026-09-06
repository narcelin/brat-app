import { sql } from './client'
import type { Tier } from '../domain/tiers'
import { weekState, type WeekState, type WeekWindows } from '../domain/week-state'
import { fallbackAvatarId, isAvatarId, type AvatarId } from '../domain/avatars'

export interface WeekRow {
  week_id: number
  week_number: number
  drops_at: Date
  submissions_close_at: Date
  voting_closes_at: Date
  /** Null when the week has no objectives yet — the LEFT JOIN still returns
   *  one row for the week itself. */
  objective_id: number | null
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

  // A week with no objectives yields one row whose objective columns are all
  // null (from the LEFT JOIN). That is a real, renderable state — an empty
  // week — not an objective, so it is filtered out rather than shaped.
  const objectives: ObjectiveWithMine[] = rows
    .filter((row): row is WeekRow & { objective_id: number } => row.objective_id !== null)
    .map((row) => ({
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

/** Fetches the raw rows for the active week. The submissions join is
 *  restricted to the viewer's own row, so another player's proof never
 *  leaves the database before reveal — the hiding rule is enforced here,
 *  at the SQL layer, not merely by how the caller shapes the result. */
export async function fetchWeekRows(viewerId: string, now: Date): Promise<WeekRow[]> {
  // The week is chosen first, on its own, by drop time. Selecting it as a
  // side effect of joining objectives would make a week with no objectives
  // invisible and silently fall back to an older, possibly closed week.
  const weeks = (await sql`
    SELECT w.id
    FROM weeks w
    JOIN seasons se ON se.id = w.season_id AND se.is_active
    WHERE w.drops_at <= ${now}
    ORDER BY w.drops_at DESC, w.number DESC
    LIMIT 1
  `) as { id: number }[]

  if (weeks.length === 0) return []

  // LEFT JOIN so the week still comes back when it has no objectives yet.
  // The submissions join is restricted to the viewer's own row, so another
  // player's proof never leaves the database before reveal.
  const rows = (await sql`
    SELECT
      w.id     AS week_id,
      w.number AS week_number,
      w.drops_at,
      w.submissions_close_at,
      w.voting_closes_at,
      o.id     AS objective_id,
      o.title,
      o.description,
      o.tier,
      s.id      AS submission_id,
      s.user_id AS submission_user_id
    FROM weeks w
    LEFT JOIN objectives o ON o.week_id = w.id
    LEFT JOIN submissions s
      ON s.objective_id = o.id AND s.user_id = ${viewerId}
    WHERE w.id = ${weeks[0].id}
    ORDER BY o.id ASC
  `) as WeekRow[]

  return rows
}

/** Loads the active week, shaped for the viewer. */
export async function getCurrentWeek(
  viewerId: string,
  now: Date = new Date(),
): Promise<CurrentWeek | null> {
  const rows = await fetchWeekRows(viewerId, now)
  return shapeCurrentWeek(rows, viewerId, now)
}

export interface RosterEntry {
  userId: string
  displayName: string
  avatarUrl: string | null
  avatarId: AvatarId
  hasSubmitted: boolean
}

export interface RosterRow {
  user_id: string
  display_name: string
  avatar_url: string | null
  avatar_id: number | null
  has_submitted: boolean
}

/** Orders the roster so everyone who has posted floats to the top, then by
 *  name so the list is stable between renders. */
export function shapeRoster(rows: RosterRow[]): RosterEntry[] {
  return rows
    .map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      // Everyone shows a face, chosen or not, so no row renders blank.
      avatarId: isAvatarId(r.avatar_id) ? r.avatar_id : fallbackAvatarId(r.user_id),
      hasSubmitted: r.has_submitted,
    }))
    .sort((a, b) => {
      if (a.hasSubmitted !== b.hasSubmitted) return a.hasSubmitted ? -1 : 1
      return a.displayName.localeCompare(b.displayName)
    })
}

/** Who has posted proof for an objective — deliberately NOT what they posted.
 *
 *  Showing *who* does not let anyone copy or one-up, which is what the
 *  hidden-until-reveal rule exists to prevent; it only adds social pressure to
 *  take part. Showing *what* would break the game, so this query selects no
 *  media column at all: `media_url` and `media_pathname` are never read here,
 *  and there is nowhere in `RosterEntry` to put them if they were. */
export async function getObjectiveRoster(objectiveId: number): Promise<RosterEntry[]> {
  const rows = (await sql`
    SELECT
      u.id           AS user_id,
      u.display_name,
      u.avatar_url,
      u.avatar_id,
      EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.user_id = u.id AND s.objective_id = ${objectiveId}
      ) AS has_submitted
    FROM users u
    ORDER BY u.display_name ASC
  `) as RosterRow[]

  return shapeRoster(rows)
}
