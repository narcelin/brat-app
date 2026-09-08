import { sql } from './client'
import type { Tier } from '../domain/tiers'
import {
  effectiveWeekState, type ForcedState, type WeekState, type WeekWindows,
} from '../domain/week-state'
import { parseSeed, seedFromPlayerId } from '../domain/avatar'
import { isRatifyObjective } from '../domain/ballot'
import { shuffleEntrants } from '../domain/ballot-order'

export interface WeekRow {
  week_id: number
  week_number: number
  drops_at: Date
  submissions_close_at: Date
  voting_closes_at: Date
  forced_state: ForcedState | null
  /** Null when the week has no objectives yet — the LEFT JOIN still returns
   *  one row for the week itself. */
  objective_id: number | null
  title: string
  description: string
  tier: Tier
  submission_id: number | null
  submission_user_id: string | null
  media_pathname: string | null
  media_type: 'photo' | 'video' | null
  trim_start: number | null
  trim_end: number | null
}

/** Enough to play the proof back. Carried only for the viewer's own
 *  submission, so a player can check what they posted before deciding to
 *  replace it — without seeing anyone else's. */
export interface MySubmission {
  id: number
  mediaPathname: string
  mediaType: 'photo' | 'video'
  trimStart: number | null
  trimEnd: number | null
}

export interface ObjectiveWithMine {
  id: number
  title: string
  description: string
  tier: Tier
  /** The viewer's own submission, if any. Other players' submissions are
   *  never included here — they are not visible until reveal. */
  mySubmission: MySubmission | null
}

export interface CurrentWeek {
  id: number
  number: number
  windows: WeekWindows
  /** What the clock alone would say — shown on the admin screen so it is
   *  obvious when an override is masking the real schedule. */
  naturalState: WeekState
  forcedState: ForcedState | null
  state: WeekState
  objectives: ObjectiveWithMine[]
}

/** Attaches the viewer's own proof to an objective — and nobody else's.
 *
 *  The ownership check is repeated here even though `fetchWeekRows` already
 *  restricts the join to the viewer: this function also shapes rows from
 *  tests and any future caller, and a media pathname handed to the wrong
 *  player would defeat the hidden-until-reveal rule outright. A row missing
 *  its media columns (a legacy submission predating `media_pathname`) yields
 *  null rather than a player with an unplayable proof. */
export function shapeMine(row: WeekRow, viewerId: string): MySubmission | null {
  if (row.submission_id === null) return null
  if (row.submission_user_id !== viewerId) return null
  if (row.media_pathname === null || row.media_type === null) return null
  return {
    id: row.submission_id,
    mediaPathname: row.media_pathname,
    mediaType: row.media_type,
    trimStart: row.trim_start,
    trimEnd: row.trim_end,
  }
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
      mySubmission: shapeMine(row, viewerId),
    }))

  return {
    id: first.week_id,
    number: first.week_number,
    windows,
    naturalState: effectiveWeekState(windows, null, now),
    forcedState: first.forced_state,
    state: effectiveWeekState(windows, first.forced_state, now),
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
      w.forced_state,
      o.id     AS objective_id,
      o.title,
      o.description,
      o.tier,
      s.id      AS submission_id,
      s.user_id AS submission_user_id,
      s.media_pathname,
      s.media_type,
      s.trim_start,
      s.trim_end
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
  avatarSeed: number
  hasSubmitted: boolean
}

