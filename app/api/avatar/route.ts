import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../lib/auth/current-player'
import { sql } from '../../../lib/db/client'
import { isSeed } from '../../../lib/domain/avatar'

export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const seed = (body as { seed?: unknown } | null)?.seed

  // Re-checked server-side: the roll happens in the browser, so the number
  // arriving here is whatever the client chose to send.
  if (!isSeed(seed)) {
    return NextResponse.json({ error: 'Not a valid avatar' }, { status: 400 })
  }

  // Scoped to the caller's own row — a player can only change their own face.
  await sql`UPDATE users SET avatar_seed = ${seed} WHERE id = ${player.id}`

  return NextResponse.json({ seed })
}
