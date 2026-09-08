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
      — **deliberately not building this** (decided 2026-09-08). The 24
      placeholder objectives already exist, 3 per week with one of each tier,
      so draft day is a rename rather than a create. Applying 24 titles by hand
      once does not justify an editor. Revisit if season 2 needs it.

      Renaming an objective that already has submissions relabels proof people
      have posted — week 1 had submissions as of this decision, weeks 2-8 were
      empty.
- [x] **Advance the week manually** — force `SUBMITTING → VOTING → CLOSED`
      rather than waiting on timestamps. `weekState()` stays the fallback when
      no manual override is set, so the game still runs itself if nobody
      intervenes
- [x] "Call the vote" — 'Move to VOTING' does exactly this — close submissions early and open voting
- [x] Guard: only an admin may advance a week, and advancing must never reopen
      a closed one (that would let proof be added after reveal)

## Phase 2 — The judging loop ✅ SHIPPED 2026-09-07

Proves people will judge. This is where the game becomes a game.

- [x] Reveal at submission close
- [x] Vote screen: rank entrants per objective
- [x] Ratify flow for single-entrant objectives
- [x] No self-voting, enforced server-side
- [x] Scoring derived from votes on voting close
- [x] Leaderboard: season points + medal table
- [ ] **Measure whether people finish voting** — the top risk in the design

## Phase 2 prerequisites carried over from Phase 1

- [x] Point `test:integration` at a separate Neon branch — guarded by a
      `test_branch_marker` row the database itself must carry, so a wrong env
      file fails closed rather than writing to production. See `docs/TESTING.md`
- [x] Delete the previous blob when a submission is replaced — `addRandomSuffix`
      puts every upload on a new key, so each replacement orphaned a file that
      nothing referenced and nobody could reach

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

## Possible changes

Not committed and not bugs. Ideas worth considering, kept here so they are not
lost. Nothing in this section is scheduled.

- **Pick a place when voting, instead of ranking by tap order.** Today "Rank
  this one" appends to a list, so the first entry you tap is #1 and the second
  is #2; fixing a mistake means removing an entry and re-tapping the rest in
  order (`toggle()` in `components/BallotCard.tsx`). The alternative is a menu
  of the places still on offer, so you can hand someone #2 directly.

  How many places to show is **already decided in code** — `lib/domain/ballot.ts`
  computes `expected = min(placesAwarded(entrants), rankable)`, capped at
  `MAX_PLACES = 3` and reduced by one when the voter is an entrant. Four-plus
  entrants offer 1, 2, 3; two entrants offer 1, 2; one entrant is a ratify vote
  with no ranking. A menu should read that number, not hardcode three.

  Open questions if it is ever picked up: whether choosing a taken place swaps
  the two entries or is simply blocked, and how you clear a pick once "tap it
  again" is no longer the gesture. `validateBallot` already gates Save on the
  ballot being exactly `expected` long, so this is a `BallotCard` change with
  no server work.

- **Upload proof from the photo library, instead of only capturing in-app.**
  The picker is the easy part: `<input type="file" accept="image/*,video/*">`
  hands back a `File`, and everything downstream of capture in
  `components/SubmitFlow.tsx` — the Trimmer, the blob upload — is already
  `File`-based and does not care where the file came from.

  What makes it non-trivial is that three of our constraints assume we encoded
  the file ourselves:

  - **Length.** `validateTrim` rejects `duration > MAX_RECORDING_SECONDS` (60s)
    server-side, and trims are non-destructive metadata, so the whole file
    still uploads. A three-minute clip from Photos cannot be trimmed under the
    limit — it has to be cut, which means client-side transcoding.
  - **Size.** `MAX_UPLOAD_BYTES` is 25MB, sized for our ~1.5 Mbps capture. A 4K
    iPhone clip passes that in roughly 25 seconds, and again trimming does not
    help.
  - **Codec.** iPhones write HEVC in a `.mov`. It plays on other iPhones and
    fails on Android and desktop Chrome. In-app capture avoids this by owning
    the encoder.

  **Photos only would be easy** — no duration or codec problem, and stills are
  small enough that the size cap is never in play. Library *video* needs
  transcoding to do honestly. If this is ever picked up, do the two separately.

  There is also a game question, not just a technical one: in-app capture
  proves the media was made this week for this objective. A library upload does
  not. That may be desirable — the good shot happened before you opened the app
  — but it is a rule change and belongs in the design doc, not just the code.

## Held in reserve

Fixes for voting load, to apply only if Phase 2 shows voting decaying:

- Vote on a random subset instead of the full field
- Two divisions of eight with a final
