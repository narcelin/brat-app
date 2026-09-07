import { describe, it, expect } from 'vitest'
import {
  EYE_STYLES, EYEWEAR, HAIR_STYLES, MAX_SEED, MOUTHS, SHIRTS, SKINS,
  featuresFromSeed, isSeed, parseSeed, randomSeed, seedFromPlayerId,
} from '../../lib/domain/avatar'

describe('isSeed', () => {
  it('accepts integers across the whole range', () => {
    expect(isSeed(0)).toBe(true)
    expect(isSeed(MAX_SEED)).toBe(true)
  })

  it('rejects anything out of range or not a whole number', () => {
    expect(isSeed(-1)).toBe(false)
    expect(isSeed(MAX_SEED + 1)).toBe(false)
    expect(isSeed(1.5)).toBe(false)
    expect(isSeed(NaN)).toBe(false)
  })

  it('rejects non-numbers, since this guards a JSON body', () => {
    expect(isSeed('7')).toBe(false)
    expect(isSeed(null)).toBe(false)
    expect(isSeed(undefined)).toBe(false)
    expect(isSeed({})).toBe(false)
  })
})

describe('featuresFromSeed', () => {
  it('is deterministic — the same seed always draws the same face', () => {
    expect(featuresFromSeed(12345)).toEqual(featuresFromSeed(12345))
  })

  it('only ever produces values from the defined lists', () => {
    for (let seed = 0; seed < 500; seed++) {
      const f = featuresFromSeed(seed)
      expect(SKINS).toContain(f.skin)
      expect(HAIR_STYLES).toContain(f.hairStyle)
      expect(EYE_STYLES).toContain(f.eyes)
      expect(EYEWEAR).toContain(f.eyewear)
      expect(MOUTHS).toContain(f.mouth)
      expect(SHIRTS).toContain(f.shirt)
    }
  })

  it('does not move features in lockstep as the seed increments', () => {
    // Consecutive seeds must not produce near-identical faces, or rerolling
    // feels broken.
    const a = featuresFromSeed(1000)
    const b = featuresFromSeed(1001)
    const differing = Object.keys(a).filter(
      (k) => a[k as keyof typeof a] !== b[k as keyof typeof b],
    )
    expect(differing.length).toBeGreaterThan(1)
  })

  it('reaches every hairstyle and every eye style across the seed space', () => {
    const hair = new Set<string>()
    const eyes = new Set<string>()
    for (let seed = 0; seed < 4000; seed++) {
      const f = featuresFromSeed(seed)
      hair.add(f.hairStyle)
      eyes.add(f.eyes)
    }
    expect(hair.size).toBe(HAIR_STYLES.length)
    expect(eyes.size).toBe(EYE_STYLES.length)
  })

  it('leaves most faces without eyewear', () => {
    let bare = 0
    for (let seed = 0; seed < 1000; seed++) {
      if (featuresFromSeed(seed).eyewear === 'none') bare++
    }
    expect(bare).toBeGreaterThan(300)
  })
})

describe('randomSeed', () => {
  it('always produces a valid seed', () => {
    for (let i = 0; i < 200; i++) expect(isSeed(randomSeed())).toBe(true)
  })

  it('does not keep returning the same number', () => {
    const seen = new Set(Array.from({ length: 50 }, randomSeed))
    expect(seen.size).toBeGreaterThan(40)
  })
})

describe('seedFromPlayerId', () => {
  it('is stable and valid for any id', () => {
    for (const id of ['', 'a', 'user_3IxdancXqgKNAmlyCbtcOqFWTV0']) {
      expect(isSeed(seedFromPlayerId(id))).toBe(true)
      expect(seedFromPlayerId(id)).toBe(seedFromPlayerId(id))
    }
  })

  it('spreads different players apart', () => {
    const seen = new Set(Array.from({ length: 100 }, (_, i) => seedFromPlayerId(`user_${i}`)))
    expect(seen.size).toBeGreaterThan(90)
  })
})

describe('parseSeed', () => {
  it('reads a seed that Postgres returned as a string', () => {
    expect(parseSeed('1178878437')).toBe(1178878437)
  })

  it('reads a numeric seed', () => {
    expect(parseSeed(42)).toBe(42)
  })

  it('returns null for a null column rather than 0', () => {
    // Number(null) is 0, and 0 is a valid seed — coercing first made every
    // player look like they had already chosen an avatar.
    expect(parseSeed(null)).toBeNull()
    expect(parseSeed(undefined)).toBeNull()
    expect(parseSeed('')).toBeNull()
  })

  it('keeps a genuine zero seed, which is distinct from absence', () => {
    expect(parseSeed(0)).toBe(0)
    expect(parseSeed('0')).toBe(0)
  })

  it('returns null for values outside the seed range', () => {
    expect(parseSeed(-1)).toBeNull()
    expect(parseSeed(MAX_SEED + 1)).toBeNull()
    expect(parseSeed('banana')).toBeNull()
    expect(parseSeed(1.5)).toBeNull()
  })
})
