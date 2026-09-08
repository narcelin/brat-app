import { sql } from './client'
import { parseSeed, seedFromPlayerId } from '../domain/avatar'
import { scoreObjective, scoreRatify, type CastBallot } from '../domain/scoring'
import type { Tier } from '../domain/tiers'

export interface ScoredObjectiveInput {
  tier: Tier
  entrantIds: string[]
  ballots: CastBallot[]
  ratifications: boolean[]
}

export interface PlayerRow {
  id: string
  display_name: string
  avatar_seed: number | null
}

export interface Standing {
  userId: string
  displayName: string
  avatarSeed: number
  points: number
  golds: number
  silvers: number
  bronzes: number
  /** How many objectives this player has posted proof for, across every week
   *  that has dropped — not only the scored ones the medals come from.
   *
   *  Deliberately decorative: it never touches points, medals or the sort.
   *  It is drawn from a wider set of weeks than the scoring is, so letting it
   *  reach the ranking would leak an unscored week into the table. */
  entries: number
}

/** Recomputed from votes every time rather than stored, so a miscast vote is
 *  fixable without corrupting history. */
export function buildStandings(
  objectives: ScoredObjectiveInput[],
  players: PlayerRow[],
  /** Objectives posted for, keyed by user id. Required rather than defaulted:
   *  an omitted map would silently report every player as having posted
   *  nothing, which reads as a real result rather than a missing argument. */
  entriesByUser: Map<string, number>,
): Standing[] {
  const standings = new Map<string, Standing>(
    players.map((p) => [
      p.id,
      {
        userId: p.id,
        displayName: p.display_name,
        avatarSeed: parseSeed(p.avatar_seed) ?? seedFromPlayerId(p.id),
        points: 0,
        golds: 0,
        silvers: 0,
        bronzes: 0,
        entries: entriesByUser.get(p.id) ?? 0,
      },
    ]),
  )

  for (const objective of objectives) {
    const awards =
      objective.entrantIds.length === 1
        ? scoreRatify(objective.ratifications, objective.entrantIds[0], objective.tier)
        : scoreObjective(objective.ballots, objective.entrantIds, objective.tier)

    for (const award of awards) {
      const standing = standings.get(award.userId)
      if (!standing) continue
      standing.points += award.points
      if (award.place === 1) standing.golds += 1
      if (award.place === 2) standing.silvers += 1
      if (award.place === 3) standing.bronzes += 1
    }
  }

  // displayName has no uniqueness constraint, so two players tied on points,
  // golds, and display name would otherwise sort in whatever order the Map
  // happened to iterate — unstable across renders. userId is always unique,
  // so it's the final tiebreak that guarantees a deterministic order.
  return [...standings.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.golds - a.golds ||
      a.displayName.localeCompare(b.displayName) ||
      a.userId.localeCompare(b.userId),
  )
}

/** Only weeks that have actually finished voting count toward the table — a
 *  week still being voted on would make the standings jump around mid-ballot.
 *
 *  A forced state always beats the clock, in either direction — see
 *  `effectiveWeekState` in `lib/domain/week-state.ts`, the app's single
 *  authority on week state. If an admin forces a week to VOTING to keep
 *  polls open past its scheduled `voting_closes_at`, the clock alone must
 *  not count that week toward the table just because it's past its
 *  timestamp: that would publish a result for a week people are still
 *  voting on. So the clock branch only applies when `forced_state IS NULL`;
 *  do not simplify this back to a plain `OR` on `voting_closes_at`. */
