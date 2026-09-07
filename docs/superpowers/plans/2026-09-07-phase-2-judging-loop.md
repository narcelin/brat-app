# Phase 2: The Judging Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a week's submissions close, every player can watch everyone's proof, rank it, and see points and a leaderboard come out the other side.

**Architecture:** All judging rules live in `lib/domain/` as pure functions — who may vote for whom, how many places an objective awards, how a pile of individual rankings becomes one group result. The database, API routes and components are thin shells over them, exactly as in Phase 1. Media is streamed through an authenticated route because Blob is private, and that route is also where the reveal rule is enforced for media.

**Tech Stack:** Next.js (App Router, TypeScript), Neon Postgres via `@neondatabase/serverless`, Clerk auth, Vercel Blob (private), vitest.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-09-06-brat-olympics-design.md` — the authority on all rules. Where this plan and the spec disagree, the spec wins.
- **Proof stays hidden until submissions close.** Phase 1 enforces this for metadata; Phase 2 must enforce it for the media itself. A player must not be able to stream another player's file while the week is `SUBMITTING`.
- **No self-voting.** Enforced server-side, never only in the UI.
- **Voters rank as many places as there are entrants** — 4 entrants means rank 3, 2 entrants means rank 2.
- **Only as many places are awarded as there were entrants.** Nobody wins a medal in a race they ran alone.
- **A single-entrant objective gets a yes/no ratify vote**, not a ranked ballot. A majority of the ratify votes *actually cast* (not of the whole group) awards 1st.
- **Borda count:** a 1st-place vote is worth 3, a 2nd 2, a 3rd 1. Highest total takes gold.
- **Ties share the place and skip the next.** Two players level both take gold, nobody takes silver, bronze is still awarded.
- **Ballots are per objective** — each saves on its own, no requirement to complete all three.
- Medal values come from `medalsFor(tier)` in `lib/domain/tiers.ts`, never hardcoded.
- **Scores are derived from votes, not stored.** A miscast vote must be fixable without corrupting history.
- The unit suite must pass with **no environment files present**. `lib/db/client.ts` is a lazy proxy specifically to allow this; nothing may reintroduce an import-time `DATABASE_URL` dependency.
- Never commit secrets.
- Scale: 16 players, 3 objectives per week, 8-week season.

---

### Task 1: Authenticated media streaming

Nothing in Phase 2 works until proof can be watched. Blob is private, so media is fetched server-side and streamed through the app — and that route is where the reveal rule is enforced for media.

**Files:**
- Create: `app/api/media/[...pathname]/route.ts`
- Create: `lib/db/media.ts`
- Test: `tests/db/media.test.ts`

**Interfaces:**
- Consumes: `currentPlayer()` from `lib/auth/current-player.ts`; `canViewSubmission(state, submissionUserId, viewerId)` from `lib/domain/submission-rules.ts`; `sql` from `lib/db/client.ts`; `effectiveWeekState` from `lib/domain/week-state.ts`
- Produces:
  - `interface MediaOwner { userId: string; weekState: WeekState; mediaPathname: string }`
  - `async function findMediaOwner(pathname: string): Promise<MediaOwner | null>`
  - `GET /api/media/<pathname>` streaming the file, or 403/404

- [ ] **Step 1: Write the failing test for the lookup shaping**

```ts
// File: tests/db/media.test.ts
import { describe, it, expect } from 'vitest'
import { shapeMediaOwner, type MediaOwnerRow } from '../../lib/db/media'

const row: MediaOwnerRow = {
  user_id: 'alice',
  media_pathname: 'submissions/1/alice/proof.mp4',
  drops_at: new Date('2026-09-01T00:00:00Z'),
  submissions_close_at: new Date('2026-09-08T00:00:00Z'),
  voting_closes_at: new Date('2026-09-09T00:00:00Z'),
  forced_state: null,
}

