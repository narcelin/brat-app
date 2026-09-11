/** Invite codes.
 *
 *  Public sign-up is open — anyone can create a Clerk account — so holding a
 *  Clerk session proves nothing. A `users` row is what admits someone to the
 *  game, and redeeming a live code is the only way to get one. */

/** Crockford-style base32: no I, L, O or U, so a code cannot be misread down a
 *  phone line or turned into a word. 10 characters is ~50 bits, far past
 *  guessing. A 6-character code would be brute-forceable and must not be used. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 10

/** Uppercases and strips separators, so a code typed with the dashes it was
 *  displayed with — or in lower case, or with a stray space from a copy-paste
 *  — still matches. Nothing here makes a wrong code right: it only removes
 *  differences that were never meaningful. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    .toUpperCase()
    .replace(/[\s-]/g, '')
    // Crockford's canonical input mapping: the letters left out of the
    // alphabet because they are misreadable are folded onto the digits they
    // are misread as. Someone handed BRATWINTER on paper types the I they
    // see, and it resolves to the 1 that was stored. U has no digit it is
    // confused with and stays rejected.
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
  if (cleaned.length !== CODE_LENGTH) return null
  for (const character of cleaned) {
    if (!CODE_ALPHABET.includes(character)) return null
  }
  return cleaned
}

export interface InviteState {
  revokedAt: Date | null
  expiresAt: Date
  maxUses: number
  uses: number
}

export type InviteCheck =
  | { ok: true }
  | { ok: false; reason: string }

/** Whether a code will still admit someone.
 *
 *  Every rejection returns the same wording. A code that is expired, revoked,
 *  used up or simply wrong must be indistinguishable from outside: telling a
 *  stranger "that code is used up" confirms they guessed a real one. */
export const REFUSED = 'That invite is not valid. Ask whoever invited you for a current one.'

export function checkInvite(invite: InviteState | null, now: Date): InviteCheck {
  if (!invite) return { ok: false, reason: REFUSED }
  if (invite.revokedAt !== null) return { ok: false, reason: REFUSED }
  if (invite.expiresAt <= now) return { ok: false, reason: REFUSED }
  if (invite.uses >= invite.maxUses) return { ok: false, reason: REFUSED }
  return { ok: true }
}
