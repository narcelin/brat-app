-- Invite codes, and who redeemed them.
--
-- Public sign-up is open, so a Clerk session proves nothing. A `users` row is
-- what admits someone to the game, and redeeming a live code is the only way
-- to get one. Players who predate this migration keep their rows and are
-- admitted by having one — no backfill of redemptions is needed or wanted.

CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses   INTEGER NOT NULL CHECK (max_uses > 0),
  revoked_at TIMESTAMPTZ,
  -- A code that expires before it is created can never admit anyone, and is
  -- always a mistake in the caller rather than a choice.
  CHECK (expires_at > created_at)
);

-- Uses are counted from these rows rather than a counter on `invites`.
-- Counting is idempotent: someone already admitted re-opening the link cannot
-- burn a second use, because the primary key refuses the duplicate. It also
-- records who joined on which code, which a counter cannot.
CREATE TABLE IF NOT EXISTS invite_redemptions (
  code        TEXT NOT NULL REFERENCES invites(code) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (code, user_id),
  -- One admission per person, whichever code they used. Without this a player
  -- could be counted against two codes.
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS invite_redemptions_code_idx ON invite_redemptions (code);