describe('shapeMediaOwner', () => {
  it('returns null when nothing owns that path', () => {
    expect(shapeMediaOwner([], new Date())).toBeNull()
  })

  it('reports the owner and the week state that governs it', () => {
    const owner = shapeMediaOwner([row], new Date('2026-09-03T00:00:00Z'))
    expect(owner).toEqual({
      userId: 'alice',
      weekState: 'SUBMITTING',
      mediaPathname: 'submissions/1/alice/proof.mp4',
    })
  })

  it('respects an admin override, so forcing VOTING reveals media too', () => {
    const forced = [{ ...row, forced_state: 'VOTING' as const }]
    expect(shapeMediaOwner(forced, new Date('2026-09-03T00:00:00Z'))?.weekState).toBe('VOTING')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/media.test.ts`
Expected: FAIL — cannot resolve `../../lib/db/media`

- [ ] **Step 3: Write the lookup**

```ts
// File: lib/db/media.ts
import { sql } from './client'
import {
  effectiveWeekState, type ForcedState, type WeekState,
} from '../domain/week-state'

export interface MediaOwnerRow {
  user_id: string
  media_pathname: string
  drops_at: Date
  submissions_close_at: Date
  voting_closes_at: Date
  forced_state: ForcedState | null
}

export interface MediaOwner {
  userId: string
  weekState: WeekState
  mediaPathname: string
}

export function shapeMediaOwner(rows: MediaOwnerRow[], now: Date): MediaOwner | null {
  const row = rows[0]
  if (!row) return null

  return {
    userId: row.user_id,
    weekState: effectiveWeekState(
      {
        dropsAt: row.drops_at,
        submissionsCloseAt: row.submissions_close_at,
        votingClosesAt: row.voting_closes_at,
      },
      row.forced_state,
      now,
    ),
    mediaPathname: row.media_pathname,
  }
}

/** Who owns this file and which week governs it. The path is matched exactly
 *  rather than trusted: it arrives from the URL. */
export async function findMediaOwner(
  pathname: string,
  now: Date = new Date(),
): Promise<MediaOwner | null> {
  const rows = (await sql`
    SELECT s.user_id, s.media_pathname,
           w.drops_at, w.submissions_close_at, w.voting_closes_at, w.forced_state
    FROM submissions s
    JOIN objectives o ON o.id = s.objective_id
    JOIN weeks w ON w.id = o.week_id
    WHERE s.media_pathname = ${pathname}
    LIMIT 1
  `) as MediaOwnerRow[]

  return shapeMediaOwner(rows, now)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/media.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Write the streaming route**

```ts
// File: app/api/media/[...pathname]/route.ts
import { get } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../../lib/auth/current-player'
import { findMediaOwner } from '../../../../lib/db/media'
import { canViewSubmission } from '../../../../lib/domain/submission-rules'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pathname: string[] }> },
) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { pathname: segments } = await params
  const pathname = segments.join('/')

  const owner = await findMediaOwner(pathname)
  // 404 rather than 403 for an unknown path: whether a given blob exists is
  // not something an unauthorised caller should be able to probe.
  if (!owner) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // The reveal rule, applied to the bytes themselves. Phase 1 keeps other
  // players' media out of the page; without this a player could stream a
  // rival's proof mid-week straight from the API.
  if (!canViewSubmission(owner.weekState, owner.userId, player.id)) {
    return NextResponse.json({ error: 'Not yet' }, { status: 403 })
  }

  const blob = await get(owner.mediaPathname, { access: 'private' })
  if (!blob) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': blob.headers.get('content-type') ?? 'application/octet-stream',
      // Per-player authorisation decides this response, so it must never land
      // in a shared cache.
      'Cache-Control': 'private, no-store',
    },
  })
}
```

- [ ] **Step 6: Verify the guards without a browser**

Run `npm run dev`, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/media/submissions/1/nobody/none.mp4
```

Expected: `401` (unauthenticated). Report that the signed-in 403 and 200 paths could not be exercised without a session and need the integration test in Step 7.

- [ ] **Step 7: Write an integration test proving media is gated**

```ts
// File: tests/integration/media-privacy.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from '../../lib/db/client'
import { findMediaOwner } from '../../lib/db/media'
import { canViewSubmission } from '../../lib/domain/submission-rules'

describe.skipIf(!process.env.DATABASE_URL)('media privacy (integration)', () => {
  const ALICE = 'itest_media_alice'
  const BOB = 'itest_media_bob'
  const PATH = 'submissions/itest/alice-media-secret'
  let objectiveId: number | null = null

  beforeAll(async () => {
    const [objective] = (await sql`
      SELECT o.id FROM objectives o
      JOIN weeks w ON w.id = o.week_id
      ORDER BY o.id LIMIT 1
    `) as { id: number }[]
    objectiveId = objective.id

    await sql`
      INSERT INTO users (id, display_name)
      VALUES (${ALICE}, 'Media Alice'), (${BOB}, 'Media Bob')
      ON CONFLICT (id) DO NOTHING
    `
    await sql`
      INSERT INTO submissions (objective_id, user_id, media_url, media_pathname, media_type)
      VALUES (${objectiveId}, ${ALICE}, 'https://itest.invalid/a', ${PATH}, 'photo')
      ON CONFLICT (objective_id, user_id) DO UPDATE SET media_pathname = EXCLUDED.media_pathname
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM submissions WHERE user_id IN (${ALICE}, ${BOB})`.catch(() => {})
    await sql`DELETE FROM users WHERE id IN (${ALICE}, ${BOB})`.catch(() => {})
  })

  it('finds the owner and the governing week state', async () => {
    const owner = await findMediaOwner(PATH)
    expect(owner?.userId).toBe(ALICE)
    expect(owner?.mediaPathname).toBe(PATH)
  })

  it('refuses bob while submissions are open, and allows him once voting starts', async () => {
    const owner = await findMediaOwner(PATH)
    expect(canViewSubmission('SUBMITTING', owner!.userId, BOB)).toBe(false)
    expect(canViewSubmission('VOTING', owner!.userId, BOB)).toBe(true)
  })

  it('always allows alice her own media', async () => {
    const owner = await findMediaOwner(PATH)
    expect(canViewSubmission('SUBMITTING', owner!.userId, ALICE)).toBe(true)
  })
})
```

Run: `npm run test:integration`
Expected: PASS. **If the first test fails because no objectives exist, seed them with `npm run db:apply` rather than weakening the test.**

- [ ] **Step 8: Commit**

```bash
git add lib/db/media.ts app/api/media tests/db/media.test.ts tests/integration/media-privacy.test.ts
git commit -m "feat: stream private media behind an auth and reveal check"
```

---

### Task 2: Domain — who may vote, and for how many places

**Files:**
- Create: `lib/domain/ballot.ts`
- Test: `tests/domain/ballot.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `const MAX_PLACES = 3`
  - `function placesAwarded(entrantCount: number): number`
  - `function isRatifyObjective(entrantCount: number): boolean`
  - `type BallotResult = { ok: true } | { ok: false; reason: string }`
  - `function validateBallot(ranking: string[], entrantIds: string[], voterId: string): BallotResult`

- [ ] **Step 1: Write the failing test**

```ts
// File: tests/domain/ballot.test.ts
import { describe, it, expect } from 'vitest'
import {
  MAX_PLACES, isRatifyObjective, placesAwarded, validateBallot,
} from '../../lib/domain/ballot'

describe('placesAwarded', () => {
  it('never awards more places than there were entrants', () => {
    expect(placesAwarded(1)).toBe(1)
    expect(placesAwarded(2)).toBe(2)
    expect(placesAwarded(3)).toBe(3)
  })

  it('caps at three however many entered', () => {
    expect(placesAwarded(4)).toBe(MAX_PLACES)
    expect(placesAwarded(16)).toBe(MAX_PLACES)
  })

  it('awards nothing when nobody entered', () => {
    expect(placesAwarded(0)).toBe(0)
  })
})

describe('isRatifyObjective', () => {
  it('is a ratify vote with exactly one entrant', () => {
    expect(isRatifyObjective(1)).toBe(true)
  })

  it('is a ranked ballot with two or more', () => {
    expect(isRatifyObjective(2)).toBe(false)
  })

  it('is neither with no entrants', () => {
    expect(isRatifyObjective(0)).toBe(false)
  })
})

describe('validateBallot', () => {
  const entrants = ['alice', 'bob', 'carol', 'dave']

  it('accepts a full ranking from someone who did not enter', () => {
    expect(validateBallot(['alice', 'bob', 'carol'], entrants, 'zoe')).toEqual({ ok: true })
  })

  it('rejects a voter ranking themselves', () => {
    const result = validateBallot(['alice', 'bob', 'carol'], entrants, 'alice')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/yourself/i)
  })

  it('rejects the same player twice', () => {
    const result = validateBallot(['alice', 'alice', 'bob'], entrants, 'zoe')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/once/i)
  })

  it('rejects a player who did not enter this objective', () => {
    const result = validateBallot(['alice', 'bob', 'stranger'], entrants, 'zoe')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/did not enter/i)
  })

  it('requires exactly as many places as the objective awards', () => {
    expect(validateBallot(['alice', 'bob'], entrants, 'zoe').ok).toBe(false)
    expect(validateBallot(['alice', 'bob', 'carol', 'dave'], entrants, 'zoe').ok).toBe(false)
  })

  it('ranks only two when only two entered', () => {
    expect(validateBallot(['alice', 'bob'], ['alice', 'bob'], 'zoe')).toEqual({ ok: true })
  })

  it('lets an entrant rank everyone except themselves', () => {
    // Alice entered a three-way race, so she ranks the other two.
    expect(validateBallot(['bob', 'carol'], ['alice', 'bob', 'carol'], 'alice')).toEqual({ ok: true })
  })

  it('rejects a ballot on an objective nobody entered', () => {
    expect(validateBallot([], [], 'zoe').ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/ballot.test.ts`
Expected: FAIL — cannot resolve `../../lib/domain/ballot`

- [ ] **Step 3: Write the implementation**

```ts
// File: lib/domain/ballot.ts

/** Gold, silver, bronze. */
export const MAX_PLACES = 3

/** Nobody wins a medal in a race they ran alone, so an objective can never
 *  award more places than it had entrants. */
export function placesAwarded(entrantCount: number): number {
  return Math.max(0, Math.min(MAX_PLACES, entrantCount))
}

/** One entrant means there is nothing to rank. It becomes "did they actually
 *  do this?" instead — without which an uncontested entry would score with
 *  nobody having verified it, and voting is the only verification the game
 *  has. */
export function isRatifyObjective(entrantCount: number): boolean {
  return entrantCount === 1
}

export type BallotResult = { ok: true } | { ok: false; reason: string }

/** A voter ranks as many places as the objective awards — minus themselves,
 *  since a player cannot vote for their own entry. */
export function validateBallot(
  ranking: string[],
  entrantIds: string[],
  voterId: string,
): BallotResult {
  if (entrantIds.length === 0) {
    return { ok: false, reason: 'Nobody entered this objective' }
  }

  if (ranking.includes(voterId)) {
    return { ok: false, reason: 'You cannot vote for yourself' }
  }

  if (new Set(ranking).size !== ranking.length) {
    return { ok: false, reason: 'Each player can be ranked only once' }
  }

  for (const id of ranking) {
    if (!entrantIds.includes(id)) {
      return { ok: false, reason: 'Someone on this ballot did not enter this objective' }
    }
  }

  // The voter's own entry is not theirs to rank, so it does not count toward
  // how many places they are being asked to fill.
  const rankable = entrantIds.filter((id) => id !== voterId).length
  const expected = Math.min(placesAwarded(entrantIds.length), rankable)

  if (ranking.length !== expected) {
    return {
      ok: false,
      reason: `Rank exactly ${expected} ${expected === 1 ? 'entry' : 'entries'}`,
    }
  }

  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/ballot.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add lib/domain/ballot.ts tests/domain/ballot.test.ts
git commit -m "feat: add ballot rules"
```

---

### Task 3: Domain — turning ballots into medals

**Files:**
- Create: `lib/domain/scoring.ts`
- Test: `tests/domain/scoring.test.ts`

**Interfaces:**
- Consumes: `Tier`, `medalsFor` from `lib/domain/tiers.ts`; `placesAwarded` from `lib/domain/ballot.ts`
- Produces:
  - `interface CastBallot { voterId: string; ranking: string[] }`
  - `interface Award { userId: string; place: number | null; points: number; bordaScore: number }`
  - `function bordaScores(ballots: CastBallot[], entrantIds: string[]): Map<string, number>`
  - `function scoreObjective(ballots: CastBallot[], entrantIds: string[], tier: Tier): Award[]`
  - `function scoreRatify(approvals: boolean[], entrantId: string, tier: Tier): Award[]`

- [ ] **Step 1: Write the failing test**

```ts
// File: tests/domain/scoring.test.ts
import { describe, it, expect } from 'vitest'
import { bordaScores, scoreObjective, scoreRatify } from '../../lib/domain/scoring'
import { medalsFor } from '../../lib/domain/tiers'

const hard = medalsFor('hard') // 30 / 20 / 10, effort 3

describe('bordaScores', () => {
  it('weights a first place above a second above a third', () => {
    const scores = bordaScores(
      [{ voterId: 'zoe', ranking: ['alice', 'bob', 'carol'] }],
      ['alice', 'bob', 'carol'],
    )
    expect(scores.get('alice')).toBe(3)
    expect(scores.get('bob')).toBe(2)
    expect(scores.get('carol')).toBe(1)
  })

  it('gives an entrant nobody ranked a zero rather than leaving them out', () => {
    const scores = bordaScores([{ voterId: 'zoe', ranking: ['alice'] }], ['alice', 'dave'])
    expect(scores.get('dave')).toBe(0)
  })

  it('sums across voters', () => {
    const scores = bordaScores(
      [
        { voterId: 'zoe', ranking: ['alice', 'bob'] },
        { voterId: 'yan', ranking: ['bob', 'alice'] },
      ],
      ['alice', 'bob'],
    )
    expect(scores.get('alice')).toBe(5)
    expect(scores.get('bob')).toBe(5)
  })
})

describe('scoreObjective', () => {
  const entrants = ['alice', 'bob', 'carol', 'dave']

  it('awards gold, silver and bronze by total', () => {
    const awards = scoreObjective(
      [
        { voterId: 'zoe', ranking: ['alice', 'bob', 'carol'] },
        { voterId: 'yan', ranking: ['alice', 'bob', 'carol'] },
      ],
      entrants,
      'hard',
    )
    const by = (id: string) => awards.find((a) => a.userId === id)!
    expect(by('alice').place).toBe(1)
    expect(by('alice').points).toBe(hard.first)
    expect(by('bob').place).toBe(2)
    expect(by('bob').points).toBe(hard.second)
    expect(by('carol').place).toBe(3)
    expect(by('carol').points).toBe(hard.third)
  })

  it('gives effort points to an entrant who did not medal', () => {
    const awards = scoreObjective(
      [{ voterId: 'zoe', ranking: ['alice', 'bob', 'carol'] }],
      entrants,
      'hard',
    )
    const dave = awards.find((a) => a.userId === 'dave')!
    expect(dave.place).toBeNull()
    expect(dave.points).toBe(hard.effort)
  })

  it('shares a place on a tie and skips the next', () => {
    // Alice and Bob both total 5; Carol trails.
    const awards = scoreObjective(
      [
        { voterId: 'zoe', ranking: ['alice', 'bob', 'carol'] },
        { voterId: 'yan', ranking: ['bob', 'alice', 'carol'] },
      ],
      ['alice', 'bob', 'carol'],
      'hard',
    )
    const by = (id: string) => awards.find((a) => a.userId === id)!
    expect(by('alice').place).toBe(1)
    expect(by('bob').place).toBe(1)
    expect(by('alice').points).toBe(hard.first)
    expect(by('bob').points).toBe(hard.first)
    // Silver is skipped; the next distinct score takes bronze.
    expect(by('carol').place).toBe(3)
    expect(by('carol').points).toBe(hard.third)
  })

  it('awards only as many places as there were entrants', () => {
    const awards = scoreObjective(
      [{ voterId: 'zoe', ranking: ['alice', 'bob'] }],
      ['alice', 'bob'],
      'hard',
    )
    expect(awards.find((a) => a.userId === 'alice')!.place).toBe(1)
    expect(awards.find((a) => a.userId === 'bob')!.place).toBe(2)
    expect(awards.some((a) => a.place === 3)).toBe(false)
  })

  it('gives everyone effort points when nobody voted at all', () => {
    const awards = scoreObjective([], entrants, 'hard')
    // No ballots means no ranking is defensible, so nobody takes a medal.
    expect(awards.every((a) => a.place === null)).toBe(true)
    expect(awards.every((a) => a.points === hard.effort)).toBe(true)
  })

  it('returns nothing for an objective nobody entered', () => {
    expect(scoreObjective([], [], 'hard')).toEqual([])
  })
})

describe('scoreRatify', () => {
  it('awards first place when a majority of votes cast approve', () => {
    const awards = scoreRatify([true, true, false], 'alice', 'hard')
    expect(awards[0].place).toBe(1)
    expect(awards[0].points).toBe(hard.first)
  })

  it('gives only effort points when the majority say no', () => {
    const awards = scoreRatify([true, false, false], 'alice', 'hard')
    expect(awards[0].place).toBeNull()
    expect(awards[0].points).toBe(hard.effort)
  })

  it('counts a majority of votes cast, not of the whole group', () => {
    // Two votes, both yes: that is a majority even in a group of sixteen.
    expect(scoreRatify([true, true], 'alice', 'hard')[0].place).toBe(1)
  })

  it('treats an exact split as not ratified', () => {
    expect(scoreRatify([true, false], 'alice', 'hard')[0].place).toBeNull()
  })

  it('gives effort points when nobody voted', () => {
    const awards = scoreRatify([], 'alice', 'hard')
    expect(awards[0].place).toBeNull()
    expect(awards[0].points).toBe(hard.effort)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/scoring.test.ts`
Expected: FAIL — cannot resolve `../../lib/domain/scoring`

- [ ] **Step 3: Write the implementation**

```ts
// File: lib/domain/scoring.ts
import { placesAwarded } from './ballot'
import { medalsFor, type Tier } from './tiers'

export interface CastBallot {
  voterId: string
  ranking: string[]
}

export interface Award {
  userId: string
  /** 1, 2 or 3, or null for an entrant who did not medal. */
  place: number | null
  points: number
  bordaScore: number
}

/** A 1st-place vote is worth 3, a 2nd 2, a 3rd 1. Entrants nobody ranked score
 *  zero rather than being omitted, so every entrant appears in the result. */
export function bordaScores(
  ballots: CastBallot[],
  entrantIds: string[],
): Map<string, number> {
  const scores = new Map<string, number>(entrantIds.map((id) => [id, 0]))

  for (const ballot of ballots) {
    ballot.ranking.forEach((userId, index) => {
      if (!scores.has(userId)) return // not an entrant; ignore rather than throw
      scores.set(userId, (scores.get(userId) ?? 0) + Math.max(0, 3 - index))
    })
  }

  return scores
}

function medalPoints(tier: Tier, place: number | null): number {
  const medals = medalsFor(tier)
  if (place === 1) return medals.first
  if (place === 2) return medals.second
  if (place === 3) return medals.third
  return medals.effort
}

export function scoreObjective(
  ballots: CastBallot[],
  entrantIds: string[],
  tier: Tier,
): Award[] {
  if (entrantIds.length === 0) return []

  const scores = bordaScores(ballots, entrantIds)
  const places = placesAwarded(entrantIds.length)

  // With no ballots at all there is no defensible ranking, so nobody medals
  // and everyone who entered takes effort points.
  const anyVotes = [...scores.values()].some((score) => score > 0)

  const allScores = [...scores.values()]

  return entrantIds.map((userId) => {
    const score = scores.get(userId) ?? 0
    // Competition ranking: your place is one more than the number of people
    // who beat you. Ties therefore share a place and skip the next — two
    // golds means no silver, and the next distinct score takes bronze.
    // (Indexing into the distinct sorted scores would give DENSE ranking,
    // 1-1-2, which is not the agreed rule.)
    const rank = allScores.filter((other) => other > score).length + 1
    const place = anyVotes && score > 0 && rank <= places ? rank : null

    return { userId, place, points: medalPoints(tier, place), bordaScore: score }
  })
}

/** A lone entrant is not ranked but ratified: did they actually do it? A
 *  majority of the votes ACTUALLY CAST decides, not a majority of the group —
 *  otherwise a quiet week would fail an honest entry. */
export function scoreRatify(
  approvals: boolean[],
  entrantId: string,
  tier: Tier,
): Award[] {
  const yes = approvals.filter(Boolean).length
  const ratified = approvals.length > 0 && yes * 2 > approvals.length
  const place = ratified ? 1 : null

  return [{ userId: entrantId, place, points: medalPoints(tier, place), bordaScore: yes }]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/scoring.test.ts`
Expected: PASS, 14 tests

- [ ] **Step 5: Prove the tie rule with a mutation**

Temporarily change the rank line to dense ranking:

```ts
const rank = [...new Set(allScores)].sort((a, b) => b - a).indexOf(score) + 1
```

Run the suite and confirm the shared-place test fails — it should report the
third player as place 2 instead of 3. Restore the competition-ranking line and
confirm it passes. Report both outputs: dense versus competition ranking is
exactly the bug this test exists to catch, and a tie rule you have not seen
fail is not evidence of anything.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/scoring.ts tests/domain/scoring.test.ts
git commit -m "feat: add Borda scoring with shared places on a tie"
```

---

### Task 4: Schema — votes and ratifications

**Files:**
- Create: `db/migrations/007-votes.sql`
- Modify: `db/schema.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `votes` and `ratifications` tables

- [ ] **Step 1: Write the migration**

```sql
-- File: db/migrations/007-votes.sql

CREATE TABLE IF NOT EXISTS votes (
  id           SERIAL PRIMARY KEY,
  objective_id INTEGER NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  voter_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place        SMALLINT NOT NULL CHECK (place BETWEEN 1 AND 3),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A voter fills each place once per objective...
  UNIQUE (objective_id, voter_id, place),
  -- ...and ranks each player at most once.
  UNIQUE (objective_id, voter_id, submission_user_id),
  -- No self-voting, enforced by the database as well as the domain layer.
  CHECK (voter_id <> submission_user_id)
);

CREATE TABLE IF NOT EXISTS ratifications (
  id           SERIAL PRIMARY KEY,
  objective_id INTEGER NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  voter_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approved     BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (objective_id, voter_id)
);

CREATE INDEX IF NOT EXISTS votes_objective_idx ON votes(objective_id);
CREATE INDEX IF NOT EXISTS ratifications_objective_idx ON ratifications(objective_id);
```

- [ ] **Step 2: Add the same tables to `db/schema.sql`**

Append the identical `CREATE TABLE` and `CREATE INDEX` statements to `db/schema.sql`, below the `submissions` table, so a fresh database matches a migrated one. Do not change any existing statement.

- [ ] **Step 3: Apply and verify**

```bash
node --env-file=.env.development.local db/apply.mjs db/migrations/007-votes.sql
```

Then confirm the constraints exist and the self-vote check bites:

```bash
node --env-file=.env.development.local -e "
const { neon } = require('@neondatabase/serverless');
(async () => {
  const sql = neon(process.env.DATABASE_URL);
  const t = await sql.query(\"SELECT table_name FROM information_schema.tables WHERE table_name IN ('votes','ratifications')\");
  console.log('tables:', t.map(r => r.table_name).sort().join(', '));
  const [u] = await sql.query('SELECT id FROM users LIMIT 1');
  const [o] = await sql.query('SELECT id FROM objectives LIMIT 1');
  if (!u || !o) { console.log('no seed data to test the self-vote check against'); return; }
  try {
    await sql.query('INSERT INTO votes (objective_id, voter_id, submission_user_id, place) VALUES (\$1,\$2,\$2,1)', [o.id, u.id]);
    console.log('PROBLEM: the database accepted a self-vote');
  } catch (e) { console.log('self-vote rejected:', e.constraint || e.code); }
})();
"
```

Expected: `tables: ratifications, votes` and a rejected self-vote.

- [ ] **Step 4: Re-run the seed twice to confirm idempotency is intact**

```bash
npm run db:apply && npm run db:apply
```

Expected: no errors, and objective/week counts unchanged.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/007-votes.sql db/schema.sql
git commit -m "feat: add votes and ratifications tables"
```

---

### Task 5: Queries — the ballot for a week

**Files:**
- Modify: `lib/db/queries.ts`
- Test: `tests/db/queries.test.ts` (append)

**Interfaces:**
- Consumes: `sql`; `Tier`; `isRatifyObjective` from `lib/domain/ballot.ts`
- Produces:
  - `interface BallotEntrant { userId: string; displayName: string; avatarSeed: number; submissionId: number; mediaPathname: string; mediaType: 'photo' | 'video'; trimStart: number | null; trimEnd: number | null }`
  - `interface BallotObjective { objectiveId: number; title: string; tier: Tier; entrants: BallotEntrant[]; isRatify: boolean; myRanking: string[]; myRatification: boolean | null }`
  - `function shapeBallot(rows: BallotRow[], viewerId: string): BallotObjective[]`
  - `async function getBallot(weekId: number, viewerId: string): Promise<BallotObjective[]>`

- [ ] **Step 1: Write the failing test**

```ts
// File: tests/db/queries.test.ts (append)
import { shapeBallot, type BallotRow } from '../../lib/db/queries'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/queries.test.ts`
Expected: FAIL — `shapeBallot` is not exported

- [ ] **Step 3: Write the implementation**

Add this import at the **top** of `lib/db/queries.ts`, alongside the existing
imports — not at the point where the rest of this code is appended:

```ts
import { isRatifyObjective } from '../domain/ballot'
```

`parseSeed` and `seedFromPlayerId` are already imported there from the avatar
work; do not import them twice.

Then append the rest to the end of the file:

```ts
export interface BallotRow {
  objective_id: number
  title: string
  tier: Tier
  entrant_id: string
  display_name: string
  avatar_seed: number | null
  submission_id: number
  media_pathname: string
  media_type: 'photo' | 'video'
  trim_start: number | null
  trim_end: number | null
  my_place: number | null
  my_ranked_user_id: string | null
  my_approved: boolean | null
}

export interface BallotEntrant {
  userId: string
  displayName: string
  avatarSeed: number
  submissionId: number
  mediaPathname: string
  mediaType: 'photo' | 'video'
  trimStart: number | null
  trimEnd: number | null
}

export interface BallotObjective {
  objectiveId: number
  title: string
  tier: Tier
  entrants: BallotEntrant[]
  isRatify: boolean
  /** The viewer's own ranking, best first. Empty when they have not voted. */
  myRanking: string[]
  myRatification: boolean | null
}

export function shapeBallot(rows: BallotRow[], viewerId: string): BallotObjective[] {
  const byObjective = new Map<number, BallotObjective>()
  // Collected separately because a row carries at most one place, and the
  // ranking has to come back in place order rather than row order.
  const rankings = new Map<number, { place: number; userId: string }[]>()

  for (const row of rows) {
    let objective = byObjective.get(row.objective_id)
    if (!objective) {
      objective = {
        objectiveId: row.objective_id,
        title: row.title,
        tier: row.tier,
        entrants: [],
        isRatify: false,
        myRanking: [],
        myRatification: row.my_approved,
      }
      byObjective.set(row.objective_id, objective)
      rankings.set(row.objective_id, [])
    }

    if (!objective.entrants.some((e) => e.userId === row.entrant_id)) {
      objective.entrants.push({
        userId: row.entrant_id,
        displayName: row.display_name,
        avatarSeed: parseSeed(row.avatar_seed) ?? seedFromPlayerId(row.entrant_id),
        submissionId: row.submission_id,
        mediaPathname: row.media_pathname,
        mediaType: row.media_type,
        trimStart: row.trim_start,
        trimEnd: row.trim_end,
      })
    }

    if (row.my_place !== null && row.my_ranked_user_id !== null) {
      const list = rankings.get(row.objective_id)!
      if (!list.some((r) => r.userId === row.my_ranked_user_id)) {
        list.push({ place: row.my_place, userId: row.my_ranked_user_id })
      }
    }

    if (row.my_approved !== null) objective.myRatification = row.my_approved
  }

  for (const objective of byObjective.values()) {
    objective.isRatify = isRatifyObjective(objective.entrants.length)
    objective.myRanking = (rankings.get(objective.objectiveId) ?? [])
      .sort((a, b) => a.place - b.place)
      .map((r) => r.userId)
  }

  return [...byObjective.values()]
}

/** Every entrant's proof for a week, plus whatever the viewer has already
 *  voted. Callers MUST have checked the week is in VOTING or CLOSED first —
 *  this returns other players' media pathnames by design. */
export async function getBallot(
  weekId: number,
  viewerId: string,
): Promise<BallotObjective[]> {
  const rows = (await sql`
    SELECT
      o.id AS objective_id, o.title, o.tier,
      s.user_id AS entrant_id, u.display_name, u.avatar_seed,
      s.id AS submission_id, s.media_pathname, s.media_type,
      s.trim_start, s.trim_end,
      v.place AS my_place, v.submission_user_id AS my_ranked_user_id,
      r.approved AS my_approved
    FROM objectives o
    JOIN submissions s ON s.objective_id = o.id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN votes v
      ON v.objective_id = o.id AND v.voter_id = ${viewerId}
      AND v.submission_user_id = s.user_id
    LEFT JOIN ratifications r
      ON r.objective_id = o.id AND r.voter_id = ${viewerId}
    WHERE o.week_id = ${weekId}
    ORDER BY o.id, s.id
  `) as BallotRow[]

  return shapeBallot(rows, viewerId)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, including the 6 new `shapeBallot` tests

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts tests/db/queries.test.ts
git commit -m "feat: add the ballot query"
```

---

### Task 6: The vote API

**Files:**
- Create: `app/api/vote/route.ts`
- Create: `app/api/ratify/route.ts`

**Interfaces:**
- Consumes: `currentPlayer()`; `getCurrentWeek()`; `getBallot()`; `validateBallot`, `isRatifyObjective` from `lib/domain/ballot.ts`; `sql`
- Produces: `POST /api/vote` `{ objectiveId, ranking }`, `POST /api/ratify` `{ objectiveId, approved }`

- [ ] **Step 1: Write the ranked-vote route**

```ts
// File: app/api/vote/route.ts
import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../lib/auth/current-player'
import { sql } from '../../../lib/db/client'
import { getBallot, getCurrentWeek } from '../../../lib/db/queries'
import { isRatifyObjective, validateBallot } from '../../../lib/domain/ballot'

export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const objectiveId = (body as { objectiveId?: unknown } | null)?.objectiveId
  const ranking = (body as { ranking?: unknown } | null)?.ranking

  if (typeof objectiveId !== 'number' || !Number.isInteger(objectiveId)) {
    return NextResponse.json({ error: 'Invalid objective id' }, { status: 400 })
  }
  if (!Array.isArray(ranking) || ranking.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'Invalid ranking' }, { status: 400 })
  }

  const week = await getCurrentWeek(player.id)
  if (!week) {
    return NextResponse.json({ error: 'No active week' }, { status: 400 })
  }
  // Voting is only open in VOTING. Before that the field is hidden; after it
  // the week is settled and a late ballot would change a published result.
  if (week.state !== 'VOTING') {
    return NextResponse.json({ error: 'Voting is not open' }, { status: 403 })
  }
  if (!week.objectives.some((o) => o.id === objectiveId)) {
    return NextResponse.json({ error: 'Objective is not in the current week' }, { status: 400 })
  }

  const ballot = await getBallot(week.id, player.id)
  const objective = ballot.find((o) => o.objectiveId === objectiveId)
  if (!objective) {
    return NextResponse.json({ error: 'Nobody entered that objective' }, { status: 400 })
  }
  if (isRatifyObjective(objective.entrants.length)) {
    return NextResponse.json({ error: 'That objective is ratified, not ranked' }, { status: 400 })
  }

  // Re-checked here rather than trusted from the UI, which only renders the
  // choices it believes are legal.
  const entrantIds = objective.entrants.map((e) => e.userId)
  const check = validateBallot(ranking, entrantIds, player.id)
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 })
  }

  // Replace wholesale: a re-vote must not leave half the old ballot behind.
  await sql`DELETE FROM votes WHERE objective_id = ${objectiveId} AND voter_id = ${player.id}`
  for (const [index, userId] of ranking.entries()) {
    await sql`
      INSERT INTO votes (objective_id, voter_id, submission_user_id, place)
      VALUES (${objectiveId}, ${player.id}, ${userId}, ${index + 1})
    `
  }

  return NextResponse.json({ objectiveId, ranking })
}
```

- [ ] **Step 2: Write the ratify route**

```ts
// File: app/api/ratify/route.ts
import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../lib/auth/current-player'
import { sql } from '../../../lib/db/client'
import { getBallot, getCurrentWeek } from '../../../lib/db/queries'
import { isRatifyObjective } from '../../../lib/domain/ballot'

