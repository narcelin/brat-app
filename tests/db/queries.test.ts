import { describe, it, expect } from 'vitest'
import { shapeCurrentWeek, shapeMine, shapeRoster, shapeBallot, type WeekRow, type BallotRow } from '../../lib/db/queries'
import { isSeed } from '../../lib/domain/avatar'

const base = {
  week_id: 1,
  week_number: 1,
  drops_at: new Date('2026-09-01T00:00:00Z'),
  submissions_close_at: new Date('2026-09-08T00:00:00Z'),
  voting_closes_at: new Date('2026-09-09T00:00:00Z'),
  forced_state: null,
}

const noMedia = {
  media_pathname: null,
  media_type: null,
  trim_start: null,
  trim_end: null,
}

const rows: WeekRow[] = [
  {
    ...base, objective_id: 10, title: 'Bush', description: '', tier: 'easy',
    submission_id: 99, submission_user_id: 'alice',
    media_pathname: 'w1/o10/alice.mp4', media_type: 'video',
    trim_start: 1.5, trim_end: 9,
  },
  {
    ...base, objective_id: 11, title: 'Shoey', description: '', tier: 'unhinged',
    submission_id: null, submission_user_id: null, ...noMedia,
  },
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

  it('lets an admin override win over the clock', () => {
    const forced = rows.map((r) => ({ ...r, forced_state: 'VOTING' as const }))
    const week = shapeCurrentWeek(forced, 'alice', during)
    expect(week?.state).toBe('VOTING')
    // The real schedule stays visible so the override is never invisible.
    expect(week?.naturalState).toBe('SUBMITTING')
    expect(week?.forcedState).toBe('VOTING')
  })

  it('reports no override when none is set', () => {
    const week = shapeCurrentWeek(rows, 'alice', during)
    expect(week?.forcedState).toBeNull()
    expect(week?.state).toBe(week?.naturalState)
  })

  it('reports the viewers own submission', () => {
    const week = shapeCurrentWeek(rows, 'alice', during)
    expect(week?.objectives[0].mySubmission?.id).toBe(99)
    expect(week?.objectives[1].mySubmission).toBeNull()
  })

  // The player has to be able to see what they posted to judge whether it is
  // worth replacing, so the media has to survive shaping — not just its id.
  it('carries the viewers own media so it can be played back', () => {
    const week = shapeCurrentWeek(rows, 'alice', during)
    expect(week?.objectives[0].mySubmission).toEqual({
      id: 99,
      mediaPathname: 'w1/o10/alice.mp4',
      mediaType: 'video',
      trimStart: 1.5,
      trimEnd: 9,
    })
  })

  it('never reports another players submission as the viewers own', () => {
    const week = shapeCurrentWeek(rows, 'bob', during)
    expect(week?.objectives[0].mySubmission).toBeNull()
  })
})

