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

## Phase 2.5 — Running a live season

Agreed 2026-09-09. None of this is built. These are the controls a season with
real players needs and season 0 did not, ordered by when they will first hurt.
Shipped so far: force the week forward, clear an override, turnout counts, and
a full season reset.

- [ ] **Let a player delete their own submission.** Self-service, for the wrong
      video, a duplicate, or something posted and regretted. Today the only
      remedy is replacing it, which still needs a second recording.

      Must delete the row, its blob, **and every vote cast for it**. Votes
      reference `objectives` and `users`, not `submissions`, so they do not
      cascade — left behind they score proof that no longer exists. Same trap
      the season reset had to handle explicitly.

      Open question: whether deleting is allowed once voting has opened.
      Withdrawing an entry after people have ranked it changes their ballots
      under them, and `validateBallot` requires a ballot exactly as long as the
      entrant count. Probably restrict to SUBMITTING.

      Distinct from admin removal below: this is the owner tidying up after
      themselves, and needs no judgement call.

- [ ] **Admin removal of any submission.** For when something needs to come
      down and its owner will not, or cannot, take it down — genuinely
      offensive content, something that outs a person who did not consent to
      being filmed, or an entry that plainly breaks the objective.

      Shares its machinery with player self-delete (row, blob, and the votes
      cast for it), so build that first and widen it. What differs is
      everything around it:

      - **It must be visible.** Silent removal by an organiser who is also a
        competitor is indistinguishable from removing a rival. The entrant
        should know their proof was taken down, and ideally the group should
        see that something was removed rather than the entry simply vanishing.
      - **Allowed after voting opens**, unlike self-delete — the cases that
        justify it mostly surface once everyone can see the proof. That means
        accepting the ballot problem self-delete avoids: `validateBallot`
        requires a ballot exactly as long as the entrant count, so removing an
        entrant mid-vote invalidates saved ballots. Decide whether those
        ballots are truncated, re-prompted, or the objective is voided.
      - **Never a scoring tool.** Removing an entry changes who medals. Pair it
        with the rule in "Deliberately not building" below: it exists for
        content that should not be up, not for results the organiser dislikes.

      Worth deferring until something actually needs removing. Sixteen friends
      is a context where a message in the group chat usually settles it, and a
      power that rescores a week is worth not having until it is needed.

- [ ] **Nudge list — who has not posted, and who has not voted, by name.**
      Turnout gives counts (`3/5`); chasing people in the group chat needs
      names. `getObjectiveRoster` already computes who has submitted, so this
      is largely a display change; the not-yet-voted half needs the same shape
      over `votes`/`ratifications`.

- [ ] **Extend a deadline.** Move one week's `submissions_close_at` (and the
      voting window with it) without touching the rest of the season. Today
      the only way is to force SUBMITTING and remember to close it by hand.

      Now possible because `weeks_no_overlap` is DEFERRABLE (migration 010) —
      shifting a window past the next week's start needs the whole reschedule
      to commit as one transaction with `SET CONSTRAINTS ... DEFERRED`.

- [ ] **Reopen a closed week.** `canForceState` refuses every transition out of
      CLOSED, and `canClearOverride` refuses to hand a closed week back to its
      clock. That guard is correct and should not simply be removed.

      Split it: reopening **voting** is comparatively safe. Reopening
      **submissions** after reveal lets someone post having already seen
      everyone else's proof, and should stay impossible.

- [ ] **Mark a player inactive.** For someone who drops out mid-season.
      Deleting the user cascades their submissions and votes and silently
      rewrites finished weeks. A flag is the honest version: drop them from
      turnout denominators and the standings going forward, leave past results
      exactly as they were scored.

- [ ] **Grant admin to another player.** Admin is Clerk `publicMetadata`
      today, so promoting a co-organiser means a trip to the Clerk dashboard.
      Low frequency — worth doing only if you actually want a second organiser.

### Deliberately not building

- **Editing medal values, tiers, or votes after the fact.** Each one lets the
  organiser change results after seeing them, and the organiser is also a
  competitor. The reset button is already the only way to destroy results;
  keep it the only one.
- **An admin objective editor** — see the entry under Phase 1.5.

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