export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const objectiveId = (body as { objectiveId?: unknown } | null)?.objectiveId
  const approved = (body as { approved?: unknown } | null)?.approved

  if (typeof objectiveId !== 'number' || !Number.isInteger(objectiveId)) {
    return NextResponse.json({ error: 'Invalid objective id' }, { status: 400 })
  }
  if (typeof approved !== 'boolean') {
    return NextResponse.json({ error: 'Invalid answer' }, { status: 400 })
  }

  const week = await getCurrentWeek(player.id)
  if (!week || week.state !== 'VOTING') {
    return NextResponse.json({ error: 'Voting is not open' }, { status: 403 })
  }

  const ballot = await getBallot(week.id, player.id)
  const objective = ballot.find((o) => o.objectiveId === objectiveId)
  if (!objective || !isRatifyObjective(objective.entrants.length)) {
    return NextResponse.json({ error: 'That objective is ranked, not ratified' }, { status: 400 })
  }
  // The lone entrant cannot vouch for themselves; that is the whole point of
  // the ratify vote.
  if (objective.entrants[0].userId === player.id) {
    return NextResponse.json({ error: 'You cannot ratify your own entry' }, { status: 400 })
  }

  await sql`
    INSERT INTO ratifications (objective_id, voter_id, approved)
    VALUES (${objectiveId}, ${player.id}, ${approved})
    ON CONFLICT (objective_id, voter_id) DO UPDATE SET approved = EXCLUDED.approved
  `

  return NextResponse.json({ objectiveId, approved })
}
```

- [ ] **Step 3: Verify both routes reject an unauthenticated caller**

Run `npm run dev`, then:

```bash
for p in vote ratify; do
  printf "%-8s " "$p"
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:3000/api/$p" \
    -H "Content-Type: application/json" -d '{"objectiveId":1}'
