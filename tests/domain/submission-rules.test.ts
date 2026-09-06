import { describe, it, expect } from 'vitest'
import { canSubmit, canViewSubmission } from '../../lib/domain/submission-rules'

describe('canSubmit', () => {
  it('allows submitting only while the submission window is open', () => {
    expect(canSubmit('SUBMITTING')).toBe(true)
  })

  it('rejects submitting before the drop', () => {
    expect(canSubmit('PENDING')).toBe(false)
  })

  it('rejects submitting once voting has started', () => {
    expect(canSubmit('VOTING')).toBe(false)
  })

  it('rejects submitting after the week closes', () => {
    expect(canSubmit('CLOSED')).toBe(false)
  })
})

describe('canViewSubmission', () => {
  it('hides other players proof while submissions are open', () => {
    expect(canViewSubmission('SUBMITTING', 'alice', 'bob')).toBe(false)
  })

  it('always shows you your own proof, even before reveal', () => {
    expect(canViewSubmission('SUBMITTING', 'alice', 'alice')).toBe(true)
  })

  it('reveals everyone once voting opens', () => {
    expect(canViewSubmission('VOTING', 'alice', 'bob')).toBe(true)
  })

  it('keeps everything visible after the week closes, for the archive', () => {
    expect(canViewSubmission('CLOSED', 'alice', 'bob')).toBe(true)
  })

  it('hides everything before the drop, including your own', () => {
    expect(canViewSubmission('PENDING', 'alice', 'alice')).toBe(false)
  })
})
