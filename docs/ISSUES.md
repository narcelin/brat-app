# Open issues

Reported from real use on 2026-09-06, after the Phase 1 deploy. Nothing here is
fixed yet. Severity is my assessment, not the reporter's.

---

## 1. ~~No way back from an objective page~~ — **FIXED 2026-09-06**

Fixed together with issue 5 as one `AppHeader` — see below.

## 2. Submission shows "Not submitted" after a successful upload — **Critical**

Reported as "I tried to submit a video but then says not submitted still."

**Not a data problem, and nothing to do with the placeholder objectives.**
Verified directly against the database: the upload succeeded and the row exists —
submission id 20, objective 1 ("Jump in a bush"), `media_type` video, with a valid
`media_pathname`. Running the app's own `getCurrentWeek` query for that user
returns `submission_id: 20` on objective 1, exactly as it should.

So the write path and the read path are both correct. **The page is rendering
stale HTML.** Two likely causes, in order:

1. `public/sw.js` caches navigation responses into a shared cache and precaches
   `/` at install time — and the `/` it precaches is the *signed-out* page. The
   final review flagged this (its comment argues API responses must not be cached
   because they are per-user, then caches personalized HTML one branch above).
2. The Next.js App Router client cache: `SubmitFlow` calls `router.push('/')`
   then `router.refresh()`, which may resolve in the wrong order.

Fix direction: stop the service worker caching authenticated navigation HTML at
all, then re-test before touching the router logic. Worth confirming which of the
two it is before changing both.

---

## 3. "Save full recording" navigates away, and Back lands on a 404 — **Important**

Two bugs in one flow:

- The save link is a plain `<a href={blobUrl} download>`, so tapping it navigates
  the page instead of downloading in place. On iOS Safari the `download`
  attribute is not honoured for blob URLs the way it is on desktop.
- Backing out of that view hits a Vercel 404, because the blob URL was never a
  real route and there is nothing to return to.

Fix direction: trigger the save without navigating — a programmatic click on a
detached anchor, or the Web Share API on iOS, which is the more native path for
"save this video to my phone".

---

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
