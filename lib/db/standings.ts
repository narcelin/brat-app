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
}

/** Recomputed from votes every time rather than stored, so a miscast vote is
 *  fixable without corrupting history. */
export function buildStandings(
  objectives: ScoredObjectiveInput[],
  players: PlayerRow[],
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

  return [...standings.values()].sort(
    (a, b) => b.points - a.points || b.golds - a.golds || a.displayName.localeCompare(b.displayName),
  )
}

/** Only weeks that have actually finished voting count toward the table — a
 *  week still being voted on would make the standings jump around mid-ballot. */
export async function getStandings(seasonId: number, now: Date = new Date()): Promise<Standing[]> {
  const players = (await sql`
    SELECT id, display_name, avatar_seed FROM users
  `) as PlayerRow[]

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
    WHERE w.forced_state = 'CLOSED' OR w.voting_closes_at <= ${now}
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

  return buildStandings([...byObjective.values()], players)
}