done
```

Expected: `401` for both.

- [ ] **Step 4: Commit**

```bash
git add app/api/vote app/api/ratify
git commit -m "feat: add vote and ratify endpoints"
```

---

### Task 7: The vote screen

**Files:**
- Create: `app/vote/page.tsx`
- Create: `components/BallotCard.tsx`
- Create: `components/ProofPlayer.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `getBallot`, `getCurrentWeek`, `currentPlayer`, `medalsFor`, `Avatar`
- Produces: the `/vote` route

- [ ] **Step 1: Write the proof player**

```tsx
// File: components/ProofPlayer.tsx
'use client'

import { useEffect, useRef } from 'react'

/** Plays a submission through the authenticated media route. Video is clamped
 *  to the submitter's trim: the file holds the whole recording, and the trim
 *  is metadata, so the range has to be enforced on playback. */
export function ProofPlayer({
  pathname,
  mediaType,
  trimStart,
  trimEnd,
}: {
  pathname: string
  mediaType: 'photo' | 'video'
  trimStart: number | null
  trimEnd: number | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const src = `/api/media/${pathname}`

  useEffect(() => {
    const video = videoRef.current
    if (!video || mediaType !== 'video' || trimStart === null || trimEnd === null) return

    const onLoaded = () => {
      video.currentTime = trimStart
    }
    const onTime = () => {
      if (video.currentTime >= trimEnd) {
        video.pause()
        video.currentTime = trimStart
      }
    }

    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('timeupdate', onTime)
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('timeupdate', onTime)
    }
  }, [mediaType, trimStart, trimEnd])

  if (mediaType === 'photo') {
    return <img src={src} alt="Proof" className="proof" />
  }

  return <video ref={videoRef} src={src} className="proof" controls playsInline preload="metadata" />
}
```

