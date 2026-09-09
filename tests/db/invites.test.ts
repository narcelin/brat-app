import { describe, it, expect } from 'vitest'
import { generateCode } from '../../lib/db/invites'
import { CODE_ALPHABET, CODE_LENGTH, normalizeCode } from '../../lib/domain/invite'

describe('generateCode', () => {
  it('produces a code the parser accepts', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode()
      expect(code).toHaveLength(CODE_LENGTH)
      expect(normalizeCode(code)).toBe(code)
    }
  })

  it('only ever uses the safe alphabet', () => {
    // Every byte value must map into the alphabet — a code containing a
    // character normalizeCode rejects would be un-redeemable by the person
    // it was issued to.
    const seen = new Set<string>()
    for (let b = 0; b < 256; b++) {
      const code = generateCode(() => new Uint8Array(Array(CODE_LENGTH).fill(b)))
      for (const c of code) seen.add(c)
      expect(normalizeCode(code)).toBe(code)
    }
    for (const c of seen) expect(CODE_ALPHABET).toContain(c)
  })

  // The alphabet is 32 characters and bytes are masked to 5 bits, so every
  // character is equally likely. A biased mapping would shrink the keyspace.
  it('maps bytes without modulo bias', () => {
    const counts = new Map<string, number>()
    for (let b = 0; b < 256; b++) {
      const c = generateCode(() => new Uint8Array([b, ...Array(CODE_LENGTH - 1).fill(0)]))[0]
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    expect(counts.size).toBe(CODE_ALPHABET.length)
    expect(new Set(counts.values())).toEqual(new Set([256 / CODE_ALPHABET.length]))
  })

  it('does not repeat', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateCode()))
    expect(codes.size).toBe(500)
  })
})
