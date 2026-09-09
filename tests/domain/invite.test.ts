import { describe, it, expect } from 'vitest'
import {
  CODE_ALPHABET, CODE_LENGTH, checkInvite, normalizeCode, REFUSED,
} from '../../lib/domain/invite'

const now = new Date('2026-09-09T12:00:00Z')
const live = {
  revokedAt: null,
  expiresAt: new Date('2026-09-16T12:00:00Z'),
  maxUses: 16,
  uses: 3,
}

describe('normalizeCode', () => {
  it('accepts a plain code', () => {
    expect(normalizeCode('ABCDEFGHJK')).toBe('ABCDEFGHJK')
  })

  it('forgives case, dashes and stray whitespace from a copy-paste', () => {
    expect(normalizeCode('abcde-fghjk')).toBe('ABCDEFGHJK')
    expect(normalizeCode(' ABCDE FGHJK ')).toBe('ABCDEFGHJK')
  })

  it('refuses the wrong length', () => {
    expect(normalizeCode('ABCDEFGHJ')).toBeNull()
    expect(normalizeCode('ABCDEFGHJKL')).toBeNull()
    expect(normalizeCode('')).toBeNull()
  })

  // I, L, O and U are excluded so a code cannot be misread or spell a word.
  it('refuses characters outside the alphabet', () => {
    expect(normalizeCode('ABCDEFGHIJ')).toBeNull()
    expect(normalizeCode('ABCDEFGH!K')).toBeNull()
    for (const c of 'ILOU') expect(normalizeCode(`ABCDEFGH${c}K`)).toBeNull()
  })

  it('refuses a non-string', () => {
    for (const v of [null, undefined, 42, {}, ['ABCDEFGHJK']]) {
      expect(normalizeCode(v)).toBeNull()
    }
  })

  it('has an alphabet that excludes the ambiguous letters', () => {
    for (const c of 'ILOU') expect(CODE_ALPHABET).not.toContain(c)
    expect(CODE_LENGTH).toBeGreaterThanOrEqual(10)
  })
})

describe('checkInvite', () => {
  it('admits on a live code', () => {
    expect(checkInvite(live, now).ok).toBe(true)
  })

  it('refuses an unknown code', () => {
    expect(checkInvite(null, now)).toEqual({ ok: false, reason: REFUSED })
  })

  it('refuses a revoked code', () => {
    expect(checkInvite({ ...live, revokedAt: new Date('2026-09-08T00:00:00Z') }, now).ok).toBe(false)
  })

  it('refuses an expired code, and treats the exact expiry instant as expired', () => {
    expect(checkInvite({ ...live, expiresAt: new Date('2026-09-01T00:00:00Z') }, now).ok).toBe(false)
    expect(checkInvite({ ...live, expiresAt: now }, now).ok).toBe(false)
  })

  it('refuses once the use limit is reached, and at the boundary', () => {
    expect(checkInvite({ ...live, uses: 16, maxUses: 16 }, now).ok).toBe(false)
    expect(checkInvite({ ...live, uses: 17, maxUses: 16 }, now).ok).toBe(false)
    expect(checkInvite({ ...live, uses: 15, maxUses: 16 }, now).ok).toBe(true)
  })

  // A stranger probing codes must not be able to tell a real-but-spent code
  // from one that never existed — that confirms a successful guess.
  it('gives every refusal identical wording', () => {
    const reasons = [
      checkInvite(null, now),
      checkInvite({ ...live, revokedAt: now }, now),
      checkInvite({ ...live, expiresAt: new Date('2026-01-01') }, now),
      checkInvite({ ...live, uses: 99 }, now),
    ].map((r) => (r.ok ? 'ok' : r.reason))
    expect(new Set(reasons).size).toBe(1)
  })
})