- [ ] **Step 2: Write the ballot card**

```tsx
// File: components/BallotCard.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from './Avatar'
import { ProofPlayer } from './ProofPlayer'
import { validateBallot } from '../lib/domain/ballot'
import type { BallotObjective } from '../lib/db/queries'

export function BallotCard({
  objective,
  viewerId,
}: {
  objective: BallotObjective
  viewerId: string
}) {
  const router = useRouter()
  const [ranking, setRanking] = useState<string[]>(objective.myRanking)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(objective.myRanking.length > 0)

  const entrantIds = objective.entrants.map((e) => e.userId)
  const check = validateBallot(ranking, entrantIds, viewerId)

  function toggle(userId: string) {
    setSaved(false)
    setRanking((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    )
  }

  async function save() {
    setBusy(true)
    setError(null)

    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectiveId: objective.objectiveId, ranking }),
    }).catch(() => null)

    setBusy(false)
    if (!res?.ok) {
      const body = await res?.json().catch(() => null)
      setError(body?.error ?? 'Could not save that vote.')
      return
    }
    setSaved(true)
    router.refresh()
  }

  async function ratify(approved: boolean) {
    setBusy(true)
    setError(null)

    const res = await fetch('/api/ratify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectiveId: objective.objectiveId, approved }),
    }).catch(() => null)

    setBusy(false)
    if (!res?.ok) {
      const body = await res?.json().catch(() => null)
      setError(body?.error ?? 'Could not save that.')
      return
    }
    setSaved(true)
    router.refresh()
  }

  const lone = objective.entrants[0]

  return (
    <section className="ballot">
      <header>
        <span className={`tier tier-${objective.tier}`}>{objective.tier}</span>
        <h2>{objective.title}</h2>
      </header>

      {objective.isRatify ? (
        <div className="stack">
          <div className="ballot-entry">
            <div className="ballot-who">
              <Avatar seed={lone.avatarSeed} className="roster-face" />
              <b>{lone.displayName}</b>
            </div>
            <ProofPlayer
              pathname={lone.mediaPathname}
              mediaType={lone.mediaType}
              trimStart={lone.trimStart}
              trimEnd={lone.trimEnd}
            />
          </div>

          {lone.userId === viewerId ? (
            <p className="status">Your own entry — the others decide this one.</p>
          ) : (
            <>
              <p className="status">Nobody else entered. Did they actually do it?</p>
              <button className="btn" disabled={busy} onClick={() => ratify(true)}>
                Yes, they did it
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => ratify(false)}>
                No, they did not
              </button>
              {objective.myRatification !== null && (
                <p className="status">
                  You said {objective.myRatification ? 'yes' : 'no'}.
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="stack">
          <p className="status">
            Tap in order — best first. {check.ok ? 'Ready to save.' : check.reason}
          </p>

          {objective.entrants.map((entrant) => {
            const position = ranking.indexOf(entrant.userId)
            const isSelf = entrant.userId === viewerId
            return (
              <div key={entrant.userId} className="ballot-entry">
                <div className="ballot-who">
                  <Avatar seed={entrant.avatarSeed} className="roster-face" />
                  <b>{entrant.displayName}</b>
                  {isSelf && <span className="roster-you"> you</span>}
                </div>
                <ProofPlayer
                  pathname={entrant.mediaPathname}
                  mediaType={entrant.mediaType}
                  trimStart={entrant.trimStart}
                  trimEnd={entrant.trimEnd}
                />
                <button
                  className={`btn${position === -1 ? ' ghost' : ''}`}
                  disabled={busy || isSelf}
                  onClick={() => toggle(entrant.userId)}
                >
                  {isSelf
                    ? 'You cannot rank yourself'
                    : position === -1
                      ? 'Rank this one'
                      : `Ranked #${position + 1} — tap to remove`}
                </button>
              </div>
            )
          })}

          {error && <p className="status admin-error">{error}</p>}
          <button className="btn" disabled={busy || !check.ok} onClick={save}>
            {busy ? 'Saving…' : saved ? 'Saved — change it?' : 'Save this vote'}
          </button>
        </div>
      )}

      {error && objective.isRatify && <p className="status admin-error">{error}</p>}
    </section>
  )
}
```

- [ ] **Step 3: Write the page**

```tsx
// File: app/vote/page.tsx
import { notFound, redirect } from 'next/navigation'
import { currentPlayer } from '../../lib/auth/current-player'
import { getBallot, getCurrentWeek } from '../../lib/db/queries'
import { BallotCard } from '../../components/BallotCard'

