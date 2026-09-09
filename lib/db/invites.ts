import { sql } from './client'
import { CODE_ALPHABET, CODE_LENGTH } from '../domain/invite'

export interface InviteRow {
  code: string
  createdAt: Date
  expiresAt: Date
  maxUses: number
  uses: number
  revokedAt: Date | null
}

/** Uses the platform CSPRNG. Math.random is predictable enough that an
 *  observer who sees one code could narrow the next; these are the only thing
 *  standing between a stranger and the game. */
export function generateCode(random: (n: number) => Uint8Array = cryptoBytes): string {
  const bytes = random(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    // 256 is not a multiple of 32, but 32 divides 256 exactly (8 x 32), so
    // taking the low 5 bits is uniform with no modulo bias.
    code += CODE_ALPHABET[bytes[i] & 31]
  }
  return code
}

function cryptoBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

export async function createInvite(
  createdBy: string,
  maxUses: number,
  expiresAt: Date,
): Promise<string> {
  const code = generateCode()
  await sql`
    INSERT INTO invites (code, created_by, max_uses, expires_at)
    VALUES (${code}, ${createdBy}, ${maxUses}, ${expiresAt})
  `
  return code
}

export async function listInvites(): Promise<InviteRow[]> {
  const rows = (await sql`
    SELECT i.code, i.created_at, i.expires_at, i.max_uses, i.revoked_at,
           (SELECT count(*)::int FROM invite_redemptions r WHERE r.code = i.code) AS uses
    FROM invites i
    ORDER BY i.created_at DESC
  `) as {
    code: string; created_at: Date; expires_at: Date
    max_uses: number; revoked_at: Date | null; uses: number
  }[]

  return rows.map((r) => ({
    code: r.code,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    maxUses: r.max_uses,
    uses: r.uses,
    revokedAt: r.revoked_at,
  }))
}

export async function revokeInvite(code: string): Promise<void> {
  await sql`UPDATE invites SET revoked_at = now() WHERE code = ${code} AND revoked_at IS NULL`
}

/** Admits a signed-in Clerk user, if the code will still admit anyone.
 *
 *  One statement, deliberately. A `users` row IS admission, so it cannot be
 *  written before the code is checked, and the redemption cannot be written
 *  before the user row exists to satisfy its foreign key. Splitting those
 *  across statements leaves a window where a refused code has already created
 *  an admitted player.
 *
 *  `FOR UPDATE` on the invite row is what makes the use limit hold. Without
 *  it, two people redeeming the last remaining use both read `uses < max_uses`
 *  before either inserts, and both get in — the classic oversell. The lock
 *  serialises them, so the second sees the first's row.
 *
 *  Returns false for every failure — wrong, expired, revoked, exhausted —
 *  without distinguishing them. The caller shows one message for all of them.
 */
export async function redeemInvite(
  code: string,
  userId: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<boolean> {
  const rows = (await sql`
    WITH live AS (
      SELECT code, max_uses
      FROM invites
      WHERE code = ${code}
        AND revoked_at IS NULL
        AND expires_at > now()
      FOR UPDATE
    ),
    admissible AS (
      SELECT l.code
      FROM live l
      WHERE (SELECT count(*) FROM invite_redemptions r WHERE r.code = l.code) < l.max_uses
    ),
    admitted AS (
      INSERT INTO users (id, display_name, avatar_url)
      SELECT ${userId}, ${displayName}, ${avatarUrl} FROM admissible
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    INSERT INTO invite_redemptions (code, user_id)
    SELECT a.code, ${userId} FROM admissible a
    ON CONFLICT DO NOTHING
    RETURNING code
  `) as { code: string }[]

  return rows.length > 0
}
