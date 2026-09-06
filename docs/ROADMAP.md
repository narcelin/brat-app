# Roadmap

Design: [2026-09-06 Brat Olympics design](superpowers/specs/2026-09-06-brat-olympics-design.md)
Rules: [RULES.md](RULES.md)

Phases 1 and 2 are season 1. Everything after is earned by the game surviving
eight weeks.

## Phase 0 — Season prep (no code)

- [ ] Draft day: group ranks objectives into Easy / Hard / Unhinged
- [ ] Write season 1 objective list (3 per week x 8 weeks = 24)
- [ ] Seed objectives, weeks and players into the database

Runs in a spreadsheet. See "Out of scope for season 1" in the design.

## Phase 1 — The posting loop ✅ SHIPPED 2026-09-06

Proves people will actually post. Nothing else matters if they won't.
Live at https://brats.anico.dev. 95 unit tests + 3 integration tests.

- [x] Next.js app replacing the static shell (keep manifest, service worker, colours)
- [x] Postgres via Vercel Marketplace + schema
- [x] Clerk auth, invite-only
- [x] This Week screen: 3 objectives, tier badges, submission status
- [x] In-app capture: photo, and video up to 60s via MediaRecorder
- [x] Non-destructive trim (trim_start / trim_end metadata)
- [x] Save full capture to camera roll
- [x] Upload to Vercel Blob (direct-to-Blob client upload — a server route cannot take >4.5MB)
- [x] Week state machine: DROPPED -> SUBMITTING -> VOTING -> CLOSED
- [x] Submissions hidden until submission window closes

## Phase 1.5 — Admin controls ✅ SHIPPED 2026-09-06

Needed before Phase 2 can be tested at all: time-based windows make every test a
waiting game, and there is no way to advance a week without editing the database.

- [x] Admin role on a player (Clerk `publicMetadata`, checked server-side — never
      trust a client claim)
- [ ] Admin screen: create and edit a week's three objectives and their tiers
      (not built — objectives are still seeded by SQL, which is fine until
      draft day produces the real ones)
- [x] **Advance the week manually** — force `SUBMITTING → VOTING → CLOSED`
      rather than waiting on timestamps. `weekState()` stays the fallback when
      no manual override is set, so the game still runs itself if nobody
      intervenes
- [x] "Call the vote" — 'Move to VOTING' does exactly this — close submissions early and open voting
- [x] Guard: only an admin may advance a week, and advancing must never reopen
      a closed one (that would let proof be added after reveal)

## Phase 2 — The judging loop

Proves people will judge. This is where the game becomes a game.

- [ ] Reveal at submission close
- [ ] Vote screen: rank entrants per objective
- [ ] Ratify flow for single-entrant objectives
- [ ] No self-voting, enforced server-side
- [ ] Scoring derived from votes on voting close
- [ ] Leaderboard: season points + medal table
- [ ] **Measure whether people finish voting** — the top risk in the design

## Phase 2 prerequisites carried over from Phase 1

- [ ] Authenticated media streaming route — Blob is private, so `get(pathname, { access: 'private' })` behind a Clerk check is required before any proof can be played back
- [ ] Do NOT treat `access: 'private'` as the reveal gate; the upload token cannot constrain it
- [ ] Point `test:integration` at a separate Neon branch — dev and production currently share one database
- [ ] Delete the previous blob when a submission is replaced

## Phase 3 — Retention

- [x] **Avatars** — rolled, not picked. Every feature (skin, hair style and
      colour, eyes, eyewear, mouth, shirt, freckles) derives from a single
      integer seed, so "roll again" is a new number and storage is one column.
      Drawn as inline SVG in `components/Avatar.tsx` — tens of thousands of
      combinations means nothing can be pre-rendered, and it is ~1/10th the
      bytes of the PNGs it replaced with no image requests at all
- [ ] **My Profile page** — every submission you have made, your points, your
      medal count, and your season ranking. One place a player can see their own
      run of the season. Depends on Phase 2 scoring existing. `/me` is the
      obvious home for it; it already exists and holds the avatar picker
- [ ] Navigation chrome: persistent header with home, profile and sign-out
      (see `docs/ISSUES.md` issues 1 and 5)
- [ ] Archive feed of past weeks
- [ ] Reactions on submissions
- [ ] Push notifications on drop and reveal
- [ ] Egress mitigations reviewed against real usage

## Phase 4 — Earned features

- [ ] In-app draft day
- [ ] Player-submitted objectives with group vote
- [ ] Per-challenge video borders
- [ ] Special objectives for players abroad

## Held in reserve

Fixes for voting load, to apply only if Phase 2 shows voting decaying:

- Vote on a random subset instead of the full field
- Two divisions of eight with a final
