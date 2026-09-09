import { NextResponse } from 'next/server'
import { currentAccess } from '../../../lib/auth/current-player'
import { redeemInvite } from '../../../lib/db/invites'
import { REFUSED, normalizeCode } from '../../../lib/domain/invite'

/** Redeems an invite for the signed-in Clerk user. */
export async function POST(request: Request) {
  const access = await currentAccess()

  if (access.state === 'signed-out') {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }
  // Already admitted. Not an error — a double-submit, or a stale tab — and
  // redeeming again must not consume a second use.
  if (access.state === 'player') {
    return NextResponse.json({ ok: true, alreadyIn: true })
  }

  const body = await request.json().catch(() => null)
  const code = normalizeCode((body as { code?: unknown } | null)?.code)

  // A malformed code is refused with the same wording as a wrong one: the
  // shape of a valid code is not a secret, but confirming which guesses got
  // closer is.
  if (!code) {
    return NextResponse.json({ error: REFUSED }, { status: 400 })
  }

  const admitted = await redeemInvite(
    code,
    access.identity.id,
    access.identity.displayName,
    access.identity.avatarUrl,
  )

  if (!admitted) {
    return NextResponse.json({ error: REFUSED }, { status: 403 })
  }

  return NextResponse.json({ ok: true })
}
