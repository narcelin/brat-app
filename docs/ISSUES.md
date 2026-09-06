# Open issues

Reported from real use on 2026-09-06, after the Phase 1 deploy. Nothing here is
fixed yet. Severity is my assessment, not the reporter's.

---

## 1. No way back from an objective page — **Important**

The objective page has a "← This week" link at the bottom, below the capture UI,
so on a phone it sits under the fold and reads as a dead end. There is no
persistent header or back affordance.

Fix direction: a real header on every screen, not a link at the bottom of a
scrolling page. This overlaps with issue 5 — both are the same missing piece of
navigation chrome.

---

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

## 4. Clerk requires a 15-character password — **Minor**

Too heavy for a 16-person friend group. This is a **Clerk dashboard setting, not
application code** — nothing in this repo controls it.

Change under User & Authentication → Email, Phone, Username → Password settings.
Worth considering email codes instead of passwords entirely; for a group this size
it removes the problem rather than tuning it.

---

## 5. No sign-out and no home navigation — **Important**

Once signed in there is no way to sign out, and no persistent way back to This
Week. Clerk's `<UserButton />` gives sign-out and account management in one
component and is the cheap fix.

Same root cause as issue 1: the app has no navigation chrome at all. Both should
be fixed together as one small header component rather than separately.

---

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
