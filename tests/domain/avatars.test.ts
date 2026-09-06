import { describe, it, expect } from 'vitest'
import { AVATAR_IDS, avatarSrc, fallbackAvatarId, isAvatarId } from '../../lib/domain/avatars'

describe('isAvatarId', () => {
  it('accepts every id in the cast', () => {
    for (const id of AVATAR_IDS) expect(isAvatarId(id)).toBe(true)
  })

  it('rejects ids outside the cast', () => {
    expect(isAvatarId(0)).toBe(false)
    expect(isAvatarId(9)).toBe(false)
    expect(isAvatarId(-1)).toBe(false)
  })

  it('rejects things that are not numbers, since this guards form input', () => {
    expect(isAvatarId('3')).toBe(false)
    expect(isAvatarId(null)).toBe(false)
    expect(isAvatarId(undefined)).toBe(false)
    expect(isAvatarId(NaN)).toBe(false)
    expect(isAvatarId(3.5)).toBe(false)
  })
})

describe('fallbackAvatarId', () => {
  it('always returns a real id', () => {
    for (const id of ['a', 'user_123', '', 'user_3IxdancXqgKNAmlyCbtcOqFWTV0']) {
      expect(isAvatarId(fallbackAvatarId(id))).toBe(true)
    }
  })

  it('is stable for the same player', () => {
    expect(fallbackAvatarId('user_abc')).toBe(fallbackAvatarId('user_abc'))
  })

  it('spreads different players across the cast rather than piling on one', () => {
    const seen = new Set(
      Array.from({ length: 200 }, (_, i) => fallbackAvatarId(`user_${i}`)),
    )
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('avatarSrc', () => {
  it('points at the rendered file', () => {
    expect(avatarSrc(3)).toBe('/avatars/3.png')
  })
})
