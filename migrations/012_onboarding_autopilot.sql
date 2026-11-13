-- Onboarding answers and autopilot.
ALTER TABLE clients
  ADD COLUMN onboarding           JSONB,                                   -- the owner's answers, kept for editing
  ADD COLUMN why_us               TEXT NOT NULL DEFAULT '',
  ADD COLUMN first_step           TEXT NOT NULL DEFAULT '',
  ADD COLUMN customer_value_cents INTEGER CHECK (customer_value_cents >= 0),
  ADD COLUMN autopilot            BOOLEAN NOT NULL DEFAULT true,           -- find, add and assign prospects daily
  ADD COLUMN daily_prospects      INTEGER NOT NULL DEFAULT 25 CHECK (daily_prospects BETWEEN 0 AND 500);

-- One search per type and place per client.
CREATE UNIQUE INDEX targets_unique_idx ON targets (client_id, lower(what), lower(location));

-- Google searches cost money: autopilot runs at most this many a day across all clients.
ALTER TABLE outreach_settings
  ADD COLUMN max_searches_per_day INTEGER NOT NULL DEFAULT 10 CHECK (max_searches_per_day BETWEEN 0 AND 500),
  ADD COLUMN last_autopilot       TEXT NOT NULL DEFAULT '';
