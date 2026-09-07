import { currentUser } from '@clerk/nextjs/server'
import { sql } from '../db/client'
import { parseSeed } from '../domain/avatar'

export interface Player {
  id: string
  displayName: string
  avatarUrl: string | null
  /** Null until the player rolls one; callers fall back to seedFromPlayerId. */
  avatarSeed: number | null
}

interface ClerkUserFields {
  id: string
  fullName: string | null
  username: string | null
  imageUrl: string | null
}

/** Every player needs a non-empty display name — an unlabelled entry on a
 *  ballot is unvotable. */
export function playerFromClerk(user: ClerkUserFields): Player {
  return {
    id: user.id,
    displayName: user.fullName || user.username || 'Brat',
    avatarUrl: user.imageUrl ?? null,
    // Clerk knows nothing about avatars; the seed lives in our own table.
    avatarSeed: null,
  }
}

/** Returns the signed-in player, creating their row on first sight.
 *  Identity must be stable and real: Phase 2 enforces "no self-voting"
 *  by comparing these ids. */
export async function currentPlayer(): Promise<Player | null> {
  const user = await currentUser()
  if (!user) return null

  const player = playerFromClerk(user)

  // Read before write. This runs on every authenticated page render, so the
  // common path must be a SELECT — an unconditional upsert would turn every
  // page view into a database write and contend on the same row.
  const existing = (await sql`
    SELECT display_name, avatar_url, avatar_seed FROM users WHERE id = ${player.id}
  `) as { display_name: string; avatar_url: string | null; avatar_seed: number | null }[]

  const current = existing[0]
  const changed =
    !current ||
    current.display_name !== player.displayName ||
    current.avatar_url !== player.avatarUrl

  if (changed) {
    await sql`
      INSERT INTO users (id, display_name, avatar_url)
      VALUES (${player.id}, ${player.displayName}, ${player.avatarUrl})
      ON CONFLICT (id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            avatar_url   = EXCLUDED.avatar_url
    `
  }

  return {
    ...player,
    avatarSeed: parseSeed(current?.avatar_seed),
  }
}