export default async function VotePage() {
  const player = await currentPlayer()
  if (!player) notFound()
  if (player.avatarSeed === null) redirect('/welcome')

  const week = await getCurrentWeek(player.id)
  if (!week) notFound()

  if (week.state !== 'VOTING' && week.state !== 'CLOSED') {
    return (
      <main className="screen">
        <header>
          <h1>not yet</h1>
          <p className="sub">
            Voting opens when submissions close. Nobody can see anyone else&apos;s
            proof until then.
          </p>
        </header>
      </main>
    )
  }

  const ballot = await getBallot(week.id, player.id)

  return (
    <main className="screen">
      <header>
        <h1>vote</h1>
        <p className="sub">
          Week {week.number}. {week.state === 'CLOSED' ? 'This week is settled.' : 'Rank the best — you cannot vote for yourself.'}
        </p>
      </header>

      {ballot.length === 0 ? (
        <p className="status">Nobody posted anything this week.</p>
      ) : (
        ballot.map((objective) => (
          <BallotCard key={objective.objectiveId} objective={objective} viewerId={player.id} />
        ))
      )}
    </main>
  )
}
```

- [ ] **Step 4: Add the styles**

Append to `app/globals.css`:

```css
/* --- Ballot -------------------------------------------------------------- */

.ballot {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 2px solid var(--ink);
  border-radius: 16px;
}
.ballot h2 { margin: 6px 0 0; font-size: 26px; letter-spacing: -.02em; }
.ballot-entry { display: flex; flex-direction: column; gap: 10px; }
.ballot-who { display: flex; align-items: center; gap: 10px; font-size: 15px; }
.proof {
  width: 100%;
  border-radius: 12px;
  border: 2px solid var(--ink);
  background: #000;
  display: block;
}
```

- [ ] **Step 5: Link it from the week screen**

In `app/page.tsx`, above the objective list, render a link to `/vote` when `week.state` is `VOTING`:

```tsx
{week.state === 'VOTING' && (
  <a className="btn" href="/vote">Vote now — submissions are closed</a>
)}
```

- [ ] **Step 6: Verify**

Run `npm run build`, `npx tsc --noEmit` and `npm test`. Then start the dev server and confirm `/vote` returns 404 when signed out (it calls `notFound()` for an unauthenticated visitor):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/vote
```

Expected: `404`. Report that the signed-in ballot could not be exercised without a session.

- [ ] **Step 7: Commit**

```bash
git add app/vote components/BallotCard.tsx components/ProofPlayer.tsx app/globals.css app/page.tsx
git commit -m "feat: add the vote screen"
```

---

### Task 8: Standings

**Files:**
- Create: `lib/db/standings.ts`
- Create: `app/leaderboard/page.tsx`
- Test: `tests/db/standings.test.ts`

**Interfaces:**
- Consumes: `scoreObjective`, `scoreRatify` from `lib/domain/scoring.ts`; `sql`; `Tier`
- Produces:
  - `interface Standing { userId: string; displayName: string; avatarSeed: number; points: number; golds: number; silvers: number; bronzes: number }`
  - `function buildStandings(objectives: ScoredObjectiveInput[], players: PlayerRow[]): Standing[]`
  - `async function getStandings(seasonId: number): Promise<Standing[]>`

- [ ] **Step 1: Write the failing test**

```ts
// File: tests/db/standings.test.ts
import { describe, it, expect } from 'vitest'
import { buildStandings } from '../../lib/db/standings'
import { medalsFor } from '../../lib/domain/tiers'

const players = [
  { id: 'alice', display_name: 'Alice', avatar_seed: 1 },
  { id: 'bob', display_name: 'Bob', avatar_seed: 2 },
  { id: 'carol', display_name: 'Carol', avatar_seed: 3 },
]

const hard = medalsFor('hard')

describe('buildStandings', () => {
  it('totals points across objectives', () => {
    const standings = buildStandings(
      [
        {
          tier: 'hard',
          entrantIds: ['alice', 'bob'],
          ballots: [{ voterId: 'carol', ranking: ['alice', 'bob'] }],
          ratifications: [],
        },
        {
          tier: 'hard',
          entrantIds: ['alice', 'bob'],
          ballots: [{ voterId: 'carol', ranking: ['bob', 'alice'] }],
          ratifications: [],
        },
      ],
      players,
    )
    const alice = standings.find((s) => s.userId === 'alice')!
    expect(alice.points).toBe(hard.first + hard.second)
    expect(alice.golds).toBe(1)
    expect(alice.silvers).toBe(1)
  })

  it('orders by points, highest first', () => {
    const standings = buildStandings(
      [
        {
          tier: 'hard',
          entrantIds: ['alice', 'bob'],
          ballots: [{ voterId: 'carol', ranking: ['alice', 'bob'] }],
          ratifications: [],
        },
      ],
      players,
    )
    expect(standings[0].userId).toBe('alice')
  })

  it('includes players who never entered, on zero', () => {
    const standings = buildStandings([], players)
    expect(standings).toHaveLength(3)
    expect(standings.every((s) => s.points === 0)).toBe(true)
  })

  it('scores a ratified single entry', () => {
    const standings = buildStandings(
      [
        {
          tier: 'hard',
          entrantIds: ['alice'],
          ballots: [],
          ratifications: [true, true],
        },
      ],
      players,
    )
    expect(standings.find((s) => s.userId === 'alice')!.points).toBe(hard.first)
  })

  it('counts a shared gold for both players', () => {
    const standings = buildStandings(
      [
        {
          tier: 'hard',
          entrantIds: ['alice', 'bob'],
          ballots: [
            { voterId: 'carol', ranking: ['alice', 'bob'] },
            { voterId: 'dave', ranking: ['bob', 'alice'] },
          ],
          ratifications: [],
        },
      ],
      players,
    )
    expect(standings.find((s) => s.userId === 'alice')!.golds).toBe(1)
    expect(standings.find((s) => s.userId === 'bob')!.golds).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/standings.test.ts`
Expected: FAIL — cannot resolve `../../lib/db/standings`

- [ ] **Step 3: Write the implementation**

