import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../lib/auth/current-player'
import { sql } from '../../../lib/db/client'
import { getBallot, getCurrentWeek } from '../../../lib/db/queries'
import { isRatifyObjective, validateBallot } from '../../../lib/domain/ballot'

export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const objectiveId = (body as { objectiveId?: unknown } | null)?.objectiveId
  const ranking = (body as { ranking?: unknown } | null)?.ranking

  if (typeof objectiveId !== 'number' || !Number.isInteger(objectiveId)) {
    return NextResponse.json({ error: 'Invalid objective id' }, { status: 400 })
  }
  if (!Array.isArray(ranking) || ranking.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'Invalid ranking' }, { status: 400 })
  }

  const week = await getCurrentWeek(player.id)
  if (!week) {
    return NextResponse.json({ error: 'No active week' }, { status: 400 })
  }
  // Voting is only open in VOTING. Before that the field is hidden; after it
  // the week is settled and a late ballot would change a published result.
  if (week.state !== 'VOTING') {
    return NextResponse.json({ error: 'Voting is not open' }, { status: 403 })
  }
  if (!week.objectives.some((o) => o.id === objectiveId)) {
    return NextResponse.json({ error: 'Objective is not in the current week' }, { status: 400 })
  }

  const ballot = await getBallot(week.id, player.id)
  const objective = ballot.find((o) => o.objectiveId === objectiveId)
  if (!objective) {
    return NextResponse.json({ error: 'Nobody entered that objective' }, { status: 400 })
  }
  if (isRatifyObjective(objective.entrants.length)) {
    return NextResponse.json({ error: 'That objective is ratified, not ranked' }, { status: 400 })
  }

  // No-self-voting is enforced in three independent layers on purpose (this
  // API check, validateBallot below, and the DB's CHECK(voter_id <>
  // submission_user_id)) so a bug in any one of them is not enough to let a
  // self-vote through. Do not delete this as "redundant with validateBallot"
  // — collapsing it into one layer is exactly the failure mode it guards
  // against.
  if (ranking.includes(player.id)) {
    return NextResponse.json({ error: 'You cannot vote for yourself' }, { status: 400 })
  }

  // Re-checked here rather than trusted from the UI, which only renders the
  // choices it believes are legal.
  const entrantIds = objective.entrants.map((e) => e.userId)
  const check = validateBallot(ranking, entrantIds, player.id)
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 })
  }

  // Replace wholesale and atomically: a re-vote must not leave half the old
  // ballot behind if a query mid-sequence fails (network blip, or a
  // CHECK/UNIQUE violation if the checks above ever regressed). scoring's
  // bordaScores has no completeness check, so a partial ballot would be
  // silently mis-scored rather than caught.
  const deleteQuery = sql`DELETE FROM votes WHERE objective_id = ${objectiveId} AND voter_id = ${player.id}`
  const insertQueries = ranking.map(
    (userId, index) => sql`
      INSERT INTO votes (objective_id, voter_id, submission_user_id, place)
      VALUES (${objectiveId}, ${player.id}, ${userId}, ${index + 1})
    `,
  )
  await sql.transaction([deleteQuery, ...insertQueries])

  return NextResponse.json({ objectiveId, ranking })
}
