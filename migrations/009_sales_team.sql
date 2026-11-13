-- Sales team workspace: logged calls and visits, meetings, next steps, scripts and commission.

-- Every call, visit, email or LinkedIn message a rep logs, with its outcome.
CREATE TABLE activities (
  id          SERIAL PRIMARY KEY,
  lead_id     INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('call', 'visit', 'email', 'linkedin')),
  outcome     TEXT NOT NULL CHECK (outcome IN ('no_answer', 'voicemail', 'gatekeeper', 'talked', 'meeting_booked', 'signed', 'not_interested', 'wrong_number')),
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activities_lead_idx ON activities (lead_id, created_at DESC);
CREATE INDEX activities_user_idx ON activities (user_id, created_at);

-- Meetings booked for the client (walkthroughs, calls, visits) and whether they happened.
CREATE TABLE meetings (
  id          SERIAL PRIMARY KEY,
  lead_id     INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  booked_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'Meeting',
  location    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'held', 'no_show', 'cancelled')),
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX meetings_when_idx ON meetings (starts_at);

ALTER TABLE leads
  ADD COLUMN next_action_on DATE,
  ADD COLUMN next_action    TEXT NOT NULL DEFAULT '',
  ADD COLUMN won_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN address        TEXT NOT NULL DEFAULT '';
-- Customers already recorded are credited to whoever was assigned to them.
UPDATE leads SET won_by = assignee_id WHERE status = 'won' AND won_by IS NULL;

-- What reps say on the phone or at the door for this client.
ALTER TABLE clients ADD COLUMN call_script TEXT NOT NULL DEFAULT '';

-- Commission: the rep's percent of what we earn on the customers they won.
ALTER TABLE users ADD COLUMN commission_percent NUMERIC(5,2) NOT NULL DEFAULT 0
  CHECK (commission_percent >= 0 AND commission_percent <= 100);
