# Phase 1: The Posting Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-in player can see this week's three objectives, record photo or video proof in-app, trim it, and submit it — with all submissions hidden from everyone else until the submission window closes.

**Architecture:** Next.js App Router on Vercel. All game rules live in `lib/domain/` as pure functions with no I/O, unit-tested with vitest; the database layer, API routes and React components are thin shells that call into them. This keeps the rules — which are the part most likely to change and most expensive to get wrong — fast to test and easy to reason about. Media is captured in-browser via `MediaRecorder`, uploaded to Vercel Blob, and trimmed non-destructively by storing start/end offsets rather than cutting files.

**Tech Stack:** Next.js (App Router, TypeScript), Neon Postgres via `@neondatabase/serverless`, Clerk auth via `@clerk/nextjs`, Vercel Blob via `@vercel/blob`, vitest for tests.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-09-06-brat-olympics-design.md` — the authority on all rules. Where this plan and the spec disagree, the spec wins.
- **Recording cap:** 60 seconds. **Trim cap:** 15 seconds. Both enforced server-side, not just in the UI.
- **No self-voting** is a Phase 2 concern, but the `users` table must carry stable identity now for it to be enforceable later.
- **Submissions are hidden** from other players until the submission window closes. This must be enforced in the query layer, never only in the UI.
- **Medal values are fixed by tier** and must come from `lib/domain/tiers.ts` — never hardcoded in components.
- **Preserve the existing PWA install behaviour**: `manifest.webmanifest`, the service worker, the `brat` green (`#8ACE00`), and the iOS meta tags. The app is currently installed on phones at `brats.anico.dev`; breaking the manifest breaks those installs.
- **Never commit secrets.** `.env*.local` is already gitignored.
- **Blob store is PRIVATE.** Media is never publicly reachable by URL; it is read back
  server-side with `get(pathname, { access: 'private' })` behind a Clerk auth check.
  Therefore every submission must persist its blob **pathname**, not only its URL —
  the URL alone cannot retrieve a private blob. Phase 1 never plays back stored media
  (only local pre-upload previews), so the authenticated streaming route is Phase 2 work.
- Team/scale assumptions: 16 players, 3 objectives per week, 8-week season.

---

### Task 1: Scaffold the Next.js app without breaking the installed PWA

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `public/manifest.webmanifest`, `public/sw.js`, `public/icons/*`
- Delete: `index.html`, `about.html`, `counter.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icons/`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a running Next.js app; `npm test` runs vitest; PWA assets served from `public/`

- [ ] **Step 1: Scaffold Next.js in a temp dir and move it in**

The project root already has files, so `create-next-app` cannot target it directly.

```bash
cd /Users/nicothegreat/Workspace/claude-access/brat-app
npx create-next-app@latest .tmp-scaffold --typescript --app --no-tailwind --no-src-dir --no-eslint --use-npm --yes
cp -r .tmp-scaffold/app .tmp-scaffold/package.json .tmp-scaffold/tsconfig.json .tmp-scaffold/next.config.ts .
cp .tmp-scaffold/.gitignore .gitignore.next
rm -rf .tmp-scaffold
```

- [ ] **Step 2: Move PWA assets into `public/` and delete the static shell**

Next.js serves static files from `public/`. The manifest and service worker must stay at the same URLs or installed apps break.

```bash
mkdir -p public
git mv manifest.webmanifest public/manifest.webmanifest
git mv sw.js public/sw.js
git mv icons public/icons
git rm -q index.html about.html counter.html app.js style.css
```

- [ ] **Step 3: Verify the PWA URLs are unchanged**

Run: `npx next dev` then in another shell:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/manifest.webmanifest
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/sw.js
```

Expected: `200 application/manifest+json` and `200 text/javascript`. If the manifest returns `application/json`, add the mapping in Step 4.

- [ ] **Step 4: Write the root layout with the PWA meta tags preserved**

```tsx
// File: app/layout.tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Brats',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Brats', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/icon-180.png' },
}