describe('shapeMine', () => {
  const mine: WeekRow = rows[0]

  it('returns the submission when the viewer owns it', () => {
    expect(shapeMine(mine, 'alice')?.mediaPathname).toBe('w1/o10/alice.mp4')
  })

  // The bug this guards against is a media pathname reaching a player who did
  // not post it: that pathname is playable through the media route, so leaking
  // it before reveal would let anyone watch anyone.
  it('never leaks the media pathname to a player who does not own it', () => {
    expect(shapeMine(mine, 'bob')).toBeNull()
  })

  it('returns null when there is no submission at all', () => {
    expect(shapeMine(rows[1], 'alice')).toBeNull()
  })

  // Submissions predating the media_pathname column would otherwise shape into
  // a player with a proof that cannot load.
  it('returns null when the row has no media pathname', () => {
    expect(shapeMine({ ...mine, media_pathname: null }, 'alice')).toBeNull()
  })

  it('keeps a photos null trim rather than inventing one', () => {
    const photo = { ...mine, media_type: 'photo' as const, trim_start: null, trim_end: null }
    expect(shapeMine(photo, 'alice')).toMatchObject({
      mediaType: 'photo', trimStart: null, trimEnd: null,
    })
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
      ...noMedia,
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

describe('shapeRoster', () => {
  const rows = [
    { user_id: 'u1', display_name: 'Zoe', avatar_url: null, avatar_seed: null, has_submitted: false },
    { user_id: 'u2', display_name: 'Mikey', avatar_url: 'https://x/m.png', avatar_seed: 12345, has_submitted: true },
    { user_id: 'u3', display_name: 'Alice', avatar_url: null, avatar_seed: null, has_submitted: false },
    { user_id: 'u4', display_name: 'Bob', avatar_url: null, avatar_seed: -5, has_submitted: true },
  ]

  it('floats everyone who has posted to the top', () => {
    expect(shapeRoster(rows).map((r) => r.displayName)).toEqual(['Bob', 'Mikey', 'Alice', 'Zoe'])
  })

  it('orders alphabetically within each group, so the list is stable', () => {
    const submitted = shapeRoster(rows).filter((r) => r.hasSubmitted).map((r) => r.displayName)
    expect(submitted).toEqual(['Bob', 'Mikey'])
  })

  it('carries identity through but has nowhere to put media', () => {
    const entry = shapeRoster(rows)[0]
    expect(Object.keys(entry).sort()).toEqual([
      'avatarSeed', 'avatarUrl', 'displayName', 'hasSubmitted', 'userId',
    ])
  })

  it('keeps a rolled seed', () => {
    expect(shapeRoster(rows).find((r) => r.userId === 'u2')!.avatarSeed).toBe(12345)
  })

  it('falls back to a real face when the stored seed is missing or invalid', () => {
    const zoe = shapeRoster(rows).find((r) => r.userId === 'u1')!
    const bob = shapeRoster(rows).find((r) => r.userId === 'u4')!
    expect(isSeed(zoe.avatarSeed)).toBe(true)
    expect(isSeed(bob.avatarSeed)).toBe(true) // -5 is out of range
  })

  it('handles an empty roster', () => {
    expect(shapeRoster([])).toEqual([])
  })
})

describe('shapeBallot', () => {
  const base = {
    objective_id: 1,
    title: 'Shower fully clothed',
    tier: 'unhinged' as const,
    my_place: null as number | null,
    my_ranked_user_id: null as string | null,
    my_approved: null as boolean | null,
  }
  const alice = {
    ...base,
    entrant_id: 'alice', display_name: 'Alice', avatar_seed: 10,
    submission_id: 1, media_pathname: 'p/a', media_type: 'video' as const,
    trim_start: 0, trim_end: 12,
  }
  const bob = {
    ...base,
    entrant_id: 'bob', display_name: 'Bob', avatar_seed: 20,
    submission_id: 2, media_pathname: 'p/b', media_type: 'photo' as const,
    trim_start: null, trim_end: null,
  }

  it('groups entrants under their objective', () => {
    const ballot = shapeBallot([alice, bob] as BallotRow[], 'zoe')
    expect(ballot).toHaveLength(1)
    expect(ballot[0].entrants.map((e) => e.userId)).toEqual(['alice', 'bob'])
  })

  it('marks a single-entrant objective as a ratify vote', () => {
    const ballot = shapeBallot([alice] as BallotRow[], 'zoe')
    expect(ballot[0].isRatify).toBe(true)
  })

  it('is a ranked ballot with two entrants', () => {
    expect(shapeBallot([alice, bob] as BallotRow[], 'zoe')[0].isRatify).toBe(false)
  })

  it('reads back the viewers own ranking in place order', () => {
    const rows = [
      { ...alice, my_place: 2, my_ranked_user_id: 'alice' },
      { ...bob, my_place: 1, my_ranked_user_id: 'bob' },
    ] as BallotRow[]
    expect(shapeBallot(rows, 'zoe')[0].myRanking).toEqual(['bob', 'alice'])
  })

  it('reports no ranking when the viewer has not voted', () => {
    expect(shapeBallot([alice, bob] as BallotRow[], 'zoe')[0].myRanking).toEqual([])
  })

  it('reads back the viewers ratification', () => {
    const rows = [{ ...alice, my_approved: true }] as BallotRow[]
    expect(shapeBallot(rows, 'zoe')[0].myRatification).toBe(true)
  })
})
