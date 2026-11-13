-- A Revenue Checkup taken with a client. Answers are stored raw (ratings 1-5 per statement);
-- scores and the 90-day plan are computed from them in code, so improving the scoring
-- never leaves old checkups with stale numbers.
CREATE TABLE checkups (
  id             SERIAL PRIMARY KEY,
  client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conducted_on   DATE NOT NULL,
  conducted_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  answers        JSONB NOT NULL,
  notes          JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary        TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX checkups_client_idx ON checkups (client_id, conducted_on DESC);