```ts
// File: lib/db/standings.ts
import { sql } from './client'
import { parseSeed, seedFromPlayerId } from '../domain/avatar'
import { scoreObjective, scoreRatify, type CastBallot } from '../domain/scoring'
import type { Tier } from '../domain/tiers'

export interface ScoredObjectiveInput {
  tier: Tier
  entrantIds: string[]
  ballots: CastBallot[]
  ratifications: boolean[]
}

export interface PlayerRow {
  id: string
  display_name: string
  avatar_seed: number | null
}

export interface Standing {
  userId: string
  displayName: string
  avatarSeed: number
  points: number
  golds: number
  silvers: number
  bronzes: number
}

/** Recomputed from votes every time rather than stored, so a miscast vote is
 *  fixable without corrupting history. */
export function buildStandings(
  objectives: ScoredObjectiveInput[],
  players: PlayerRow[],
): Standing[] {
  const standings = new Map<string, Standing>(
    players.map((p) => [
      p.id,
      {
        userId: p.id,
        displayName: p.display_name,
        avatarSeed: parseSeed(p.avatar_seed) ?? seedFromPlayerId(p.id),
        points: 0,
        golds: 0,
        silvers: 0,
        bronzes: 0,
      },
    ]),
  )

  for (const objective of objectives) {
    const awards =
      objective.entrantIds.length === 1
        ? scoreRatify(objective.ratifications, objective.entrantIds[0], objective.tier)
        : scoreObjective(objective.ballots, objective.entrantIds, objective.tier)

    for (const award of awards) {
      const standing = standings.get(award.userId)
      if (!standing) continue
      standing.points += award.points
      if (award.place === 1) standing.golds += 1
      if (award.place === 2) standing.silvers += 1
      if (award.place === 3) standing.bronzes += 1
    }
  }

  return [...standings.values()].sort(
    (a, b) => b.points - a.points || b.golds - a.golds || a.displayName.localeCompare(b.displayName),
  )
}

/** Only weeks that have actually finished voting count toward the table — a
 *  week still being voted on would make the standings jump around mid-ballot. */
export async function getStandings(seasonId: number, now: Date = new Date()): Promise<Standing[]> {
  const players = (await sql`
    SELECT id, display_name, avatar_seed FROM users
  `) as PlayerRow[]

  const rows = (await sql`
    SELECT o.id AS objective_id, o.tier,
           s.user_id AS entrant_id,
           v.voter_id, v.submission_user_id, v.place,
           r.approved
    FROM objectives o
    JOIN weeks w ON w.id = o.week_id AND w.season_id = ${seasonId}
    JOIN submissions s ON s.objective_id = o.id
    LEFT JOIN votes v ON v.objective_id = o.id
    LEFT JOIN ratifications r ON r.objective_id = o.id
    WHERE w.forced_state = 'CLOSED' OR w.voting_closes_at <= ${now}
  `) as {
    objective_id: number
    tier: Tier
    entrant_id: string
    voter_id: string | null
    submission_user_id: string | null
    place: number | null
    approved: boolean | null
  }[]

  const byObjective = new Map<number, ScoredObjectiveInput>()
  const ballotsByObjective = new Map<number, Map<string, { place: number; userId: string }[]>>()
  const seenRatification = new Map<number, Set<string>>()

  for (const row of rows) {
    if (!byObjective.has(row.objective_id)) {
      byObjective.set(row.objective_id, {
        tier: row.tier,
        entrantIds: [],
        ballots: [],
        ratifications: [],
      })
      ballotsByObjective.set(row.objective_id, new Map())
      seenRatification.set(row.objective_id, new Set())
    }
    const objective = byObjective.get(row.objective_id)!

    if (!objective.entrantIds.includes(row.entrant_id)) {
      objective.entrantIds.push(row.entrant_id)
    }

    if (row.voter_id && row.submission_user_id && row.place !== null) {
      const voters = ballotsByObjective.get(row.objective_id)!
      const list = voters.get(row.voter_id) ?? []
      if (!list.some((entry) => entry.userId === row.submission_user_id)) {
        list.push({ place: row.place, userId: row.submission_user_id })
      }
      voters.set(row.voter_id, list)
    }

    // The join multiplies rows, so each voter's ratification is counted once.
    if (row.approved !== null && row.voter_id) {
      const seen = seenRatification.get(row.objective_id)!
      if (!seen.has(row.voter_id)) {
        seen.add(row.voter_id)
        objective.ratifications.push(row.approved)
      }
    }
  }

  for (const [objectiveId, objective] of byObjective) {
    const voters = ballotsByObjective.get(objectiveId)!
    objective.ballots = [...voters.entries()].map(([voterId, entries]) => ({
      voterId,
      ranking: entries.sort((a, b) => a.place - b.place).map((e) => e.userId),
    }))
  }

  return buildStandings([...byObjective.values()], players)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/standings.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Write the leaderboard page**

```tsx
// File: app/leaderboard/page.tsx
import { notFound, redirect } from 'next/navigation'
import { currentPlayer } from '../../lib/auth/current-player'
import { sql } from '../../lib/db/client'
import { getStandings } from '../../lib/db/standings'
import { Avatar } from '../../components/Avatar'

export default async function LeaderboardPage() {
  const player = await currentPlayer()
  if (!player) notFound()
  if (player.avatarSeed === null) redirect('/welcome')

  const [season] = (await sql`
    SELECT id, name FROM seasons WHERE is_active LIMIT 1
  `) as { id: number; name: string }[]

  if (!season) notFound()

  const standings = await getStandings(season.id)

  return (
    <main className="screen">
      <header>
        <h1>standings</h1>
        <p className="sub">{season.name} — only weeks that have finished voting count.</p>
      </header>

      <ol className="standings">
        {standings.map((standing, index) => (
          <li key={standing.userId} className={standing.userId === player.id ? 'is-you' : undefined}>
            <span className="standings-rank">{index + 1}</span>
            <Avatar seed={standing.avatarSeed} className="roster-face" />
            <span className="standings-name">{standing.displayName}</span>
            <span className="standings-medals">
              {standing.golds}🥇 {standing.silvers}🥈 {standing.bronzes}🥉
            </span>
            <b className="standings-points">{standing.points}</b>
          </li>
        ))}
      </ol>
    </main>
  )
}
```

- [ ] **Step 6: Add the styles**

Append to `app/globals.css`:

```css
/* --- Standings ----------------------------------------------------------- */

.standings { margin: 0; padding: 0; list-style: none; }
.standings li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 6px;
  border-bottom: 1px solid rgba(0, 0, 0, .18);
}
.standings li.is-you { font-weight: 700; }
.standings-rank { width: 22px; font-weight: 800; opacity: .55; }
.standings-name { flex: 1; font-weight: 600; }
.standings-medals { font-size: 13px; opacity: .75; white-space: nowrap; }
.standings-points { font-size: 18px; min-width: 44px; text-align: right; }
```

- [ ] **Step 7: Link it from the week screen**

In `app/page.tsx`, below the objective list, add:

```tsx
<a className="btn ghost" href="/leaderboard">Standings</a>
```

- [ ] **Step 8: Verify and commit**

Run `npm test`, `npm run build`, `npx tsc --noEmit`. Then move `.env.development.local` and `.env.local` aside, run `npm test` again, confirm it still passes, and restore them.

```bash
git add lib/db/standings.ts app/leaderboard tests/db/standings.test.ts app/globals.css app/page.tsx
git commit -m "feat: add season standings"
```

---

### Task 9: Show the admin how far voting has got

The roadmap calls finishing the ballot the top risk in the design, and nothing
so far measures it. This is the cheapest thing that turns that risk from a
hunch into a number.

**Files:**
- Modify: `app/admin/page.tsx`
- Create: `lib/db/turnout.ts`
- Test: `tests/db/turnout.test.ts`

**Interfaces:**
- Consumes: `sql`
- Produces:
  - `interface Turnout { objectiveId: number; title: string; entrants: number; voters: number; eligible: number }`
  - `function shapeTurnout(rows: TurnoutRow[]): Turnout[]`
  - `async function getTurnout(weekId: number): Promise<Turnout[]>`

- [ ] **Step 1: Write the failing test**

```ts
// File: tests/db/turnout.test.ts
import { describe, it, expect } from 'vitest'
import { shapeTurnout, type TurnoutRow } from '../../lib/db/turnout'

const rows: TurnoutRow[] = [
  { objective_id: 1, title: 'Fridge', entrants: 3, voters: 5, eligible: 16 },
  { objective_id: 2, title: 'Handstand', entrants: 1, voters: 0, eligible: 16 },
]

