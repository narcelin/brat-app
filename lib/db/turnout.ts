import { sql } from './client'

export interface TurnoutRow {
  objective_id: number
  title: string
  entrants: number
  voters: number
  eligible: number
}

export interface Turnout {
  objectiveId: number
  title: string
  entrants: number
  /** Distinct players who have cast any ballot on this objective. */
  voters: number
  eligible: number
}

export function shapeTurnout(rows: TurnoutRow[]): Turnout[] {
  return rows.map((row) => ({
    objectiveId: row.objective_id,
    title: row.title,
    entrants: Number(row.entrants),
    voters: Number(row.voters),
    eligible: Number(row.eligible),
  }))
}

/** Counted with subqueries rather than joins: joining votes and submissions
 *  together multiplies rows and would inflate both counts. */
export async function getTurnout(weekId: number): Promise<Turnout[]> {
  const rows = (await sql`
    SELECT
      o.id AS objective_id,
      o.title,
      (SELECT count(*) FROM submissions s WHERE s.objective_id = o.id) AS entrants,
      (SELECT count(DISTINCT voter_id) FROM (
         SELECT voter_id FROM votes WHERE objective_id = o.id
         UNION
         SELECT voter_id FROM ratifications WHERE objective_id = o.id
       ) AS cast_by) AS voters,
      (SELECT count(*) FROM users) AS eligible
    FROM objectives o
    WHERE o.week_id = ${weekId}
    ORDER BY o.id
  `) as TurnoutRow[]

  return shapeTurnout(rows)
}
