import { currentUser } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
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

/** Signed out, signed in without admission, or an admitted player.
 *
 *  The middle state exists because sign-up is public: holding a Clerk session
 *  proves only that someone made an account. A `users` row is admission, and
 *  redeeming an invite is the only way to get one. */
export type Access =
  | { state: 'signed-out' }
  /** Carries the Clerk identity so the invite gate can build their row on
   *  redemption without a second round trip to Clerk. */
  | { state: 'unadmitted'; identity: Player }
  | { state: 'player'; player: Player }

export async function currentAccess(): Promise<Access> {
  const user = await currentUser()
  if (!user) return { state: 'signed-out' }

  const player = playerFromClerk(user)

  // Read before write. This runs on every authenticated page render, so the
  // common path must be a SELECT — an unconditional upsert would turn every
  // page view into a database write and contend on the same row.
  const existing = (await sql`
    SELECT display_name, avatar_url, avatar_seed FROM users WHERE id = ${player.id}
  `) as { display_name: string; avatar_url: string | null; avatar_seed: number | null }[]

  const current = existing[0]

  // No row means no admission. This used to INSERT here, which made every
  // Clerk account a player the moment it loaded any page — harmless while
  // sign-up was restricted, and an open door the moment it was not. Rows are
  // now created only by redeeming an invite. Players who predate invites
  // already have rows and are unaffected.
  if (!current) {
    return { state: 'unadmitted', identity: player }
  }

  // Clerk stays the source of truth for name and picture, so a rename there
  // follows through. UPDATE, never INSERT: this path must not be able to
  // admit anyone.
  if (current.display_name !== player.displayName || current.avatar_url !== player.avatarUrl) {
    await sql`
      UPDATE users
      SET display_name = ${player.displayName}, avatar_url = ${player.avatarUrl}
      WHERE id = ${player.id}
    `
  }

  return {
    state: 'player',
    player: { ...player, avatarSeed: parseSeed(current.avatar_seed) },
  }
}

/** The admitted player, or null.
 *
 *  Null now covers both signed-out and signed-in-without-admission. API routes
 *  want exactly that — neither may call them — so they are unchanged. Pages
 *  that need to tell the two apart should use `requirePlayer`. */
export async function currentPlayer(): Promise<Player | null> {
  const access = await currentAccess()
  return access.state === 'player' ? access.player : null
}

/** For pages: the admitted player, or navigate away.
 *
 *  Signed in but not admitted goes to the invite gate rather than a 404 —
 *  a dead end on every route is indistinguishable from the app being broken.
 *  Signed out still gets a 404, so a stranger cannot map which routes exist. */
export async function requirePlayer(): Promise<Player> {
  const access = await currentAccess()
  if (access.state === 'player') return access.player
  if (access.state === 'unadmitted') redirect('/join')
  notFound()
}
