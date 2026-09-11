# Stack and deployment

What this app is built on, who owns which piece, and how it gets to
https://brats.anico.dev. Current as of 2026-09-11.

Companion docs: [RULES.md](RULES.md) (game rules), [ROADMAP.md](ROADMAP.md)
(what is built and what is next), [TESTING.md](TESTING.md) (the two test
suites), [ISSUES.md](ISSUES.md) (open defects).

## The short version

Four services, and each one owns exactly one thing:

| Service | Owns | How it's billed to the app |
|---|---|---|
| **Vercel** | Hosting, build, functions, CDN, the domain | The platform |
| **Clerk** | Accounts, sign-in, sessions, the admin flag | Vercel Marketplace integration `clerk-citron-horizon` |
| **Neon** | Postgres — every row the game is made of | Vercel Marketplace integration `neon-orange-cable` |
| **Vercel Blob** | The recordings themselves (photo/video files) | Vercel storage, not a marketplace add-on |

**Yes — Clerk is only auth, Neon is only the database.** They do not overlap in
this app. The one place it looks like they might is the `users` table: its
primary key is the Clerk user id (`TEXT`, e.g. `user_2abc…`), and
`display_name` / `avatar_url` are copies of Clerk fields refreshed on sign-in.
Clerk stays the source of truth for *who you are*; the `users` row is the
source of truth for *whether you're admitted to the game* (see
`lib/auth/current-player.ts` — holding a Clerk session is not membership, a
`users` row is, and only redeeming an invite creates one).

