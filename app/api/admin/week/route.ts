import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../../lib/auth/current-player'
import { isAdmin } from '../../../../lib/auth/is-admin'
import { sql } from '../../../../lib/db/client'
import { getCurrentWeek } from '../../../../lib/db/queries'
import {
  canClearOverride, canForceState, isForcedState,
} from '../../../../lib/domain/week-state'

export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  // Forcing a week's state decides when everyone's proof is revealed, so this
  // is checked against Clerk on the server. A client claim means nothing.
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Not an admin' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const target = (body as { state?: unknown } | null)?.state
  const weekId = (body as { weekId?: unknown } | null)?.weekId

  if (typeof weekId !== 'number' || !Number.isInteger(weekId)) {
    return NextResponse.json({ error: 'Invalid week' }, { status: 400 })
  }

  const week = await getCurrentWeek(player.id)
  if (!week || week.id !== weekId) {
    return NextResponse.json({ error: 'That is not the current week' }, { status: 400 })
  }

  // Clearing hands the week back to its own timestamps.
  if (target === null) {
    const allowed = canClearOverride(week.state)
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.reason }, { status: 409 })
    }
    await sql`UPDATE weeks SET forced_state = NULL WHERE id = ${weekId}`
    return NextResponse.json({ forcedState: null })
  }

  if (!isForcedState(target)) {
    return NextResponse.json({ error: 'Not a state a week can be forced into' }, { status: 400 })
  }

  // One-way. Re-checked here rather than trusted from the UI, which only
  // renders the buttons it believes are legal.
  const allowed = canForceState(week.state, target)
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.reason }, { status: 409 })
  }

  await sql`UPDATE weeks SET forced_state = ${target} WHERE id = ${weekId}`
  return NextResponse.json({ forcedState: target })
}
