-- Inquiries a client receives, and our follow-up on each until it is won or lost.
CREATE TABLE leads (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL DEFAULT '',
  need            TEXT NOT NULL DEFAULT '',
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The local (Michigan) day it arrived; the follow-up schedule counts from this day.
  received_on     DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'following_up', 'talking', 'won', 'lost')),
  touches_sent    INTEGER NOT NULL DEFAULT 0 CHECK (touches_sent >= 0),
  first_touch_at  TIMESTAMPTZ,
  last_touch_at   TIMESTAMPTZ,
  assignee_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  won_value_cents INTEGER CHECK (won_value_cents >= 0),
  lost_reason     TEXT NOT NULL DEFAULT '',
  closed_on       DATE,
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX leads_open_idx ON leads (received_on) WHERE status IN ('new', 'following_up');
CREATE INDEX leads_client_idx ON leads (client_id, received_on DESC);
