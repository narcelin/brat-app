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

## Phase 1 — The posting loop

Proves people will actually post. Nothing else matters if they won't.

- [ ] Next.js app replacing the static shell (keep manifest, service worker, colours)
- [ ] Postgres via Vercel Marketplace + schema
- [ ] Clerk auth, invite-only
- [ ] This Week screen: 3 objectives, tier badges, submission status
- [ ] In-app capture: photo, and video up to 60s via MediaRecorder
- [ ] Non-destructive trim (trim_start / trim_end metadata)
- [ ] Save full capture to camera roll
- [ ] Upload to Vercel Blob
- [ ] Week state machine: DROPPED -> SUBMITTING -> VOTING -> CLOSED
- [ ] Submissions hidden until submission window closes

## Phase 2 — The judging loop

Proves people will judge. This is where the game becomes a game.

- [ ] Reveal at submission close
- [ ] Vote screen: rank entrants per objective
- [ ] Ratify flow for single-entrant objectives
- [ ] No self-voting, enforced server-side
- [ ] Scoring derived from votes on voting close
- [ ] Leaderboard: season points + medal table
- [ ] **Measure whether people finish voting** — the top risk in the design

## Phase 3 — Retention

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
