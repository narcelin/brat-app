# Brat Olympics — Design

**Date:** 2026-09-06
**Status:** Approved
**App:** https://brats.anico.dev

## Summary

Brat Olympics is a weekly scavenger-hunt game for a closed group of ~16 friends,
delivered as an installable PWA. Each week three objectives drop. Players submit
photo or video proof. Proof stays hidden until the submission window closes, then
the whole group votes to rank each objective. Votes decide the points, so voting
serves as both scoring and verification.

The proof is the product. The scoreboard is the pretext that makes people generate it.

## Game rules

### Weekly cycle

Three objectives per week, one from each tier. The week runs through four states:

```
DROPPED -> SUBMITTING -> VOTING -> CLOSED
```

Submissions **must** close before voting opens. Otherwise early voters rank a
partial field and late submitters get to see the competition before deciding what
to do.

Submissions are hidden until the submission window closes. This prevents copying
and one-upping, and turns reveal into a synchronised event — everyone opens the
app at once to see what everyone did.

### Tiers and scoring

Objectives are tagged with a tier, which fixes the medal values. Tiers exist so
nobody argues over whether a specific objective is worth 25 or 30 points.

| Tier | 1st | 2nd | 3rd | Effort |
|---|---|---|---|---|
| Easy | 15 | 10 | 5 | 2 |
| Hard | 30 | 20 | 10 | 3 |
| Unhinged | 50 | 35 | 20 | 5 |

Effort points go to every entrant who did not medal. The effort-to-gold ratio is
roughly 1:10, deliberately — posting garbage on every objective to farm effort
points is never competitive with genuinely attempting one thing. The exploit is
not worth engineering against because the numbers already make it pointless.

Season totals accumulate across weeks.

### Voting

- Every player votes on every objective, whether or not they entered it.
- Voters rank as many places as there are entrants. Four entrants means rank three;
  two entrants means rank two; and so on.
- **No self-voting.** Vote integrity depends on the app knowing who you are, which
  is why identity must be real.
- An objective with a **single entrant** gets a yes/no ratify vote instead of a
  ranked ballot — "did they actually do this?" A majority of the ratify votes
  actually cast (not of the whole group) awards 1st place.
  Without this, an uncontested entry would score without anyone verifying it, and
  voting is the only verification mechanism in the game.
- Only as many places are awarded as there were entrants. Nobody wins a medal in a
  race they ran alone.

### Deliberate non-features

- **Vote trading is allowed.** Two friends can collude to lock a podium. They will
  do this as a bit. Social roasting handles it; engineering against it would cost
  more than it saves.
- **Uncontested objectives pay full freight.** If one person attempts the Unhinged
  objective, they take 50 points and they earned it. Difficulty is already priced
  into the tier, so no additional correction is needed.
- **No location tracking.** The game was described as "manhunt style", but every
  mechanic in it is a scavenger hunt. Targeted objectives ("tag Mikey") deliver the
  manhunt energy without real-time location, which would be a far heavier build
  with real privacy stakes.
- **Voting is not gated on participation.** Everyone votes regardless of whether
  they submitted, so players who cannot complete an objective (e.g. friends abroad)
  stay involved. Effort points already provide the incentive to show up.

## Architecture

Next.js (App Router) on Vercel. Postgres via Vercel Marketplace (Neon). Vercel Blob
for media. Clerk for auth. One vendor, no new bills at this scale.

The existing static PWA is a shell to be rebuilt inside. Only the manifest, service
worker and colour scheme survive.

### Data model

```
users          id, display_name, avatar_url
seasons        id, name, is_active
weeks          id, season_id, number, drops_at, submissions_close_at, voting_closes_at
objectives     id, week_id, title, description, tier
submissions    id, objective_id, user_id, media_url, media_type,
               trim_start, trim_end, created_at
votes          id, objective_id, voter_id, submission_id, rank
ratifications  id, submission_id, voter_id, approved
```

Scores are **derived from votes, not stored**, and recomputed when voting closes.
A miscast vote is then fixable without corrupting history.

### Media capture

Recording happens in-app via `MediaRecorder`, not via camera-roll upload. This is
a deliberate constraint:

- iPhones record HEVC, which does not play in every browser. In-app capture
  produces web-compatible H.264 directly, eliminating the "works on my phone,
  black screen for everyone else" class of bug.
- Files stay small enough to upload over bad cell service.
- In-app capture is harder to fake, which supports the verification model.

The cost is that you cannot post a video someone else filmed of you. Accepted.

**Trimming is non-destructive.** Record up to 60 seconds, then store `trim_start`
and `trim_end` as metadata rather than cutting the file. The player plays only that
range. This avoids transcoding entirely (no ffmpeg.wasm, no job queue, no
"processing…" state), preserves the full capture for free, and makes trims
re-editable. The full version stays viewable in-app alongside the trimmed one.

**The trimmed range is capped at 15 seconds.** Recording length is capped at 60s
and drives file size; trim length drives *viewing* time, which is the voting-load
risk. Sixteen entrants at 60s each would be 16 minutes to review a single
objective. Capping the feed at 15s per submission keeps a full week's voting under
15 minutes, with the untrimmed version one tap away for anyone who wants it.

Saving the whole capture to the camera roll happens client-side at record time.

Photos are resized client-side to ~1600px before upload.

### Screens

| Screen | Purpose |
|---|---|
| This Week | Three objectives with tier badges, submission status, capture button |
| Capture | Record <=60s or photo, trim, preview, confirm |
| Vote | Per objective, rank entrants, or ratify if uncontested |
| Leaderboard | Season points and medal table |
| Archive | Past weeks, all proof, permanent |

## Known risks

**Voting load is the top risk to the game surviving.** With 16 players, an
objective can have 16 entrants, so ranking a top three means reviewing up to 48
videos a week — roughly 12 minutes of watching before casting a single vote.

Ship Phase 2 as designed and measure whether people actually finish voting. Two
fixes held in reserve:

1. Vote on a random subset rather than the full field.
2. Split into two divisions of eight with a final.

**Egress, not storage, is the cost driver.** ~384 submissions per season at ~10MB
is ~4GB stored, which is trivial. But 16 players watching everything during voting
runs to tens of GB of egress per season. Mitigations built in from the start: cap
the bitrate, lazy-load video, default the feed to the trimmed range.

## Out of scope for season 1

Draft day (group-ranking objectives into tiers) and player-submitted objectives run
in a spreadsheet. Both are once-per-season events. Building flows for something used
once, before the core loop is proven, is the wrong order. Seed the results into the
app, run eight weeks, and let the game earn those features.

Per-challenge video borders are a Phase 4 idea.
