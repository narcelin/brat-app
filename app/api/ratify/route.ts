import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../lib/auth/current-player'
import { sql } from '../../../lib/db/client'
import { getBallot, getCurrentWeek } from '../../../lib/db/queries'
import { isRatifyObjective } from '../../../lib/domain/ballot'

export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const objectiveId = (body as { objectiveId?: unknown } | null)?.objectiveId
  const approved = (body as { approved?: unknown } | null)?.approved

  if (typeof objectiveId !== 'number' || !Number.isInteger(objectiveId)) {
    return NextResponse.json({ error: 'Invalid objective id' }, { status: 400 })
  }
  if (typeof approved !== 'boolean') {
    return NextResponse.json({ error: 'Invalid answer' }, { status: 400 })
  }

  const week = await getCurrentWeek(player.id)
  if (!week || week.state !== 'VOTING') {
    return NextResponse.json({ error: 'Voting is not open' }, { status: 403 })
  }
  if (!week.objectives.some((o) => o.id === objectiveId)) {
    return NextResponse.json({ error: 'Objective is not in the current week' }, { status: 400 })
  }

  const ballot = await getBallot(week.id, player.id)
  const objective = ballot.find((o) => o.objectiveId === objectiveId)
  if (!objective || !isRatifyObjective(objective.entrants.length)) {
    return NextResponse.json({ error: 'That objective is ranked, not ratified' }, { status: 400 })
  }
  // The lone entrant cannot vouch for themselves; that is the whole point of
  // the ratify vote.
  if (objective.entrants[0].userId === player.id) {
    return NextResponse.json({ error: 'You cannot ratify your own entry' }, { status: 400 })
  }

  await sql`
    INSERT INTO ratifications (objective_id, voter_id, approved)
    VALUES (${objectiveId}, ${player.id}, ${approved})
    ON CONFLICT (objective_id, voter_id) DO UPDATE SET approved = EXCLUDED.approved
  `

  return NextResponse.json({ objectiveId, approved })
}
