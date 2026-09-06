import { describe, it, expect } from 'vitest'
import { weekState, type WeekWindows } from '../../lib/domain/week-state'

const windows: WeekWindows = {
  dropsAt: new Date('2026-09-07T18:00:00Z'),
  submissionsCloseAt: new Date('2026-09-13T18:00:00Z'),
  votingClosesAt: new Date('2026-09-14T18:00:00Z'),
}

describe('weekState', () => {
  it('is PENDING before the drop', () => {
    expect(weekState(windows, new Date('2026-09-07T17:59:59Z'))).toBe('PENDING')
  })

  it('is SUBMITTING at the exact moment of the drop', () => {
    expect(weekState(windows, new Date('2026-09-07T18:00:00Z'))).toBe('SUBMITTING')
  })

  it('is SUBMITTING during the submission window', () => {
    expect(weekState(windows, new Date('2026-09-10T12:00:00Z'))).toBe('SUBMITTING')
  })

  it('is VOTING the instant submissions close, so voting never overlaps submitting', () => {
    expect(weekState(windows, new Date('2026-09-13T18:00:00Z'))).toBe('VOTING')
  })

  it('is VOTING during the voting window', () => {
    expect(weekState(windows, new Date('2026-09-14T09:00:00Z'))).toBe('VOTING')
  })

  it('is CLOSED once voting closes', () => {
    expect(weekState(windows, new Date('2026-09-14T18:00:00Z'))).toBe('CLOSED')
  })

  it('throws when the windows are out of order', () => {
    const broken: WeekWindows = {
      dropsAt: new Date('2026-09-13T18:00:00Z'),
      submissionsCloseAt: new Date('2026-09-07T18:00:00Z'),
      votingClosesAt: new Date('2026-09-14T18:00:00Z'),
    }
    expect(() => weekState(broken, new Date())).toThrow(/order/i)
  })
})
