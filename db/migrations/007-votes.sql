-- File: db/migrations/007-votes.sql

CREATE TABLE IF NOT EXISTS votes (
  id           SERIAL PRIMARY KEY,
  objective_id INTEGER NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  voter_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place        SMALLINT NOT NULL CHECK (place BETWEEN 1 AND 3),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A voter fills each place once per objective...
  UNIQUE (objective_id, voter_id, place),
  -- ...and ranks each player at most once.
  UNIQUE (objective_id, voter_id, submission_user_id),
  -- No self-voting, enforced by the database as well as the domain layer.
  CHECK (voter_id <> submission_user_id)
);

CREATE TABLE IF NOT EXISTS ratifications (
  id           SERIAL PRIMARY KEY,
  objective_id INTEGER NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  voter_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approved     BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (objective_id, voter_id)
);

CREATE INDEX IF NOT EXISTS votes_objective_idx ON votes(objective_id);
CREATE INDEX IF NOT EXISTS ratifications_objective_idx ON ratifications(objective_id);