export const viewport: Viewport = {
  themeColor: '#8ACE00',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 5: Port the existing styles into `app/globals.css`**

Copy the contents of the deleted `style.css` (recoverable via `git show HEAD:style.css`) into `app/globals.css`. Keep the `--bg: #8ACE00` and `--ink: #0b0b0b` custom properties, the safe-area padding on `.screen`, and the `.btn` styles. These are already tuned for iOS standalone mode.

- [ ] **Step 6: Install and configure vitest**

```bash
npm install -D vitest
```

```ts
// File: vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 7: Verify the app builds and tests run**

Run: `npm run build && npm test`
Expected: build succeeds; vitest reports "No test files found" and exits 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app, preserving PWA assets"
```

---

### Task 2: Domain — tiers and medal values

**Files:**
- Create: `lib/domain/tiers.ts`
- Test: `tests/domain/tiers.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Tier = 'easy' | 'hard' | 'unhinged'`
  - `interface MedalValues { first: number; second: number; third: number; effort: number }`
  - `const MEDALS: Record<Tier, MedalValues>`
  - `function medalsFor(tier: Tier): MedalValues`

- [ ] **Step 1: Write the failing test**

```ts
// File: tests/domain/tiers.test.ts
import { describe, it, expect } from 'vitest'
import { MEDALS, medalsFor } from '../../lib/domain/tiers'

describe('tiers', () => {
  it('matches the point table in the spec', () => {
    expect(MEDALS.easy).toEqual({ first: 15, second: 10, third: 5, effort: 2 })
    expect(MEDALS.hard).toEqual({ first: 30, second: 20, third: 10, effort: 3 })
    expect(MEDALS.unhinged).toEqual({ first: 50, second: 35, third: 20, effort: 5 })
  })

  it('returns medal values for a tier', () => {
    expect(medalsFor('hard').first).toBe(30)
  })

  it('makes a full week of effort points worth less than a single gold, so farming never competes', () => {
    // A week is exactly one objective of each tier, so this is the most a
    // player can earn by entering everything and medalling in nothing.
    const weekOfPureEffort = MEDALS.easy.effort + MEDALS.hard.effort + MEDALS.unhinged.effort
    const cheapestGold = Math.min(MEDALS.easy.first, MEDALS.hard.first, MEDALS.unhinged.first)
    expect(weekOfPureEffort).toBeLessThan(cheapestGold)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/tiers.test.ts`
Expected: FAIL — cannot resolve `../../lib/domain/tiers`

- [ ] **Step 3: Write minimal implementation**

```ts
// File: lib/domain/tiers.ts

/** Objective difficulty. Fixes the medal values so per-objective point
 *  values never have to be argued about individually. */
export type Tier = 'easy' | 'hard' | 'unhinged'

export interface MedalValues {
  first: number
  second: number
  third: number
  /** Awarded to every entrant who did not medal. */
  effort: number
}

/** Point table from the design spec. Effort is deliberately ~1/10th of gold:
 *  posting garbage on every objective must never beat genuinely trying once. */
export const MEDALS: Record<Tier, MedalValues> = {
  easy: { first: 15, second: 10, third: 5, effort: 2 },
  hard: { first: 30, second: 20, third: 10, effort: 3 },
  unhinged: { first: 50, second: 35, third: 20, effort: 5 },
}

export function medalsFor(tier: Tier): MedalValues {
  return MEDALS[tier]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/tiers.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add lib/domain/tiers.ts tests/domain/tiers.test.ts
git commit -m "feat: add tier medal values"
```

---

### Task 3: Domain — week state machine

**Files:**
- Create: `lib/domain/week-state.ts`
- Test: `tests/domain/week-state.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type WeekState = 'PENDING' | 'SUBMITTING' | 'VOTING' | 'CLOSED'`
  - `interface WeekWindows { dropsAt: Date; submissionsCloseAt: Date; votingClosesAt: Date }`
  - `function weekState(windows: WeekWindows, now: Date): WeekState`

**Note on naming:** the spec writes the first state as `DROPPED`. That name describes the *event*, not the window that follows it. Here the window before the drop is `PENDING` and the window after it is `SUBMITTING`. Update the spec to match after this task so the two documents agree.

- [ ] **Step 1: Write the failing test**

```ts
// File: tests/domain/week-state.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/week-state.test.ts`
Expected: FAIL — cannot resolve `../../lib/domain/week-state`

- [ ] **Step 3: Write minimal implementation**

```ts
// File: lib/domain/week-state.ts

/** Lifecycle of a single week.
 *  PENDING   — objectives not yet revealed
 *  SUBMITTING— objectives visible, proof accepted, everything hidden from others
 *  VOTING    — submissions revealed, ranked ballots accepted, no new proof
 *  CLOSED    — scored and final */
export type WeekState = 'PENDING' | 'SUBMITTING' | 'VOTING' | 'CLOSED'

export interface WeekWindows {
  dropsAt: Date
  submissionsCloseAt: Date
  votingClosesAt: Date
}

/** Boundaries are half-open: a window starts at its instant and ends just
 *  before the next. Submissions therefore always close before voting opens,
 *  which is what stops late submitters from seeing the field first. */
export function weekState(windows: WeekWindows, now: Date): WeekState {
  const { dropsAt, submissionsCloseAt, votingClosesAt } = windows

  if (!(dropsAt < submissionsCloseAt && submissionsCloseAt < votingClosesAt)) {
    throw new Error(
      'Week windows out of order: expected dropsAt < submissionsCloseAt < votingClosesAt',
    )
  }

  if (now < dropsAt) return 'PENDING'
  if (now < submissionsCloseAt) return 'SUBMITTING'
  if (now < votingClosesAt) return 'VOTING'
  return 'CLOSED'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/week-state.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add lib/domain/week-state.ts tests/domain/week-state.test.ts
git commit -m "feat: add week state machine"
```

---

### Task 4: Domain — submission eligibility and reveal visibility

**Files:**
- Create: `lib/domain/submission-rules.ts`
- Test: `tests/domain/submission-rules.test.ts`

**Interfaces:**
- Consumes: `WeekState` from `lib/domain/week-state.ts`
- Produces:
  - `function canSubmit(state: WeekState): boolean`
  - `function canViewSubmission(state: WeekState, submissionUserId: string, viewerId: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// File: tests/domain/submission-rules.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/submission-rules.test.ts`
Expected: FAIL — cannot resolve `../../lib/domain/submission-rules`

- [ ] **Step 3: Write minimal implementation**

```ts
// File: lib/domain/submission-rules.ts
import type { WeekState } from './week-state'

/** Proof is only accepted while the submission window is open. */
export function canSubmit(state: WeekState): boolean {
  return state === 'SUBMITTING'
}

/** Submissions stay hidden from other players until the submission window
 *  closes. This is what makes reveal a synchronised event and stops players
 *  copying or one-upping each other mid-week.
 *
 *  You can always see your own proof once the week has dropped, so you can
 *  check what you posted. */
export function canViewSubmission(
  state: WeekState,
  submissionUserId: string,
  viewerId: string,
): boolean {
  if (state === 'PENDING') return false
  if (submissionUserId === viewerId) return true
  return state === 'VOTING' || state === 'CLOSED'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/submission-rules.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add lib/domain/submission-rules.ts tests/domain/submission-rules.test.ts
git commit -m "feat: add submission eligibility and reveal visibility rules"
```

---

### Task 5: Domain — trim validation

**Files:**
- Create: `lib/domain/trim.ts`
- Test: `tests/domain/trim.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `const MAX_RECORDING_SECONDS = 60`
  - `const MAX_TRIM_SECONDS = 15`
  - `type TrimResult = { ok: true } | { ok: false; reason: string }`
  - `function validateTrim(startSeconds: number, endSeconds: number, durationSeconds: number): TrimResult`

- [ ] **Step 1: Write the failing test**

```ts
// File: tests/domain/trim.test.ts
import { describe, it, expect } from 'vitest'
import { validateTrim, MAX_RECORDING_SECONDS, MAX_TRIM_SECONDS } from '../../lib/domain/trim'

describe('validateTrim', () => {
  it('accepts a trim inside both caps', () => {
    expect(validateTrim(5, 15, 60)).toEqual({ ok: true })
  })

  it('accepts a trim of exactly the maximum length', () => {
    expect(validateTrim(0, MAX_TRIM_SECONDS, 60)).toEqual({ ok: true })
  })

  it('rejects a trim longer than the 15s cap, which is what bounds voting time', () => {
    const result = validateTrim(0, 16, 60)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/15/)
  })

  it('rejects a recording longer than the 60s cap', () => {
    const result = validateTrim(0, 10, MAX_RECORDING_SECONDS + 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/60/)
  })

  it('rejects a trim that ends past the end of the recording', () => {
    const result = validateTrim(5, 30, 20)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/recording/i)
  })

  it('rejects a zero-length trim', () => {
    expect(validateTrim(5, 5, 60).ok).toBe(false)
  })

  it('rejects a backwards trim', () => {
    expect(validateTrim(10, 5, 60).ok).toBe(false)
  })

  it('rejects a negative start', () => {
    expect(validateTrim(-1, 5, 60).ok).toBe(false)
  })

  it('rejects non-finite input rather than trusting the client', () => {
    expect(validateTrim(NaN, 5, 60).ok).toBe(false)
    expect(validateTrim(0, Infinity, 60).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/trim.test.ts`
Expected: FAIL — cannot resolve `../../lib/domain/trim`

- [ ] **Step 3: Write minimal implementation**

```ts
// File: lib/domain/trim.ts

/** Recording length drives file size and upload reliability. */
export const MAX_RECORDING_SECONDS = 60

/** Trim length drives *viewing* time, which is the real constraint: with 16
 *  entrants, 60s clips would be 16 minutes to review a single objective.
 *  Capping the visible range at 15s keeps a week's voting near 15 minutes. */
export const MAX_TRIM_SECONDS = 15

export type TrimResult = { ok: true } | { ok: false; reason: string }

/** Trims are non-destructive: these offsets are stored as metadata and the
 *  player plays only that range. The file itself is never cut, which avoids
 *  transcoding entirely and keeps the full recording available. */
export function validateTrim(
  startSeconds: number,
  endSeconds: number,
  durationSeconds: number,
): TrimResult {
  for (const [name, value] of [
    ['start', startSeconds],
    ['end', endSeconds],
    ['duration', durationSeconds],
  ] as const) {
    if (!Number.isFinite(value)) {
      return { ok: false, reason: `Trim ${name} must be a finite number` }
    }
  }

  if (durationSeconds > MAX_RECORDING_SECONDS) {
    return { ok: false, reason: `Recording must be ${MAX_RECORDING_SECONDS}s or shorter` }
  }
  if (startSeconds < 0) {
    return { ok: false, reason: 'Trim start must not be negative' }
  }
  if (endSeconds <= startSeconds) {
    return { ok: false, reason: 'Trim end must come after trim start' }
  }
  if (endSeconds > durationSeconds) {
    return { ok: false, reason: 'Trim end must not run past the end of the recording' }
  }
  if (endSeconds - startSeconds > MAX_TRIM_SECONDS) {
    return { ok: false, reason: `Trimmed clip must be ${MAX_TRIM_SECONDS}s or shorter` }
  }

  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/trim.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add lib/domain/trim.ts tests/domain/trim.test.ts
git commit -m "feat: add trim validation"
```

---

### Task 6: Provision Neon and create the schema

**Files:**
- Create: `db/schema.sql`, `db/seed.sql`
- Create: `lib/db/client.ts`
- Modify: `package.json` (add `@neondatabase/serverless`)

**Interfaces:**
- Consumes: nothing
- Produces: `const sql` exported from `lib/db/client.ts`, a tagged-template query function

- [ ] **Step 1: Provision Neon through the Vercel Marketplace**

```bash
vercel integration add neon --yes --no-claim
```

**If the CLI hands off to the dashboard or browser, STOP and ask the user to complete it there, then continue.** Neon is a connectable integration and the CLI cannot drive the auth handshake.

- [ ] **Step 2: Pull the environment variables and install the driver**

```bash
vercel env pull .env.development.local --yes
npm install @neondatabase/serverless
```

Verify `DATABASE_URL` is present without printing its value:

```bash
grep -c '^DATABASE_URL=' .env.development.local
```

Expected: `1`

- [ ] **Step 3: Write the schema**

```sql
-- File: db/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,          -- Clerk user id
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seasons (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS weeks (
  id                   SERIAL PRIMARY KEY,
  season_id            INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  number               INTEGER NOT NULL,
  drops_at             TIMESTAMPTZ NOT NULL,
  submissions_close_at TIMESTAMPTZ NOT NULL,
  voting_closes_at     TIMESTAMPTZ NOT NULL,
  UNIQUE (season_id, number),
  -- The rule that stops voting from overlapping submitting, enforced by the
  -- database so a bad seed can never create an unfair week.
  CHECK (drops_at < submissions_close_at AND submissions_close_at < voting_closes_at)
);

CREATE TABLE IF NOT EXISTS objectives (
  id          SERIAL PRIMARY KEY,
  week_id     INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tier        TEXT NOT NULL CHECK (tier IN ('easy', 'hard', 'unhinged'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id           SERIAL PRIMARY KEY,
  objective_id INTEGER NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url    TEXT NOT NULL,
  media_type   TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  duration_seconds  REAL,
  trim_start        REAL,
  trim_end          REAL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One entry per player per objective; re-submitting replaces.
  UNIQUE (objective_id, user_id),
  -- Photos carry no trim; videos must carry a complete, ordered one.
  CHECK (
    (media_type = 'photo' AND trim_start IS NULL AND trim_end IS NULL)
    OR
    (media_type = 'video' AND trim_start IS NOT NULL AND trim_end IS NOT NULL
     AND trim_start >= 0 AND trim_end > trim_start
     AND trim_end - trim_start <= 15
     AND duration_seconds IS NOT NULL AND duration_seconds <= 60
     -- Mirrors validateTrim's "trim end must not run past the end of the
     -- recording". Without this the database is looser than the domain rule.
     AND trim_end <= duration_seconds)
  )
);

CREATE INDEX IF NOT EXISTS submissions_objective_idx ON submissions(objective_id);
CREATE INDEX IF NOT EXISTS objectives_week_idx ON objectives(week_id);
```

- [ ] **Step 4: Write a seed for local development**

Real objectives come from draft day (Phase 0). This seed exists only so the app has something to render.

```sql
-- File: db/seed.sql

INSERT INTO seasons (name, is_active) VALUES ('Season 1', true)
ON CONFLICT DO NOTHING;

INSERT INTO weeks (season_id, number, drops_at, submissions_close_at, voting_closes_at)
VALUES (
  (SELECT id FROM seasons WHERE is_active LIMIT 1),
  1,
  now() - interval '1 day',
  now() + interval '5 days',
  now() + interval '6 days'
)
ON CONFLICT (season_id, number) DO NOTHING;

INSERT INTO objectives (week_id, title, description, tier)
SELECT w.id, o.title, o.description, o.tier
FROM weeks w,
  (VALUES
    ('Jump in a bush', 'Fully airborne. Fully in the bush.', 'easy'),
    ('Tag Mikey', 'Find him. Tag him. Get it on camera.', 'hard'),
    ('Shoey', 'You know what you did.', 'unhinged')
  ) AS o(title, description, tier)
WHERE w.number = 1
ON CONFLICT DO NOTHING;
```

- [ ] **Step 5: Apply the schema and seed**

```bash
node --env-file=.env.development.local -e "
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
(async () => {
  const sql = neon(process.env.DATABASE_URL);
  for (const f of ['db/schema.sql', 'db/seed.sql']) {
    await sql.query(fs.readFileSync(f, 'utf8'));
    console.log('applied', f);
  }
})();
"
```

Expected: `applied db/schema.sql` then `applied db/seed.sql`

- [ ] **Step 6: Write the database client**

```ts
// File: lib/db/client.ts
import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Run: vercel env pull .env.development.local')
}

export const sql = neon(process.env.DATABASE_URL)
```

- [ ] **Step 7: Verify the seed landed**

```bash
node --env-file=.env.development.local -e "
const { neon } = require('@neondatabase/serverless');
(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.table(await sql\`SELECT title, tier FROM objectives ORDER BY id\`);
})();
"
```

Expected: three rows — bush (easy), Mikey (hard), shoey (unhinged)

- [ ] **Step 8: Commit**

```bash
git add db/ lib/db/client.ts package.json package-lock.json
git commit -m "feat: provision Neon, add schema and dev seed"
```

---

### Task 7: Provision Clerk and bootstrap player records

**Files:**
- Create: `proxy.ts`
- Create: `lib/auth/current-player.ts`
- Test: `tests/auth/current-player.test.ts`
- Modify: `app/layout.tsx` (wrap in `ClerkProvider`)

**Interfaces:**
- Consumes: `sql` from `lib/db/client.ts`
- Produces:
  - `interface Player { id: string; displayName: string; avatarUrl: string | null }`
  - `async function currentPlayer(): Promise<Player | null>`
  - `function playerFromClerk(user: { id: string; fullName: string | null; username: string | null; imageUrl: string | null }): Player`

- [ ] **Step 1: Provision Clerk**

```bash
vercel integration add clerk --yes --no-claim
```

**If the CLI hands off to a dashboard or browser step, STOP and ask the user to complete it, then continue.**

- [ ] **Step 2: Pull env vars and install the SDK**

```bash
vercel env pull .env.development.local --yes
npm install @clerk/nextjs
```

Verify both keys are present without printing values:

```bash
grep -c '^CLERK_SECRET_KEY=\|^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=' .env.development.local
```

Expected: `2`

- [ ] **Step 3: Add Clerk middleware**

Next.js names this file `proxy.ts`, not `middleware.ts`. The matcher excludes the PWA assets so the service worker and manifest stay publicly fetchable — an installed app must be able to load them before the user is authenticated.

```ts
// File: proxy.ts
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware()

export const config = {
  matcher: [
    '/((?!_next|manifest.webmanifest|sw.js|icons|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

- [ ] **Step 4: Write the failing test for the Clerk-to-Player mapping**

The display-name fallback is pure logic and worth testing on its own; the database round-trip is not unit-testable and is covered by the manual check in Step 8.

```ts
// File: tests/auth/current-player.test.ts
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
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run tests/auth/current-player.test.ts`
Expected: FAIL — cannot resolve `../../lib/auth/current-player`

- [ ] **Step 6: Write the implementation**

```ts
// File: lib/auth/current-player.ts
import { currentUser } from '@clerk/nextjs/server'
import { sql } from '../db/client'

export interface Player {
  id: string
  displayName: string
  avatarUrl: string | null
}

interface ClerkUserFields {
  id: string
  fullName: string | null
  username: string | null
  imageUrl: string | null
}

/** Every player needs a non-empty display name — an unlabelled entry on a
 *  ballot is unvotable. */
export function playerFromClerk(user: ClerkUserFields): Player {
  return {
    id: user.id,
    displayName: user.fullName || user.username || 'Brat',
    avatarUrl: user.imageUrl ?? null,
  }
}

/** Returns the signed-in player, creating their row on first sight.
 *  Identity must be stable and real: Phase 2 enforces "no self-voting"
 *  by comparing these ids. */
export async function currentPlayer(): Promise<Player | null> {
  const user = await currentUser()
  if (!user) return null

  const player = playerFromClerk(user)

  await sql`
    INSERT INTO users (id, display_name, avatar_url)
    VALUES (${player.id}, ${player.displayName}, ${player.avatarUrl})
    ON CONFLICT (id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          avatar_url   = EXCLUDED.avatar_url
  `

  return player
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/auth/current-player.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 8: Wrap the layout and verify sign-in end to end**

Add `ClerkProvider` around the existing `<html>` element in `app/layout.tsx`:

```tsx
// File: app/layout.tsx (modify)
import { ClerkProvider } from '@clerk/nextjs'
// ...existing imports and metadata unchanged...

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
```

Run `npm run dev`, open `http://localhost:3000`, sign in, then confirm the row was created:

```bash
node --env-file=.env.development.local -e "
const { neon } = require('@neondatabase/serverless');
(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.table(await sql\`SELECT id, display_name FROM users\`);
})();
"
```

Expected: one row for the signed-in user.

- [ ] **Step 9: Commit**

```bash
git add proxy.ts lib/auth/ tests/auth/ app/layout.tsx package.json package-lock.json
git commit -m "feat: add Clerk auth and player bootstrap"
```

---

### Task 8: Queries for the current week

**Files:**
- Create: `lib/db/queries.ts`
- Test: `tests/db/queries.test.ts`

**Interfaces:**
- Consumes: `sql` from `lib/db/client.ts`; `Tier` from `lib/domain/tiers.ts`; `WeekWindows`/`weekState` from `lib/domain/week-state.ts`
- Note: `canViewSubmission` is deliberately *not* used here. Phase 1 only ever loads the viewer's own submission, so the SQL join enforces hiding structurally. Phase 2 needs the predicate once ballots load other players' proof.
- Produces:
  - `interface ObjectiveWithMine { id: number; title: string; description: string; tier: Tier; mySubmissionId: number | null }`
  - `interface CurrentWeek { id: number; number: number; windows: WeekWindows; state: WeekState; objectives: ObjectiveWithMine[] }`
  - `async function getCurrentWeek(viewerId: string, now?: Date): Promise<CurrentWeek | null>`
  - `function shapeCurrentWeek(rows: WeekRow[], viewerId: string, now: Date): CurrentWeek | null`

- [ ] **Step 1: Write the failing test for the pure shaping function**

The SQL round-trip is verified manually in Step 5; the row-shaping logic — which is where the visibility rule is applied — is tested here.

```ts
// File: tests/db/queries.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/queries.test.ts`
Expected: FAIL — cannot resolve `../../lib/db/queries`

- [ ] **Step 3: Write the implementation**

```ts
// File: lib/db/queries.ts
import { sql } from './client'
import type { Tier } from '../domain/tiers'
import { weekState, type WeekState, type WeekWindows } from '../domain/week-state'

export interface WeekRow {
  week_id: number
  week_number: number
  drops_at: Date
  submissions_close_at: Date
  voting_closes_at: Date
  objective_id: number
  title: string
  description: string
  tier: Tier
  submission_id: number | null
  submission_user_id: string | null
}

export interface ObjectiveWithMine {
  id: number
  title: string
  description: string
  tier: Tier
  /** The viewer's own submission, if any. Other players' submissions are
   *  never included here — they are not visible until reveal. */
  mySubmissionId: number | null
}

export interface CurrentWeek {
  id: number
  number: number
  windows: WeekWindows
  state: WeekState
  objectives: ObjectiveWithMine[]
}

export function shapeCurrentWeek(
  rows: WeekRow[],
  viewerId: string,
  now: Date,
): CurrentWeek | null {
  if (rows.length === 0) return null

  const first = rows[0]
  const windows: WeekWindows = {
    dropsAt: first.drops_at,
    submissionsCloseAt: first.submissions_close_at,
    votingClosesAt: first.voting_closes_at,
  }

  const objectives: ObjectiveWithMine[] = rows.map((row) => ({
    id: row.objective_id,
    title: row.title,
    description: row.description,
    tier: row.tier,
    mySubmissionId: row.submission_user_id === viewerId ? row.submission_id : null,
  }))

  return {
    id: first.week_id,
    number: first.week_number,
    windows,
    state: weekState(windows, now),
    objectives,
  }
}

/** Loads the active week. The join is restricted to the viewer's own
 *  submission, so other players' proof never leaves the database before
 *  reveal — the hiding rule is enforced here, not in the UI. */
export async function getCurrentWeek(
  viewerId: string,
  now: Date = new Date(),
): Promise<CurrentWeek | null> {
  const rows = (await sql`
    SELECT
      w.id   AS week_id,
      w.number AS week_number,
      w.drops_at,
      w.submissions_close_at,
      w.voting_closes_at,
      o.id   AS objective_id,
      o.title,
      o.description,
      o.tier,
      s.id      AS submission_id,
      s.user_id AS submission_user_id
    FROM weeks w
    JOIN seasons se ON se.id = w.season_id AND se.is_active
    JOIN objectives o ON o.week_id = w.id
    LEFT JOIN submissions s
      ON s.objective_id = o.id AND s.user_id = ${viewerId}
    WHERE w.drops_at <= ${now}
    ORDER BY w.number DESC, o.id ASC
  `) as WeekRow[]

  if (rows.length === 0) return null

  const latestWeekId = rows[0].week_id
  return shapeCurrentWeek(
    rows.filter((r) => r.week_id === latestWeekId),
    viewerId,
    now,
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/queries.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Verify the real query against the seeded database**

```bash
node --env-file=.env.development.local -e "
const { neon } = require('@neondatabase/serverless');
(async () => {
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql\`
    SELECT w.number, o.title, o.tier FROM weeks w
    JOIN seasons se ON se.id = w.season_id AND se.is_active
    JOIN objectives o ON o.week_id = w.id ORDER BY o.id\`;
  console.table(rows);
})();
"
```

Expected: three objectives for week 1.

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries.ts tests/db/queries.test.ts
git commit -m "feat: add current-week query with reveal enforced in the query layer"
```

---

### Task 9: This Week screen

**Files:**
- Create: `app/page.tsx` (replace the scaffold placeholder)
- Create: `components/ObjectiveCard.tsx`
- Create: `components/WeekStatus.tsx`

**Interfaces:**
- Consumes: `currentPlayer()`, `getCurrentWeek()`, `medalsFor()`, `canSubmit()`
- Produces: the route `/`, linking to `/objective/[id]` for each objective

- [ ] **Step 1: Write the objective card**

```tsx
// File: components/ObjectiveCard.tsx
import Link from 'next/link'
import { medalsFor, type Tier } from '../lib/domain/tiers'

const TIER_LABEL: Record<Tier, string> = {
  easy: 'Easy',
  hard: 'Hard',
  unhinged: 'Unhinged',
}

export function ObjectiveCard({
  id,
  title,
  description,
  tier,
  submitted,
  open,
}: {
  id: number
  title: string
  description: string
  tier: Tier
  submitted: boolean
  open: boolean
}) {
  const medals = medalsFor(tier)

  return (
    <Link href={`/objective/${id}`} className="card">
      <span className={`tier tier-${tier}`}>{TIER_LABEL[tier]}</span>
      <h2>{title}</h2>
      {description && <p className="desc">{description}</p>}
      <p className="medals">
        🥇 {medals.first} · 🥈 {medals.second} · 🥉 {medals.third} · effort {medals.effort}
      </p>
      <p className="state">
        {submitted ? 'Submitted ✓' : open ? 'Not submitted' : 'Closed'}
      </p>
    </Link>
  )
}
```

- [ ] **Step 2: Write the week status banner**

```tsx
// File: components/WeekStatus.tsx
import type { WeekState } from '../lib/domain/week-state'

const MESSAGE: Record<WeekState, string> = {
  PENDING: 'Next drop coming soon',
  SUBMITTING: 'Submissions open — nobody can see your proof yet',
  VOTING: 'Submissions revealed. Voting is open.',
  CLOSED: 'Week closed',
}

export function WeekStatus({ number, state, closesAt }: {
  number: number
  state: WeekState
  closesAt: Date
}) {
  return (
    <header>
      <h1>week {number}</h1>
      <p className="sub">{MESSAGE[state]}</p>
      {state === 'SUBMITTING' && (
        <p className="status">Closes {closesAt.toLocaleString()}</p>
      )}
    </header>
  )
}
```

- [ ] **Step 3: Write the page**

```tsx
// File: app/page.tsx
import { currentPlayer } from '../lib/auth/current-player'
import { getCurrentWeek } from '../lib/db/queries'
import { canSubmit } from '../lib/domain/submission-rules'
import { ObjectiveCard } from '../components/ObjectiveCard'
import { WeekStatus } from '../components/WeekStatus'
import { SignInButton } from '@clerk/nextjs'

export default async function ThisWeekPage() {
  const player = await currentPlayer()

  if (!player) {
    return (
      <main className="screen">
        <header>
          <h1>brats</h1>
          <p className="sub">Brat Olympics</p>
        </header>
        <SignInButton mode="modal">
          <button className="btn">Sign in</button>
        </SignInButton>
      </main>
    )
  }

  const week = await getCurrentWeek(player.id)

  if (!week) {
    return (
      <main className="screen">
        <header>
          <h1>brats</h1>
          <p className="sub">No week has dropped yet.</p>
        </header>
      </main>
    )
  }

  const open = canSubmit(week.state)

  return (
    <main className="screen">
      <WeekStatus
        number={week.number}
        state={week.state}
        closesAt={week.windows.submissionsCloseAt}
      />
      <div className="stack">
        {week.objectives.map((o) => (
          <ObjectiveCard
            key={o.id}
            id={o.id}
            title={o.title}
            description={o.description}
            tier={o.tier}
            submitted={o.mySubmissionId !== null}
            open={open}
          />
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Add the card and tier styles**

Append to `app/globals.css`:

```css
.card {
  display: block;
  padding: 18px 20px;
  border: 2px solid var(--ink);
  border-radius: 14px;
  background: var(--ink);
  color: var(--btn-ink);
  text-decoration: none;
}
.card h2 { margin: 8px 0 0; font-size: 24px; letter-spacing: -.02em; }
.tier { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; opacity: .75; }
.tier-unhinged { color: #ff5c5c; opacity: 1; }
.desc { margin: 6px 0 0; opacity: .7; font-size: 14px; }
.medals { margin: 10px 0 0; font-size: 13px; opacity: .8; }
.state { margin: 6px 0 0; font-size: 13px; font-weight: 600; }
```

- [ ] **Step 5: Verify in the browser**

Run `npm run dev`, sign in, open `http://localhost:3000`.
Expected: week 1 with three cards — Bush (Easy, 15/10/5), Tag Mikey (Hard, 30/20/10), Shoey (Unhinged, 50/35/20), each marked "Not submitted", and the banner reading "Submissions open — nobody can see your proof yet".

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx components/ app/globals.css
git commit -m "feat: add This Week screen"
```

---

### Task 10: In-app capture

**Files:**
- Create: `components/Capture.tsx`
- Create: `lib/media/recorder.ts`
- Test: `tests/media/recorder.test.ts`

**Interfaces:**
- Consumes: `MAX_RECORDING_SECONDS` from `lib/domain/trim.ts`
- Produces:
  - `function pickMimeType(supported: (type: string) => boolean): string | null`
  - `<Capture onCaptured={(file: File, kind: 'photo' | 'video', duration: number) => void} />`

- [ ] **Step 1: Write the failing test for codec selection**

Choosing a container the browser can both record and play back is the whole reason in-app capture avoids the iPhone HEVC problem, so it is worth testing directly.

```ts
// File: tests/media/recorder.test.ts
import { describe, it, expect } from 'vitest'
import { pickMimeType, MAX_PHOTO_EDGE } from '../../lib/media/recorder'

describe('pickMimeType', () => {
  it('prefers mp4/h264, which Safari records and every browser plays', () => {
    expect(pickMimeType(() => true)).toBe('video/mp4;codecs=avc1')
  })

  it('falls back to webm when mp4 is unavailable', () => {
    expect(pickMimeType((t) => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp8')
  })

  it('returns null when nothing is supported, so the caller can say so plainly', () => {
    expect(pickMimeType(() => false)).toBeNull()
  })
})

describe('MAX_PHOTO_EDGE', () => {
  it('caps photos at 1600px on the long edge, per the spec', () => {
    expect(MAX_PHOTO_EDGE).toBe(1600)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media/recorder.test.ts`
Expected: FAIL — cannot resolve `../../lib/media/recorder`

- [ ] **Step 3: Write the implementation**

```ts
// File: lib/media/recorder.ts

/** Ordered by preference. MP4/H.264 first: Safari on iOS records it natively
 *  and every browser plays it, which is what keeps us out of transcoding.
 *  WebM is the fallback for Chrome and Firefox on desktop. */
const CANDIDATES = [
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

/** `supported` is injected so this is testable without a browser —
 *  pass `MediaRecorder.isTypeSupported` in real use. */
export function pickMimeType(supported: (type: string) => boolean): string | null {
  return CANDIDATES.find((type) => supported(type)) ?? null
}

/** Modest bitrate: a 60s clip lands near 10MB, which uploads over bad cell
 *  service and keeps season egress small. */
export const VIDEO_BITS_PER_SECOND = 1_500_000

/** Longest edge for uploaded photos. Full sensor frames are several MB for no
 *  visible gain on a phone screen. */
export const MAX_PHOTO_EDGE = 1600
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media/recorder.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Write the capture component**

```tsx
// File: components/Capture.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { pickMimeType, VIDEO_BITS_PER_SECOND, MAX_PHOTO_EDGE } from '../lib/media/recorder'
import { MAX_RECORDING_SECONDS } from '../lib/domain/trim'

export function Capture({
  onCaptured,
}: {
  onCaptured: (file: File, kind: 'photo' | 'video', durationSeconds: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number>(0)

  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setError('Camera access denied. Enable it in Settings to submit proof.'))

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Hard stop at the recording cap, mirroring the server-side check.
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => {
      const seconds = (Date.now() - startedAtRef.current) / 1000
      setElapsed(seconds)
      if (seconds >= MAX_RECORDING_SECONDS) stopRecording()
    }, 100)
    return () => clearInterval(id)
  }, [recording])

  function startRecording() {
    const stream = streamRef.current
    if (!stream) return

    const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t))
    if (!mimeType) {
      setError('This browser cannot record video. Try Safari or Chrome.')
      return
    }

    const chunks: BlobPart[] = []
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onstop = () => {
      const duration = (Date.now() - startedAtRef.current) / 1000
      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
      const file = new File(chunks, `proof.${ext}`, { type: mimeType })
      onCaptured(file, 'video', Math.min(duration, MAX_RECORDING_SECONDS))
    }

    recorderRef.current = recorder
    startedAtRef.current = Date.now()
    recorder.start()
    setRecording(true)
  }

  function stopRecording() {
    recorderRef.current?.stop()
    setRecording(false)
    setElapsed(0)
  }

  function takePhoto() {
    const video = videoRef.current
    if (!video) return

    // Resize to at most 1600px on the long edge before upload. Full sensor
    // frames are several MB each for no visible benefit on a phone screen.
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (blob) onCaptured(new File([blob], 'proof.jpg', { type: 'image/jpeg' }), 'photo', 0)
      },
      'image/jpeg',
      0.85,
    )
  }

  if (error) return <p className="status">{error}</p>

  return (
    <div className="capture">
      <video ref={videoRef} autoPlay playsInline muted className="preview" />
      {recording && (
        <p className="status">
          {elapsed.toFixed(1)}s / {MAX_RECORDING_SECONDS}s
        </p>
      )}
      <div className="stack">
        <button
          className="btn"
          onClick={recording ? stopRecording : startRecording}
        >
          {recording ? 'Stop' : 'Record video'}
        </button>
        {!recording && (
          <button className="btn ghost" onClick={takePhoto}>
            Take photo
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Add preview styles**

Append to `app/globals.css`:

```css
.preview { width: 100%; border-radius: 14px; border: 2px solid var(--ink); background: #000; aspect-ratio: 3 / 4; object-fit: cover; }
.capture { display: flex; flex-direction: column; gap: 12px; }
```

- [ ] **Step 7: Commit**

```bash
git add components/Capture.tsx lib/media/ tests/media/ app/globals.css
git commit -m "feat: add in-app photo and video capture"
```

---

### Task 11: Trim UI and submit flow

**Files:**
- Create: `app/objective/[id]/page.tsx`
- Create: `components/SubmitFlow.tsx`
- Create: `components/Trimmer.tsx`
- Create: `app/api/submissions/route.ts`
- Modify: `package.json` (add `@vercel/blob`)

**Interfaces:**
- Consumes: `validateTrim`, `MAX_TRIM_SECONDS`, `canSubmit`, `currentPlayer`, `getCurrentWeek`
- Produces: `POST /api/submissions` accepting multipart form data and returning `{ id: number }`

- [ ] **Step 1: Add the `media_pathname` column**

The Blob store (`brats-media`, **private**) and `@vercel/blob` are already provisioned;
`BLOB_READ_WRITE_TOKEN` is in `.env.development.local`. Do not re-provision.

A private blob cannot be fetched from its URL — retrieval needs the pathname. Add the
column and apply it:

```sql
-- File: db/migrations/001-media-pathname.sql
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS media_pathname TEXT;
```

```bash
node --env-file=.env.development.local db/apply.mjs db/migrations/001-media-pathname.sql
```

Also add the column to `db/schema.sql` (below `media_url`) so a fresh database matches:
`media_pathname TEXT,`

Expected: the script reports 1 statement applied.

- [ ] **Step 2: Write the trimmer**

```tsx
// File: components/Trimmer.tsx
'use client'

import { useState } from 'react'
import { MAX_TRIM_SECONDS, validateTrim } from '../lib/domain/trim'

export function Trimmer({
  src,
  duration,
  onChange,
}: {
  src: string
  duration: number
  onChange: (start: number, end: number, valid: boolean) => void
}) {
  const [start, setStart] = useState(0)
  const end = Math.min(start + MAX_TRIM_SECONDS, duration)
  const result = validateTrim(start, end, duration)

  function update(nextStart: number) {
    setStart(nextStart)
    const nextEnd = Math.min(nextStart + MAX_TRIM_SECONDS, duration)
    onChange(nextStart, nextEnd, validateTrim(nextStart, nextEnd, duration).ok)
  }

  return (
    <div className="stack">
      <video src={src} controls playsInline className="preview" />
      <label className="status">
        Showing {start.toFixed(1)}s – {end.toFixed(1)}s
        {' '}(max {MAX_TRIM_SECONDS}s)
      </label>
      <input
        type="range"
        min={0}
        max={Math.max(0, duration - 0.1)}
        step={0.1}
        value={start}
        onChange={(e) => update(Number(e.target.value))}
      />
      {!result.ok && <p className="status">{result.reason}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Write the submit API route**

Every rule is re-checked server-side. The client cannot be trusted about the week state, the trim bounds, or who it is.

```ts
// File: app/api/submissions/route.ts
import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../lib/auth/current-player'
import { getCurrentWeek } from '../../../lib/db/queries'
import { sql } from '../../../lib/db/client'
import { canSubmit } from '../../../lib/domain/submission-rules'
import { validateTrim } from '../../../lib/domain/trim'

export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const form = await request.formData()
  const file = form.get('file')
  const objectiveId = Number(form.get('objectiveId'))
  const kind = String(form.get('kind'))

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file supplied' }, { status: 400 })
  }
  if (kind !== 'photo' && kind !== 'video') {
    return NextResponse.json({ error: 'Unknown media kind' }, { status: 400 })
  }

  const week = await getCurrentWeek(player.id)
  if (!week) {
    return NextResponse.json({ error: 'No active week' }, { status: 400 })
  }
  if (!week.objectives.some((o) => o.id === objectiveId)) {
    return NextResponse.json({ error: 'Objective is not in the current week' }, { status: 400 })
  }
  if (!canSubmit(week.state)) {
    return NextResponse.json({ error: 'Submissions are closed' }, { status: 403 })
  }

  let trimStart: number | null = null
  let trimEnd: number | null = null
  let duration: number | null = null

  if (kind === 'video') {
    trimStart = Number(form.get('trimStart'))
    trimEnd = Number(form.get('trimEnd'))
    duration = Number(form.get('duration'))

    const trim = validateTrim(trimStart, trimEnd, duration)
    if (!trim.ok) {
      return NextResponse.json({ error: trim.reason }, { status: 400 })
    }
  }

  // Private: the store is not publicly readable, so this URL is not a public
  // link. Phase 2 streams media back via get(pathname, { access: 'private' })
  // behind a Clerk check — which is why the pathname is persisted below.
  const blob = await put(`submissions/${objectiveId}/${player.id}-${Date.now()}`, file, {
    access: 'private',
    addRandomSuffix: true,
  })

  const rows = (await sql`
    INSERT INTO submissions
      (objective_id, user_id, media_url, media_pathname, media_type, duration_seconds, trim_start, trim_end)
    VALUES
      (${objectiveId}, ${player.id}, ${blob.url}, ${blob.pathname}, ${kind}, ${duration}, ${trimStart}, ${trimEnd})
    ON CONFLICT (objective_id, user_id) DO UPDATE
      SET media_url = EXCLUDED.media_url,
          media_pathname = EXCLUDED.media_pathname,
          media_type = EXCLUDED.media_type,
          duration_seconds = EXCLUDED.duration_seconds,
          trim_start = EXCLUDED.trim_start,
          trim_end = EXCLUDED.trim_end,
          created_at = now()
    RETURNING id
  `) as { id: number }[]

  return NextResponse.json({ id: rows[0].id })
}
```

- [ ] **Step 4: Write the submit flow component**

```tsx
// File: components/SubmitFlow.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Capture } from './Capture'
import { Trimmer } from './Trimmer'

export function SubmitFlow({ objectiveId }: { objectiveId: number }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<'photo' | 'video'>('video')
  const [duration, setDuration] = useState(0)
  const [trim, setTrim] = useState({ start: 0, end: 0, valid: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewUrl = file ? URL.createObjectURL(file) : null

  async function submit() {
    if (!file) return
    setBusy(true)
    setError(null)

    const form = new FormData()
    form.set('file', file)
    form.set('objectiveId', String(objectiveId))
    form.set('kind', kind)
    if (kind === 'video') {
      form.set('trimStart', String(trim.start))
      form.set('trimEnd', String(trim.end))
      form.set('duration', String(duration))
    }

    const res = await fetch('/api/submissions', { method: 'POST', body: form })
    setBusy(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Upload failed' }))
      setError(body.error ?? 'Upload failed')
      return
    }
    router.push('/')
    router.refresh()
  }

  if (!file) {
    return (
      <Capture
        onCaptured={(captured, capturedKind, capturedDuration) => {
          setFile(captured)
          setKind(capturedKind)
          setDuration(capturedDuration)
          setTrim({ start: 0, end: Math.min(15, capturedDuration), valid: true })
        }}
      />
    )
  }

  return (
    <div className="stack">
      {kind === 'video' && previewUrl ? (
        <Trimmer
          src={previewUrl}
          duration={duration}
          onChange={(start, end, valid) => setTrim({ start, end, valid })}
        />
      ) : (
        previewUrl && <img src={previewUrl} alt="Your proof" className="preview" />
      )}

      {error && <p className="status">{error}</p>}

      <button
        className="btn"
        disabled={busy || (kind === 'video' && !trim.valid)}
        onClick={submit}
      >
        {busy ? 'Uploading…' : 'Submit proof'}
      </button>
      <button className="btn ghost" onClick={() => setFile(null)} disabled={busy}>
        Retake
      </button>
      {previewUrl && (
        <a className="btn ghost" href={previewUrl} download={file.name}>
          Save full recording to my phone
        </a>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write the objective page**

```tsx
// File: app/objective/[id]/page.tsx
import { notFound } from 'next/navigation'
import { currentPlayer } from '../../../lib/auth/current-player'
import { getCurrentWeek } from '../../../lib/db/queries'
import { canSubmit } from '../../../lib/domain/submission-rules'
import { medalsFor } from '../../../lib/domain/tiers'
import { SubmitFlow } from '../../../components/SubmitFlow'

export default async function ObjectivePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const objectiveId = Number(id)

  const player = await currentPlayer()
  if (!player) notFound()

  const week = await getCurrentWeek(player.id)
  const objective = week?.objectives.find((o) => o.id === objectiveId)
  if (!week || !objective) notFound()

  const medals = medalsFor(objective.tier)
  const open = canSubmit(week.state)

  return (
    <main className="screen">
      <header>
        <span className={`tier tier-${objective.tier}`}>{objective.tier}</span>
        <h1>{objective.title}</h1>
        {objective.description && <p className="sub">{objective.description}</p>}
        <p className="medals">
          🥇 {medals.first} · 🥈 {medals.second} · 🥉 {medals.third} · effort {medals.effort}
        </p>
      </header>

      {open ? (
        <SubmitFlow objectiveId={objective.id} />
      ) : (
        <p className="status">Submissions are closed for this week.</p>
      )}

      <a className="btn ghost" href="/">← This week</a>
    </main>
  )
}
```

- [ ] **Step 6: Verify the whole loop end to end**

Run `npm run dev` and, in the browser:

1. Sign in and open an objective
2. Record a ~20s video, confirm the counter stops at 60s if you let it run
3. Drag the trim slider, confirm the range never exceeds 15s
4. Submit, confirm you are returned to This Week and the card reads "Submitted ✓"

Then confirm the row and the trim bounds landed:

```bash
node --env-file=.env.development.local -e "
const { neon } = require('@neondatabase/serverless');
(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.table(await sql\`
    SELECT id, objective_id, media_type, duration_seconds, trim_start, trim_end
    FROM submissions ORDER BY id DESC LIMIT 5\`);
})();
"
```

Expected: a `video` row with `trim_end - trim_start <= 15`, `duration_seconds <= 60`,
and a non-null `media_pathname`.

Then confirm the media is genuinely private — fetch the stored URL with no credentials:

```bash
node --env-file=.env.development.local -e "
const { neon } = require('@neondatabase/serverless');
(async () => {
  const sql = neon(process.env.DATABASE_URL);
  const [row] = await sql\`SELECT media_url FROM submissions ORDER BY id DESC LIMIT 1\`;
  const res = await fetch(row.media_url);
  console.log('unauthenticated fetch status:', res.status);
})();
"
```

Expected: a 4xx status, NOT 200. A 200 means the store is public and the privacy
decision was not applied.

- [ ] **Step 7: Verify the hiding rule holds against a second account**

Sign in as a different user in a private window and open This Week.
Expected: the objective the first user submitted to reads "Not submitted" and their media URL appears nowhere in the page source. This is the single most important check in Phase 1 — if it fails, reveal is broken and the game does not work.

- [ ] **Step 8: Run the full test suite and commit**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

```bash
git add -A
git commit -m "feat: add trim UI and submission flow with server-side rule enforcement"
```

---

### Task 12: Deploy Phase 1

**Files:**
- Modify: `public/sw.js` (bump cache version)

**Interfaces:**
- Consumes: everything above
- Produces: Phase 1 live at `brats.anico.dev`

- [ ] **Step 1: Bump the service worker cache version**

The shell changed completely. Installed apps are holding `brat-v2` and will serve stale assets otherwise.

In `public/sw.js`, change `const CACHE = 'brat-v2'` to `const CACHE = 'brat-v3'`, and replace the `SHELL` array with only what still exists:

```js
const SHELL = [
  '/', '/manifest.webmanifest',
  '/icons/icon-180.png', '/icons/icon-192.png', '/icons/icon-512.png'
];
```

The old entries (`/index.html`, `/about.html`, `/counter.html`, `/style.css`, `/app.js`) no longer exist; leaving them makes `addAll` reject and the service worker fail to install entirely.

- [ ] **Step 2: Confirm the production environment has every variable**

```bash
vercel env ls production
```

Expected: `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `BLOB_READ_WRITE_TOKEN`. Names only — never print values.

- [ ] **Step 3: Apply the schema to the production database**

If the Neon integration created separate development and production databases, run the schema against production too, using the production `DATABASE_URL`.

- [ ] **Step 4: Deploy and verify**

```bash
vercel deploy --prod --yes
```

Then:

```bash
for u in / /manifest.webmanifest /sw.js; do
  printf "%-28s " "$u"
  curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "https://brats.anico.dev$u"
done
```

Expected: all `200`, manifest as `application/manifest+json`.

- [ ] **Step 5: Verify on a real iPhone**

Open `https://brats.anico.dev` in Safari, launch from the home screen, sign in, record and submit a video.
Expected: the footer reports standalone, capture opens the camera, and the submission appears in the database. **`getUserMedia` requires HTTPS and will silently fail over plain HTTP** — this must be tested on the deployed URL, not a LAN IP.

- [ ] **Step 6: Commit**

```bash
git add public/sw.js
git commit -m "chore: bump service worker cache for Phase 1 shell"
```

---

## Phase 1 done when

- A player signs in with Clerk and lands on This Week
- Three objectives render with correct tier badges and medal values
- Recording caps at 60s, trimming caps at 15s, both enforced server-side
- Submitting stores the file in Blob and the trim offsets in Postgres
- **A second account cannot see the first account's submission before reveal**
- The app installs and runs standalone on iOS from `brats.anico.dev`

## Deliberately not in Phase 1

Voting, scoring, the leaderboard, the archive feed, reactions and notifications
are Phase 2 and 3. The point of Phase 1 is to find out whether people will post
at all.