export interface RosterRow {
  user_id: string
  display_name: string
  avatar_url: string | null
  avatar_seed: number | null
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
      // Everyone shows a face, rolled or not, so no row renders blank.
      avatarSeed: parseSeed(r.avatar_seed) ?? seedFromPlayerId(r.user_id),
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
      u.avatar_seed,
      EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.user_id = u.id AND s.objective_id = ${objectiveId}
      ) AS has_submitted
    FROM users u
    ORDER BY u.display_name ASC
  `) as RosterRow[]

  return shapeRoster(rows)
}

export interface BallotRow {
  objective_id: number
  title: string
  tier: Tier
  entrant_id: string
  display_name: string
  avatar_seed: number | null
  submission_id: number
  media_pathname: string
  media_type: 'photo' | 'video'
  trim_start: number | null
  trim_end: number | null
  my_place: number | null
  my_ranked_user_id: string | null
  my_approved: boolean | null
}

export interface BallotEntrant {
  userId: string
  displayName: string
  avatarSeed: number
  submissionId: number
  mediaPathname: string
  mediaType: 'photo' | 'video'
  trimStart: number | null
  trimEnd: number | null
}

export interface BallotObjective {
  objectiveId: number
  title: string
  tier: Tier
  entrants: BallotEntrant[]
  isRatify: boolean
  /** The viewer's own ranking, best first. Empty when they have not voted. */
  myRanking: string[]
  myRatification: boolean | null
}

export function shapeBallot(rows: BallotRow[], viewerId: string): BallotObjective[] {
  const byObjective = new Map<number, BallotObjective>()
  // Collected separately because a row carries at most one place, and the
  // ranking has to come back in place order rather than row order.
  const rankings = new Map<number, { place: number; userId: string }[]>()

  for (const row of rows) {
    let objective = byObjective.get(row.objective_id)
    if (!objective) {
      objective = {
        objectiveId: row.objective_id,
        title: row.title,
        tier: row.tier,
        entrants: [],
        isRatify: false,
        myRanking: [],
        myRatification: row.my_approved,
      }
      byObjective.set(row.objective_id, objective)
      rankings.set(row.objective_id, [])
    }

    if (!objective.entrants.some((e) => e.userId === row.entrant_id)) {
      objective.entrants.push({
        userId: row.entrant_id,
        displayName: row.display_name,
        avatarSeed: parseSeed(row.avatar_seed) ?? seedFromPlayerId(row.entrant_id),
        submissionId: row.submission_id,
        mediaPathname: row.media_pathname,
        mediaType: row.media_type,
        trimStart: row.trim_start,
        trimEnd: row.trim_end,
      })
    }

    if (row.my_place !== null && row.my_ranked_user_id !== null) {
      const list = rankings.get(row.objective_id)!
      if (!list.some((r) => r.userId === row.my_ranked_user_id)) {
        list.push({ place: row.my_place, userId: row.my_ranked_user_id })
      }
    }

    if (row.my_approved !== null) objective.myRatification = row.my_approved
  }

  for (const objective of byObjective.values()) {
    objective.isRatify = isRatifyObjective(objective.entrants.length)
    objective.myRanking = (rankings.get(objective.objectiveId) ?? [])
      .sort((a, b) => a.place - b.place)
      .map((r) => r.userId)
    // Shuffled here rather than in SQL so the order is stable for a voter
    // across reloads, and testable without a database. The rows arrive in
    // submission-id order, which would otherwise put whoever posted first on
    // top of every objective for everyone.
    objective.entrants = shuffleEntrants(objective.entrants, viewerId, objective.objectiveId)
  }

  return [...byObjective.values()]
}

/** Every entrant's proof for a week, plus whatever the viewer has already
 *  voted. Callers MUST have checked the week is in VOTING or CLOSED first —
 *  this returns other players' media pathnames by design. */
export async function getBallot(
  weekId: number,
  viewerId: string,
): Promise<BallotObjective[]> {
  const rows = (await sql`
    SELECT
      o.id AS objective_id, o.title, o.tier,
      s.user_id AS entrant_id, u.display_name, u.avatar_seed,
      s.id AS submission_id, s.media_pathname, s.media_type,
      s.trim_start, s.trim_end,
      v.place AS my_place, v.submission_user_id AS my_ranked_user_id,
      r.approved AS my_approved
    FROM objectives o
    JOIN submissions s ON s.objective_id = o.id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN votes v
      ON v.objective_id = o.id AND v.voter_id = ${viewerId}
      AND v.submission_user_id = s.user_id
    LEFT JOIN ratifications r
      ON r.objective_id = o.id AND r.voter_id = ${viewerId}
    WHERE o.week_id = ${weekId}
    ORDER BY o.id, s.id
  `) as BallotRow[]

  return shapeBallot(rows, viewerId)
}