Neon's own auth product (Neon Auth) is **not used**, even though the
integration provisioned env vars for it. See [Environment
variables](#environment-variables).

## Application stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.3.4, App Router | `next.config.ts` is near-empty by design |
| UI | React 19.2.8, Server Components by default | Client components only where the camera, timers or forms need them |
| Language | TypeScript 5 | No path aliases — imports are relative |
| Styling | Plain CSS in `app/globals.css` | No Tailwind, no CSS-in-JS, no component library |
| Data access | `@neondatabase/serverless` + tagged-template SQL | **No ORM.** Queries live in `lib/db/*.ts` |
| Auth | `@clerk/nextjs` ^7.9.1 | `proxy.ts` runs `clerkMiddleware()` (Next 16 renamed `middleware.ts` to `proxy.ts`) |
| Media storage | `@vercel/blob` ^2.8.0 | Client-direct upload, see below |
| Tests | Vitest 4 | Two suites, see [TESTING.md](TESTING.md) |
| PWA | Hand-written `public/sw.js` + `public/manifest.webmanifest` | Installable only; caches static assets and nothing else |
| Icons/brand | `brand/build-logo.mjs` renders SVG → PNG with `sharp` | Build-time only, run by hand; `sharp` is a devDependency for this alone |

### Directory map

```
app/            Routes. Pages are Server Components; /api/* are route handlers
components/     Client components (capture, trim, ballot, admin controls)
lib/domain/     Pure functions — scoring, ballots, week state, trim rules.
                No I/O, no imports from lib/db. This is where the game rules live
lib/db/         Every SQL query in the app
lib/auth/       Clerk → player resolution and the admin check
lib/media/      Recorder, trim range, playback clamp, save-to-camera-roll
db/             schema.sql (idempotent), seed.sql, migrations/, apply.mjs
tests/          Mirrors lib/ plus tests/integration/ (real database)
docs/           These documents
brand/          Logo source and the icon build script
```

The `lib/domain` ↔ `lib/db` split is deliberate: anything that decides the
outcome of the game is a pure function with unit tests, so it can be reasoned
about without a database.

## How a submission actually flows

This is the one path that touches all four services, so it's worth reading
once:

1. `components/Capture.tsx` records with `MediaRecorder` in the browser.
2. `components/Trimmer.tsx` picks in/out points. **The file is never cut** —
   `trim_start` / `trim_end` are stored as metadata and applied on playback.
3. `components/SubmitFlow.tsx` calls `upload()` from `@vercel/blob/client`,
   which first asks `POST /api/submissions/upload` for a token.
4. That route re-checks every submission rule server-side and pins the
   destination key to `submissions/{objectiveId}/{playerId}/…`. It exists
   because a Vercel function request body caps out around 4.5MB, well under a
   60s clip — so the bytes go **browser → Blob directly**, never through the
   function.
5. The browser then posts the resulting url + pathname as a small JSON body to
   `POST /api/submissions`, which writes the Neon row. (`onUploadCompleted`
   is deliberately unused — it never fires on localhost, which would make
   local dev silently broken.)
6. Playback goes through `GET /api/media/[...pathname]`, which re-checks
   `canViewSubmission` before streaming bytes. Blob URLs are never handed to
   the client directly; the reveal gate is enforced on every read.

## Database

Neon Postgres, accessed over the **pooled** connection (`DATABASE_URL`) with
the serverless HTTP driver. No connection pool to manage, no `PrismaClient`,
no migration framework.

- `db/schema.sql` is the current shape and is written to be re-runnable.
- `db/migrations/NNN-*.sql` are the historical steps, kept for the record.
- `node db/apply.mjs <files…>` applies them. `npm run db:apply` is the **dev
  branch** wrapper — schema, seed, and the dev marker, against
  `.env.development.local`. There is deliberately no production wrapper; see
  [Applying schema to production](#applying-schema-to-production).
- Several rules are enforced *by the database*, not by application code — one
  active season, no overlapping weeks (`weeks_no_overlap`, DEFERRABLE),
  ordered week timestamps. That is intentional: a bad seed cannot create an
  unfair week.

### Branches

| Branch | Used by | Contents | Connection string lives in |
|---|---|---|---|
| production (default) | The live site, and **preview deployments** | Real players, real submissions | Vercel env `DATABASE_URL`, pulled to `.env.local` |
| `dev` | `npm run dev`, `npm run db:apply` | Seeded season, no real data | `.env.development.local`, by hand |
| `test` | `npm run test:integration` only | Whatever the suite creates and tears down | `.env.test.local`, by hand |

`dev` and `test` are **schema-only** branches — Neon copies the schema without
the rows, so neither holds a copy of anyone's real submissions. `dev` is then
seeded by `npm run db:apply`, which gives it the full 8-week placeholder season
with nobody signed up.

Both disposable branches carry a marker table that the database itself can be
asked about, rather than trusting an env file's name or a hostname pattern:

| Marker | Created by | Enforced by |
|---|---|---|
| `test_branch_marker` | `db/test-branch.sql` | `tests/integration/guard.ts` — the suite **refuses to run without it**, so a stray env file cannot write to production |
| `dev_branch_marker` | `db/dev-branch.sql` | `scripts/sweep-orphan-blobs.mjs` — the sweep **refuses to run with it**, so it cannot compute "orphan" from a database that never referenced production's media |

The two guards point in opposite directions on purpose. The test guard asks
"am I allowed to write here?"; the sweep guard asks "am I allowed to decide
what to delete from the shared blob store?" — and only production may answer
yes to the second.

**The blob store does not branch.** There is one Vercel Blob store behind
every database branch. A dev row can therefore reference a production file,
and any code path that deletes media (`del()` in the admin reset and the
submission-replace path) reaches production's store no matter which database
you are pointed at. Treat deletes in dev as real.

## Environment variables

Only **four** are read anywhere in the codebase:

| Variable | Read by |
|---|---|
| `DATABASE_URL` | `lib/db/client.ts`, `db/apply.mjs`, `scripts/sweep-orphan-blobs.mjs`, integration tests |
| `BLOB_READ_WRITE_TOKEN` | `@vercel/blob` (implicitly) |
| `CLERK_SECRET_KEY` | `@clerk/nextjs` (implicitly) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `@clerk/nextjs` (implicitly) |

The other ~18 in the Vercel project are provisioned automatically by the Neon
integration and read by nothing here:

- `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`,
  `POSTGRES_URL_NO_SSL`, `POSTGRES_HOST/USER/PASSWORD/DATABASE` — aliases of
  `DATABASE_URL` for other drivers and ORMs.
- `PGHOST`, `PGHOST_UNPOOLED`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — the same
  again, in libpq form.
- `DATABASE_URL_UNPOOLED` — direct (non-pooled) endpoint. Unused, but the one
  worth keeping in mind: anything needing a session-level feature (advisory
  locks, `LISTEN/NOTIFY`) would need it.
- `NEON_PROJECT_ID`, `NEON_AUTH_BASE_URL`, `VITE_NEON_AUTH_URL` — Neon Auth.
  **Unused. Clerk does auth.** `VITE_*` is a Vite convention and means nothing
  to Next.js.

They are managed by the integration, so removing them by hand risks being
re-added on the next sync. They cost nothing but confusion; the confusion is
what this section is for.

### Getting them locally

```bash
vercel env pull .env.local
```

**Pull into `.env.local`, and nothing else.** The three local env files are a
deliberate stack, in Next's own precedence order:

| File | Written by | Holds |
|---|---|---|
| `.env.development.local` | Hand | `DATABASE_URL` → the `dev` branch. Nothing else |
| `.env.local` | `vercel env pull` | Everything, with the **production** `DATABASE_URL` |
| `.env.test.local` | Hand | `DATABASE_URL` → the `test` branch. Read only via `--env-file` |

Next loads `.env.development.local` ahead of `.env.local`, so the one-line file
wins for the database while Clerk and Blob still come from the pull. That is
what makes the arrangement survive: `vercel env pull` overwrites its target
file wholesale, so the override has to live somewhere the pull never touches.

Pulling into `.env.development.local` would silently point local development
back at production — which is exactly the bug this layering exists to prevent.
All three files are gitignored.

## Deployment

| | |
|---|---|
| Vercel project | `brat-app`, team `narcelins-projects` |
| Repository | https://github.com/narcelin/brat-app (public) |
| Production URL | https://brats.anico.dev (also `brat-app.vercel.app`) |
| Region | `iad1` |
| Node | 24.x |
| Framework | Declared in `vercel.json` as `nextjs` |
| Build | `next build` |

### How a deploy happens

Through Git, since 2026-09-11:

| Push to | Result |
|---|---|
| `main` | Production deploy, live on brats.anico.dev |
| Any other branch | Preview deploy at its own URL — **wired to the production database**, see [Known gaps](#known-infrastructure-gaps) |

`vercel --prod` from the laptop still works and still deploys production. It is
now the fallback, not the routine — using both just deploys twice.

Before the GitHub connection every deploy was a manual CLI push from one
machine, with no preview environments, no CI and no off-machine copy of the
history. Two of those three are now fixed; **there is still no CI**, so
`npm test` runs only when someone remembers. A GitHub Action running the unit
suite on push is the obvious next step — it needs no secrets, because the unit
suite is designed to pass with no env files at all.

`ServiceWorker.tsx` plus the `brat-vNN` cache name in `public/sw.js` mean a
new deploy is picked up without anyone force-refreshing — **bump that cache
version whenever `sw.js` changes**, or installed clients keep the old worker.

## Local development

```bash
npm install
vercel env pull .env.local   # production values for Clerk and Blob
npm run dev                  # http://localhost:3000, against the dev branch
npm test                     # unit suite, no env files needed
npm run test:integration     # requires .env.test.local
```

`npm run dev` talks to the `dev` branch, so you can sign up, submit and vote
without touching a real week. Sign-in still goes through the **production**
Clerk instance — Clerk is not branched — so your local account is a real
account, and it will have no `users` row on the dev branch until you redeem an
invite there. Generate one from `/admin` against dev.

### Applying schema to production

There is no npm script for this, on purpose — the shortest path to production
should not be one word:

```bash
vercel env pull .env.production.local --environment=production
node --env-file=.env.production.local db/apply.mjs db/schema.sql db/seed.sql
```

Note the absence of `db/dev-branch.sql`. Applying it to production would mark
production disposable and disable the blob sweep.

### Re-provisioning the dev branch

If it drifts or you want it back to a clean season:

```bash
neon branches delete dev --project-id <project>
neon branches create --name dev --schema-only --project-id <project>
neon connection-string dev --project-id <project> --pooled   # into .env.development.local
npm run db:apply
```

`npm test` must pass on a fresh clone with no env files at all — that is why
`lib/db/client.ts` resolves `DATABASE_URL` lazily on first query rather than
at import time.

## Known infrastructure gaps

Ordered by what will hurt first. None of these are code defects; they are
choices that have not been made yet.

1. **Preview deployments still use the production database.** Local dev no
   longer does (the `dev` branch, 2026-09-11), but Vercel's `DATABASE_URL` is
   scoped to Production, Preview and Development alike, so any branch pushed
   to GitHub gets a preview URL wired to live data. Fixing it means either
   scoping a Preview-targeted override in Vercel or turning on Neon's
   per-preview branching — both of which have to work around the fact that the
   integration manages that variable.
2. **The blob store is shared by every branch**, so deletes in dev are real.
   See [Branches](#branches). Neon's own object storage branches with the
   database; Vercel Blob does not.
3. **Vercel project preset is "Other".** `vercel.json` declares `nextjs` and
   wins, so builds are correct — but the dashboard reads as misconfigured, and
   anything that consults the preset rather than the file will be wrong.
4. **Neon Auth env vars are provisioned but unused.** Documented above so the
   next person doesn't go looking for a second auth system.
5. **Blob orphans.** `scripts/sweep-orphan-blobs.mjs` exists and is run by
   hand, against production only. See [ISSUES.md](ISSUES.md).
