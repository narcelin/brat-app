import { describe, it, expect } from 'vitest'
import { shapeCurrentWeek, type WeekRow } from '../../lib/db/queries'

const base = {
  week_id: 1,
  week_number: 1,
  drops_at: new Date('2026-09-01T00:00:00Z'),
  submissions_close_at: new Date('2026-09-08T00:00:00Z'),
  voting_closes_at: new Date('2026-09-09T00:00:00Z'),
}

const rows: WeekRow[] = [
  { ...base, objective_id: 10, title: 'Bush', description: '', tier: 'easy', submission_id: 99, submission_user_id: 'alice' },
  { ...base, objective_id: 11, title: 'Shoey', description: '', tier: 'unhinged', submission_id: null, submission_user_id: null },
]

const during = new Date('2026-09-03T00:00:00Z')

describe('shapeCurrentWeek', () => {
  it('returns null when there is no active week', () => {
    expect(shapeCurrentWeek([], 'alice', during)).toBeNull()
  })

  it('groups objectives under the week', () => {
    const week = shapeCurrentWeek(rows, 'alice', during)
    expect(week?.objectives.map((o) => o.title)).toEqual(['Bush', 'Shoey'])
  })

  it('derives the week state from the windows', () => {
    expect(shapeCurrentWeek(rows, 'alice', during)?.state).toBe('SUBMITTING')
  })

  it('reports the viewers own submission', () => {
    const week = shapeCurrentWeek(rows, 'alice', during)
    expect(week?.objectives[0].mySubmissionId).toBe(99)
    expect(week?.objectives[1].mySubmissionId).toBeNull()
  })

  it('never reports another players submission as the viewers own', () => {
    const week = shapeCurrentWeek(rows, 'bob', during)
    expect(week?.objectives[0].mySubmissionId).toBeNull()
  })
})

describe('shapeCurrentWeek with a week that has no objectives', () => {
  const emptyWeekRows: WeekRow[] = [
    {
      ...base,
      objective_id: null,
      title: null as unknown as string,
      description: null as unknown as string,
      tier: null as unknown as WeekRow['tier'],
      submission_id: null,
      submission_user_id: null,
    },
  ]

  it('shapes to a CurrentWeek with an empty objectives array', () => {
    const week = shapeCurrentWeek(emptyWeekRows, 'alice', during)
    expect(week).not.toBeNull()
    expect(week?.objectives).toEqual([])
  })

  it('still reports the correct state from its windows', () => {
    const week = shapeCurrentWeek(emptyWeekRows, 'alice', during)
    expect(week?.state).toBe('SUBMITTING')
  })
})
