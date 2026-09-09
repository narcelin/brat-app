import { describe, it, expect } from 'vitest'
import { isResetConfirmed, RESET_PHRASE } from '../../lib/domain/reset'

describe('isResetConfirmed', () => {
  it('accepts the exact phrase', () => {
    expect(isResetConfirmed(RESET_PHRASE)).toBe(true)
  })

  // Each of these is a plausible accident — an empty field, a truthy default,
  // a replayed body — and every one of them would wipe the season.
  it('refuses anything else', () => {
    for (const value of ['', 'reset', ' RESET', 'RESET ', 'RESET!', true, 1, null, undefined, {}, ['RESET']]) {
      expect(isResetConfirmed(value), `should refuse ${JSON.stringify(value)}`).toBe(false)
    }
  })
})
