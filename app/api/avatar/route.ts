import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../lib/auth/current-player'
import { sql } from '../../../lib/db/client'
import { isAvatarId } from '../../../lib/domain/avatars'

export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const avatarId = (body as { avatarId?: unknown } | null)?.avatarId

  // Re-checked server-side: the client picks from a grid, but nothing stops it
  // posting any number it likes.
  if (!isAvatarId(avatarId)) {
    return NextResponse.json({ error: 'Not one of the avatars' }, { status: 400 })
  }

  // Scoped to the caller's own row — a player can only change their own face.
  await sql`UPDATE users SET avatar_id = ${avatarId} WHERE id = ${player.id}`

  return NextResponse.json({ avatarId })
}
