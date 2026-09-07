# Media route: HTTP Range support fix

## Bug

`<video>` elements would not play on the voting screen, even for a player's
own submission. Root cause: `app/api/media/[...pathname]/route.ts` never
read the incoming `Request` (signature was `(_request, { params })`), so it
never saw the browser's `Range` header, never forwarded it to Vercel Blob,
and always returned a plain 200 with no `Accept-Ranges` / `Content-Length`.
iOS Safari refuses to play a video element without byte-range support (a
206 with `Content-Range`); Chrome tolerates it, which is why this shipped.

## Fix

`app/api/media/[...pathname]/route.ts`:
- `GET` now takes the real `request` and reads `request.headers.get('range')`.
- When present, the Range header is forwarded to `get()` via its `headers`
  option.
- The response now always advertises `Accept-Ranges: bytes`.
- The `@vercel/blob` `get()` SDK collapses any 2xx upstream response
  (206 included) into its own `statusCode: 200` — the true upstream status
  only survives via the raw `headers`. So the route inspects
  `blob.headers.get('content-range')`: when present it forwards `Content-Range`
  and `Content-Length` and answers 206; otherwise it answers a plain 200.
- `GetBlobResult`'s `statusCode: 304` branch (`stream: null`) is now handled
  explicitly and forwarded as a bodyless 304, instead of risking a 200 with
  a null body (previously latent/unreachable, now reachable once request
  headers — including conditional ones — are actually forwarded).
- All three guards (401 unauthenticated, 404 identical for
  unknown-vs-refused pathname, `canViewSubmission` reveal check) are
  unchanged and still run, in order, before any Range handling or blob read.

No changes to `lib/domain/submission-rules.ts`, `lib/db/media.ts`, or any
other route.

## Tests added (`tests/api/media-route.test.ts`)

- `call()` helper now builds a real `Request` so a `Range` header can be
  passed through.
- `partialBlob()` mock: `statusCode: 200` (per SDK behavior) with
  `content-range` / `content-length` headers set, simulating what the SDK
  hands back for a genuine 206 from origin.
- "forwards a Range request as a 206 with Content-Range, the way iOS Safari
  requires" — asserts 206, `Content-Range` forwarded, `Accept-Ranges: bytes`,
  and that `get()` was called with `{ headers: { range: 'bytes=0-99' } }`.
- "still advertises Accept-Ranges on a plain, un-ranged 200" — asserts a
  first, un-ranged request still gets `Accept-Ranges: bytes` on a 200.
- "still 404s a refused viewer even when a Range header is present" — proves
  a Range header cannot be used to route around `canViewSubmission`; also
  asserts `get()` was never called (the reveal check short-circuits before
  any blob read).

## Mutation proof (reveal guard)

Guard temporarily neutered in `app/api/media/[...pathname]/route.ts`:

```diff
- if (!canViewSubmission(owner.weekState, owner.userId, player.id)) {
+ if (false && !canViewSubmission(owner.weekState, owner.userId, player.id)) {
```

`npx vitest run tests/api/media-route.test.ts` with the guard disabled:

```
 FAIL  tests/api/media-route.test.ts > GET /api/media/[...pathname] > reports an unknown path and a refused-but-existing path identically
AssertionError: expected 404 to be 200 // Object.is equality
 ❯ tests/api/media-route.test.ts:78:28

 FAIL  tests/api/media-route.test.ts > GET /api/media/[...pathname] > still 404s a refused viewer even when a Range header is present
AssertionError: expected 200 to be 404 // Object.is equality
 ❯ tests/api/media-route.test.ts:170:24

 Test Files  1 failed (1)
      Tests  2 failed | 5 passed (7)
```

Guard restored, same command:

```
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Confirms the suite genuinely depends on the reveal check (including the
new Range-header test), not on a reset-mock accident.

## Full suite, with no env files present

`.env.development.local` and `.env.local` were moved out of the repo,
`npm test` run, then both files restored.

```
 Test Files  18 passed | 3 skipped (21)
      Tests  222 passed | 16 skipped (238)
```

219 baseline + 3 new Range-related tests = 222. All green, no env files
needed.

## Other verification

- `npx tsc --noEmit` — clean, no output.
- `npm run build` — compiled successfully, all routes (including
  `/api/media/[...pathname]`) built without error.

## Files changed

- `app/api/media/[...pathname]/route.ts`
- `tests/api/media-route.test.ts`

No secrets were printed or committed.
