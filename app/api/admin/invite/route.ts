import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../../lib/auth/current-player'
import { isAdmin } from '../../../../lib/auth/is-admin'
import { createInvite, revokeInvite } from '../../../../lib/db/invites'
import { normalizeCode } from '../../../../lib/domain/invite'

const MAX_USES_LIMIT = 100
const MAX_DAYS = 90

export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not an admin' }, { status: 403 })

  const body = (await request.json().catch(() => null)) as
    | { action?: unknown; maxUses?: unknown; days?: unknown; code?: unknown }
    | null

  if (body?.action === 'revoke') {
    const code = normalizeCode(body.code)
    if (!code) return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
    await revokeInvite(code)
    return NextResponse.json({ ok: true })
  }

  const maxUses = Number(body?.maxUses)
  const days = Number(body?.days)

  // Bounded rather than trusted. An invite for 10,000 people or one that lives
  // for a decade is not a thing this game has any use for, and both are far
  // more likely to be a typo than an intention.
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > MAX_USES_LIMIT) {
    return NextResponse.json({ error: `Uses must be between 1 and ${MAX_USES_LIMIT}.` }, { status: 400 })
  }
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return NextResponse.json({ error: `Expiry must be between 1 and ${MAX_DAYS} days.` }, { status: 400 })
  }

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  const code = await createInvite(player.id, maxUses, expiresAt)

  return NextResponse.json({ ok: true, code })
}