describe('shapeTurnout', () => {
  it('reports voters against eligible players per objective', () => {
    const turnout = shapeTurnout(rows)
    expect(turnout[0]).toEqual({
      objectiveId: 1, title: 'Fridge', entrants: 3, voters: 5, eligible: 16,
    })
  })

  it('handles an objective nobody has voted on yet', () => {
    expect(shapeTurnout(rows)[1].voters).toBe(0)
  })

  it('handles a week with no objectives', () => {
    expect(shapeTurnout([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/turnout.test.ts`
Expected: FAIL — cannot resolve `../../lib/db/turnout`

- [ ] **Step 3: Write the implementation**

```ts
// File: lib/db/turnout.ts
import { sql } from './client'

export interface TurnoutRow {
  objective_id: number
  title: string
  entrants: number
  voters: number
  eligible: number
}

export interface Turnout {
  objectiveId: number
  title: string
  entrants: number
  /** Distinct players who have cast any ballot on this objective. */
  voters: number
  eligible: number
}

export function shapeTurnout(rows: TurnoutRow[]): Turnout[] {
  return rows.map((row) => ({
    objectiveId: row.objective_id,
    title: row.title,
    entrants: Number(row.entrants),
    voters: Number(row.voters),
    eligible: Number(row.eligible),
  }))
}

/** Counted with subqueries rather than joins: joining votes and submissions
 *  together multiplies rows and would inflate both counts. */
export async function getTurnout(weekId: number): Promise<Turnout[]> {
  const rows = (await sql`
    SELECT
      o.id AS objective_id,
      o.title,
      (SELECT count(*) FROM submissions s WHERE s.objective_id = o.id) AS entrants,
      (SELECT count(DISTINCT voter_id) FROM (
         SELECT voter_id FROM votes WHERE objective_id = o.id
         UNION
         SELECT voter_id FROM ratifications WHERE objective_id = o.id
       ) AS cast_by) AS voters,
      (SELECT count(*) FROM users) AS eligible
    FROM objectives o
    WHERE o.week_id = ${weekId}
    ORDER BY o.id
  `) as TurnoutRow[]

  return shapeTurnout(rows)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/turnout.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Show it on the admin page**

In `app/admin/page.tsx`, below the state controls, add:

```tsx
{turnout.length > 0 && (
  <section className="admin-state">
    <p className="roster-head">Voting so far</p>
    <ul className="turnout">
      {turnout.map((t) => (
        <li key={t.objectiveId}>
          <span>{t.title}</span>
          <b>{t.voters}/{t.eligible}</b>
        </li>
      ))}
    </ul>
  </section>
)}
```

with `const turnout = await getTurnout(week.id)` above the return, and this CSS
appended to `app/globals.css`:

```css
.turnout { margin: 8px 0 0; padding: 0; list-style: none; }
.turnout li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0, 0, 0, .18);
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/db/turnout.ts tests/db/turnout.test.ts app/admin/page.tsx app/globals.css
git commit -m "feat: show ballot turnout on the admin screen"
```

---

### Task 10: End-to-end proof that voting works

Nothing so far has exercised a real ballot against a real database. This task does, and it is the one that decides whether Phase 2 actually works.

**Files:**
- Create: `tests/integration/voting.test.ts`

**Interfaces:**
- Consumes: everything above

- [ ] **Step 1: Write the integration test**

```ts
// File: tests/integration/voting.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from '../../lib/db/client'
import { getStandings } from '../../lib/db/standings'
import { medalsFor } from '../../lib/domain/tiers'

describe.skipIf(!process.env.DATABASE_URL)('voting end to end (integration)', () => {
  const A = 'itest_vote_a'
  const B = 'itest_vote_b'
  const C = 'itest_vote_c'
  let objectiveId = 0
  let seasonId = 0
  let tier: 'easy' | 'hard' | 'unhinged' = 'hard'

  beforeAll(async () => {
    const [objective] = (await sql`
      SELECT o.id, o.tier, w.season_id
      FROM objectives o JOIN weeks w ON w.id = o.week_id
      ORDER BY o.id LIMIT 1
    `) as { id: number; tier: typeof tier; season_id: number }[]
    objectiveId = objective.id
    seasonId = objective.season_id
    tier = objective.tier

    await sql`
      INSERT INTO users (id, display_name)
      VALUES (${A}, 'Vote A'), (${B}, 'Vote B'), (${C}, 'Vote C')
      ON CONFLICT (id) DO NOTHING
    `
    for (const user of [A, B]) {
      await sql`
        INSERT INTO submissions (objective_id, user_id, media_url, media_pathname, media_type)
        VALUES (${objectiveId}, ${user}, 'https://itest.invalid/x', ${'p/' + user}, 'photo')
        ON CONFLICT (objective_id, user_id) DO NOTHING
      `
    }
    // C ranks A above B.
    await sql`DELETE FROM votes WHERE voter_id = ${C} AND objective_id = ${objectiveId}`
    await sql`
      INSERT INTO votes (objective_id, voter_id, submission_user_id, place)
      VALUES (${objectiveId}, ${C}, ${A}, 1), (${objectiveId}, ${C}, ${B}, 2)
    `
    // Force the week closed so it counts toward standings.
    await sql`
      UPDATE weeks SET forced_state = 'CLOSED'
      WHERE id = (SELECT week_id FROM objectives WHERE id = ${objectiveId})
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM votes WHERE voter_id IN (${A}, ${B}, ${C})`.catch(() => {})
    await sql`DELETE FROM submissions WHERE user_id IN (${A}, ${B}, ${C})`.catch(() => {})
    await sql`DELETE FROM users WHERE id IN (${A}, ${B}, ${C})`.catch(() => {})
    await sql`
      UPDATE weeks SET forced_state = NULL
      WHERE id = (SELECT week_id FROM objectives WHERE id = ${objectiveId})
    `.catch(() => {})
  })

  it('turns real votes into real points', async () => {
    const standings = await getStandings(seasonId)
    const a = standings.find((s) => s.userId === A)!
    const b = standings.find((s) => s.userId === B)!

    expect(a.points).toBeGreaterThanOrEqual(medalsFor(tier).first)
    expect(a.golds).toBe(1)
    expect(b.silvers).toBe(1)
    expect(a.points).toBeGreaterThan(b.points)
  })

  it('refuses a self-vote at the database level', async () => {
    await expect(
      sql`
        INSERT INTO votes (objective_id, voter_id, submission_user_id, place)
        VALUES (${objectiveId}, ${A}, ${A}, 1)
      `,
    ).rejects.toThrow()
  })

  it('refuses two players in the same place', async () => {
    await expect(
      sql`
        INSERT INTO votes (objective_id, voter_id, submission_user_id, place)
        VALUES (${objectiveId}, ${C}, ${B}, 1)
      `,
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run it**

Run: `npm run test:integration`
Expected: PASS. **If it fails, that is a finding about the application, not the test — report BLOCKED with the output rather than adjusting the test to pass.**

- [ ] **Step 3: Prove the test has teeth**

Temporarily change `scoreObjective` so every award gets `place: null`, run the integration test, and confirm the first case fails. Restore it and confirm it passes. Report both outputs.

- [ ] **Step 4: Confirm the whole suite still runs without secrets**

```bash
mkdir -p /tmp/envhide && mv .env.development.local .env.local /tmp/envhide/
npm test
mv /tmp/envhide/.env.development.local /tmp/envhide/.env.local .
```

Expected: all unit tests pass, integration tests skipped.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/voting.test.ts
git commit -m "test: prove votes become points against a real database"
```

---

### Task 11: Ship it

**Files:**
- Modify: `public/sw.js`, `docs/ROADMAP.md`

- [ ] **Step 1: Bump the service worker cache**

The shell changed. Increment `const CACHE = 'brat-vN'` to the next number in `public/sw.js`, then `node --check public/sw.js`.

- [ ] **Step 2: Update the roadmap**

Mark the Phase 2 items complete in `docs/ROADMAP.md`, and move the two prerequisites that are now done — the authenticated media route, and not treating `access: 'private'` as the reveal gate — out of the prerequisites list.

- [ ] **Step 3: Deploy**

```bash
npm test && npm run build && vercel deploy --prod --yes
```

- [ ] **Step 4: Verify the guards in production**

```bash
for p in /vote /leaderboard; do
  printf "%-14s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "https://brats.anico.dev$p"
done
printf "%-14s " "vote api"; curl -s -o /dev/null -w "%{http_code}\n" -X POST https://brats.anico.dev/api/vote -H "Content-Type: application/json" -d '{"objectiveId":1,"ranking":[]}'
printf "%-14s " "media api"; curl -s -o /dev/null -w "%{http_code}\n" https://brats.anico.dev/api/media/submissions/1/x/y.mp4
```

Expected: `404` for the pages signed out, `401` for both APIs.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js docs/ROADMAP.md
git commit -m "chore: ship Phase 2"
```

---

## Phase 2 done when

- A player can watch everyone's proof once submissions close, and **cannot** stream it before
- Ranked ballots save, with self-voting refused by the domain, the route and the database
- Single-entrant objectives ratify instead of ranking
- Points and a medal table come out of real votes, recomputed rather than stored
- The unit suite runs with no environment at all

## Deliberately not in Phase 2

Reactions, push notifications, the archive feed and the profile page are Phase 3.
Objective editing from the admin screen stays out until draft day produces real
objectives worth editing.

## Known risks

**Voting load is still the top risk in the design.** With 16 players an objective
can have 16 entrants, and ranking three of them means watching a lot of video.
Phase 2 ships as designed so it can be measured; the two fixes held in reserve
are voting on a random subset, or splitting into two divisions of eight.

**`getStandings` recomputes everything on every page load.** Correct, and fine at
8 weeks × 3 objectives × 16 players. It is not fine at ten seasons; when that
matters, materialise per-week results at close rather than caching the query.
