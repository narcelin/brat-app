# Open issues

Reported from real use on 2026-09-06, after the Phase 1 deploy. Nothing here is
fixed yet. Severity is my assessment, not the reporter's.

---

## 1. ~~No way back from an objective page~~ — **FIXED 2026-09-06**

Fixed together with issue 5 as one `AppHeader` — see below.

## 2. ~~Submission shows "Not submitted" after a successful upload~~ — **FIXED 2026-09-06**

**Root cause was the service worker, and the symptom pointed away from it.**

The database row and the app's own `getCurrentWeek` query were both verified
correct before any code changed, which ruled out the write and read paths.

`router.push('/')` is a *client-side* navigation, so its request is **not**
`mode: 'navigate'` — it is a plain fetch of `/?_rsc=...`. It therefore fell past
the worker's network-first navigate branch straight into the cache-first branch
and was cached permanently. The page then served that stale payload forever.
The network-first handler that looked like it covered this never saw the request.

Fix: `public/sw.js` now caches only an allowlist of immutable static assets
(`/_next/static/`, `/icons/`, the manifest, the favicon) and touches nothing
else. No HTML, no RSC payloads, no API responses.

This app cannot work offline anyway — every screen reads the database and
submitting needs the network — so there was never a real offline shell to lose,
and a stale week is worse than an honest network error.

`router.refresh()` now runs before `router.push('/')` so the client Router Cache
is cleared before navigating, rather than after.

Cache bumped to `brat-v5`; the activate handler purges anything else, so anyone
holding a poisoned `brat-v4` recovers on next load without clearing site data.

## 3. ~~"Save full recording" navigates away, and Back lands on a 404~~ — **FIXED 2026-09-06**

iOS Safari ignores `download=` on a `blob:` URL and navigates to it, replacing
the app; backing out then hits a revoked URL.

Fix: the save action is now a `<button>` that uses the Web Share API — which on
iOS is also the correct way to get a file into Photos — with a download fallback
for desktop.

The fallback opens in a **new context** (`target="_blank"`). This matters: a
same-tab anchor click was the original bug, so on any browser where `canShare`
returns false the first fix would have reproduced it exactly. Caught in review.

The share-vs-download decision lives in `lib/media/save.ts` as a pure tested
function, since that branch decides whether the bug can recur.

**Unverified:** whether iOS `canShare({ files })` returns true for the specific
MIME type MediaRecorder produces on that device. If it returns false the
fallback runs, which no longer breaks the app but opens a new tab rather than
saving directly. Needs a real device to confirm which path runs.

## 4. ~~Clerk requires a 15-character password~~ — **RESOLVED 2026-09-06**

Password requirements relaxed and sign-up switched to username instead of email,
in the Clerk dashboard. No code change was needed.

**Consequence worth knowing (not a bug):** `playerFromClerk` derives the display
name as `fullName || username || 'Brat'`. With username sign-up, `username` is now
populated, so players get their real handle on ballots — which matters, because
Phase 2 voting is unusable if everyone shows up as "Brat".

The one existing account still reads `display_name: "Brat"`, created before the
switch when it had neither field. `currentPlayer()` is read-before-write and
updates the name whenever Clerk's value changes, so **it self-heals on that
player's next sign-in**, provided their Clerk account now has a username set.
Nothing to do unless it is still "Brat" after signing in again.

## 5. ~~No sign-out and no home navigation~~ — **FIXED 2026-09-06**

Issues 1 and 5 were the same defect: the app had no navigation chrome at all.
Fixed with a single sticky `components/AppHeader.tsx` rendered from the root
layout on every route:

- The **brats** wordmark links home. The app is only ever two levels deep
  (This Week → an objective), so home *is* the back action and a separate back
  button would be redundant.
- Clerk's `<UserButton />` supplies sign-out and account management, gated on
  being signed in.
- Sticky, so both stay reachable from anywhere without scrolling — the original
  complaint was really that a link at the bottom of a long capture page is
  invisible on a phone.

Two things changed along the way:

- The bottom "← This week" link on the objective page was removed as redundant.
- The signed-out home page no longer repeats "brats" as its heading, since the
  header now shows it; it leads with "Brat Olympics" and the sign-in prompt.

Note for future Clerk work: `<SignedIn>` does **not** exist in `@clerk/nextjs`
Core 3. The replacement is `<Show when="signed-in">`. The build fails loudly if
you reach for the old name.

## 6. ~~Trim screen never plays the recording back~~ — **FIXED 2026-09-07**

The preview had no `controls` and nothing ever called `play()`, so it only
showed a seeked still: you picked in and out points without watching the clip.

There is now a play/pause control that plays **only the selected range** —
starts at `range.start`, stops at `range.end`, and resets so pressing play
again replays the selection. Native `controls` were deliberately not added:
the filmstrip is the scrubber, and a second scrubber would let you drag
outside the selection.

The three recorded decisions were honoured:

- **Audio unmutes on play.** The element stays `muted` in markup so the
  seed-on-load effect can still seek it on iOS without a gesture; playback is
  started by a real tap, which is allowed to have sound.
- **The filmstrip is untouched.** Frame grabbing still runs on its own
  detached element, so it never competes for `currentTime`.
- **Dragging a handle pauses playback**, so the playhead and the drag cannot
  fight over `currentTime`.

The end-stop reuses `clampPlaybackTime` from `lib/media/playback-clamp.ts`
rather than adding a second range check — the same tested function that keeps
voters from scrubbing into trimmed-out footage on the ballot. A new
`playStartPosition` decides where play begins when the playhead sits outside
the selection.

**Not verified on a real device.** The sandbox could not produce a genuine
multi-second recording (`MediaRecorder` throttles when the page is treated as
hidden), so the component was driven through real DOM and pointer events
against a stubbed media element instead. That proves the wiring, not that a
clip is audible and visible on an iPhone. Worth a spot-check.

## Notes carried over from the Phase 1 review

These were known at merge and are not new reports. Full detail in
`docs/ROADMAP.md` under Phase 2 prerequisites.

- Dev and production share one Neon database; `npm run test:integration` writes
  to live data.
- Replacing a submission orphans the previous blob.
- A player can delete their own already-accepted blob by re-posting an invalid
  body, leaving the row pointing at dead media.
- `handleUpload`'s token cannot constrain `access`, so Phase 2 must not treat
  `access: 'private'` as the reveal gate.

---

## Closed 2026-09-07 — test-infrastructure hazards

Both found by the Phase 2 whole-branch review, both fixed. Recorded because the
first one bit once before it was understood.

**A privacy assertion reached across test suites.** `privacy.test.ts` asserted
that a serialised roster contained no substring `"media"` — but the roster query
selects `FROM users` unscoped, so it was really asserting that *no user row
anywhere in the shared database* contained that word. Another suite's fixture
used `itest_media_*` ids and the two collided. It now asserts on the key set of
a roster entry, which says what it actually means: the roster carries no media
field. The two assertions checking this suite's own fixture secrets were kept —
they are correctly scoped.

**The integration fixtures could wedge themselves permanently.** Both created a
season with a plain INSERT against a UNIQUE name, with teardown that swallowed
failures. One failed teardown would have left the season behind, and every
subsequent run would then die in `beforeAll` with no way to clean up, because
the id was never assigned. Both now delete by name first, so a crashed run heals
itself on the next one.