export async function getStandings(seasonId: number, now: Date = new Date()): Promise<Standing[]> {
  const players = (await sql`
    SELECT id, display_name, avatar_seed FROM users
  `) as PlayerRow[]

  // Counted in its own query rather than from the scoring rows below, which
  // are filtered to weeks that have finished voting. Widening that filter to
  // pick participation up would feed unscored weeks into the medals.
  //
  // No date filter is needed: a submission can only exist for a week that was
  // open for submitting (the API checks canSubmit before writing), so the
  // rows themselves already carry the "week has dropped" condition. That also
  // keeps this clear of forced-state and clock precedence entirely.
  const entryRows = (await sql`
    SELECT s.user_id, count(DISTINCT s.objective_id)::int AS entries
    FROM submissions s
    JOIN objectives o ON o.id = s.objective_id
    JOIN weeks w ON w.id = o.week_id AND w.season_id = ${seasonId}
    GROUP BY s.user_id
  `) as { user_id: string; entries: number }[]

  const entriesByUser = new Map(entryRows.map((r) => [r.user_id, r.entries]))

  // votes and ratifications are both joined only on objective_id (neither
  // joins to the submissions row), so a multi-entrant objective's rows are
  // multiplied by (entrant count) x (vote rows) and a ratified objective's
  // rows by (entrant count) x (ratification rows). The dedup logic below
  // depends on each source table's own voter column, not on a shared one —
  // see the r.voter_id AS ratifier_id note below for why that matters.
  const rows = (await sql`
    SELECT o.id AS objective_id, o.tier,
           s.user_id AS entrant_id,
           v.voter_id, v.submission_user_id, v.place,
           r.voter_id AS ratifier_id, r.approved
    FROM objectives o
    JOIN weeks w ON w.id = o.week_id AND w.season_id = ${seasonId}
    JOIN submissions s ON s.objective_id = o.id
    LEFT JOIN votes v ON v.objective_id = o.id
    LEFT JOIN ratifications r ON r.objective_id = o.id
    WHERE w.forced_state = 'CLOSED'
       OR (w.forced_state IS NULL AND w.voting_closes_at <= ${now})
  `) as {
    objective_id: number
    tier: Tier
    entrant_id: string
    voter_id: string | null
    submission_user_id: string | null
    place: number | null
    ratifier_id: string | null
    approved: boolean | null
  }[]

  const byObjective = new Map<number, ScoredObjectiveInput>()
  const ballotsByObjective = new Map<number, Map<string, { place: number; userId: string }[]>>()
  const seenRatification = new Map<number, Set<string>>()

  for (const row of rows) {
    if (!byObjective.has(row.objective_id)) {
      byObjective.set(row.objective_id, {
        tier: row.tier,
        entrantIds: [],
        ballots: [],
        ratifications: [],
      })
      ballotsByObjective.set(row.objective_id, new Map())
      seenRatification.set(row.objective_id, new Set())
    }
    const objective = byObjective.get(row.objective_id)!

    if (!objective.entrantIds.includes(row.entrant_id)) {
      objective.entrantIds.push(row.entrant_id)
    }

    if (row.voter_id && row.submission_user_id && row.place !== null) {
      const voters = ballotsByObjective.get(row.objective_id)!
      const list = voters.get(row.voter_id) ?? []
      if (!list.some((entry) => entry.userId === row.submission_user_id)) {
        list.push({ place: row.place, userId: row.submission_user_id })
      }
      voters.set(row.voter_id, list)
    }

    // The join multiplies rows, so each voter's ratification is counted
    // once. This must key off r.voter_id (aliased ratifier_id), not
    // v.voter_id: votes and ratifications are independent LEFT JOINs on
    // objective_id alone, so on a ratify-only objective (no votes rows)
    // v.voter_id is null on every row. Keying the dedup/guard on v.voter_id
    // would make `row.voter_id` false for every ratification row and drop
    // every approval, so ratified single entries would silently always
    // score as unratified.
    if (row.approved !== null && row.ratifier_id) {
      const seen = seenRatification.get(row.objective_id)!
      if (!seen.has(row.ratifier_id)) {
        seen.add(row.ratifier_id)
        objective.ratifications.push(row.approved)
      }
    }
  }

  for (const [objectiveId, objective] of byObjective) {
    const voters = ballotsByObjective.get(objectiveId)!
    objective.ballots = [...voters.entries()].map(([voterId, entries]) => ({
      voterId,
      ranking: entries.sort((a, b) => a.place - b.place).map((e) => e.userId),
    }))
  }

  return buildStandings([...byObjective.values()], players, entriesByUser)
}
