import { describe, it, expect } from 'vitest'
import {
  canClearOverride, canForceState, effectiveWeekState, isForcedState, weekState,
  type WeekWindows,
} from '../../lib/domain/week-state'

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

describe('effectiveWeekState', () => {
  const now = new Date('2026-09-10T12:00:00Z') // naturally SUBMITTING

  it('follows the clock when nothing is forced', () => {
    expect(effectiveWeekState(windows, null, now)).toBe('SUBMITTING')
  })

  it('lets an override win over the clock', () => {
    expect(effectiveWeekState(windows, 'VOTING', now)).toBe('VOTING')
    expect(effectiveWeekState(windows, 'CLOSED', now)).toBe('CLOSED')
  })

  it('still runs on its own if nobody ever intervenes', () => {
    expect(effectiveWeekState(windows, null, new Date('2026-09-14T09:00:00Z'))).toBe('VOTING')
  })
})

describe('canForceState', () => {
  it('allows moving forward', () => {
    expect(canForceState('SUBMITTING', 'VOTING')).toEqual({ ok: true })
    expect(canForceState('SUBMITTING', 'CLOSED')).toEqual({ ok: true })
    expect(canForceState('PENDING', 'SUBMITTING')).toEqual({ ok: true })
  })

  it('refuses to reopen submissions after the field was revealed', () => {
    const result = canForceState('VOTING', 'SUBMITTING')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/forward/i)
  })

  it('refuses to change a closed week at all', () => {
    for (const target of ['SUBMITTING', 'VOTING', 'CLOSED'] as const) {
      expect(canForceState('CLOSED', target).ok).toBe(false)
    }
  })

  it('refuses a no-op, so the UI never offers a button that does nothing', () => {
    expect(canForceState('VOTING', 'VOTING').ok).toBe(false)
  })
})

describe('canClearOverride', () => {
  it('is allowed while the week is still running', () => {
    expect(canClearOverride('SUBMITTING')).toEqual({ ok: true })
    expect(canClearOverride('VOTING')).toEqual({ ok: true })
  })

  it('is refused once closed, since the clock could reopen submissions', () => {
    expect(canClearOverride('CLOSED').ok).toBe(false)
  })
})

describe('isForcedState', () => {
  it('accepts the forceable states', () => {
    expect(isForcedState('VOTING')).toBe(true)
  })

  it('rejects PENDING — un-dropping a week would hide seen objectives', () => {
    expect(isForcedState('PENDING')).toBe(false)
  })

  it('rejects junk, since this guards a request body', () => {
    expect(isForcedState('closed')).toBe(false)
    expect(isForcedState(2)).toBe(false)
    expect(isForcedState(null)).toBe(false)
  })
})
