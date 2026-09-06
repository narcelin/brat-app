import { describe, it, expect } from 'vitest'
import { playerFromClerk } from '../../lib/auth/current-player'

describe('playerFromClerk', () => {
  it('prefers the full name', () => {
    const p = playerFromClerk({ id: 'u1', fullName: 'Mikey', username: 'mikey99', imageUrl: null })
    expect(p).toEqual({ id: 'u1', displayName: 'Mikey', avatarUrl: null })
  })

  it('falls back to the username when there is no full name', () => {
    const p = playerFromClerk({ id: 'u1', fullName: null, username: 'mikey99', imageUrl: null })
    expect(p.displayName).toBe('mikey99')
  })

  it('falls back to a placeholder rather than an empty name, so nobody is unlabelled on a ballot', () => {
    const p = playerFromClerk({ id: 'u1', fullName: null, username: null, imageUrl: null })
    expect(p.displayName).toBe('Brat')
  })

  it('carries the avatar through', () => {
    const p = playerFromClerk({ id: 'u1', fullName: 'Mikey', username: null, imageUrl: 'https://x/y.png' })
    expect(p.avatarUrl).toBe('https://x/y.png')
  })
})
