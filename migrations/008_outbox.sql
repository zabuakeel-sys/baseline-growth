-- Automatic outreach: one settings row, the outbox of messages, and replies read from the mailbox.
CREATE TABLE outreach_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_send       BOOLEAN NOT NULL DEFAULT false,   -- false = every message waits for approval
  daily_limit     INTEGER NOT NULL DEFAULT 20 CHECK (daily_limit BETWEEN 1 AND 200),
  start_hour      INTEGER NOT NULL DEFAULT 9 CHECK (start_hour BETWEEN 0 AND 23),
  end_hour        INTEGER NOT NULL DEFAULT 17 CHECK (end_hour BETWEEN 1 AND 24),
  last_run_at     TIMESTAMPTZ,
  last_error      TEXT NOT NULL DEFAULT ''
);
INSERT INTO outreach_settings (id) VALUES (1);

CREATE TABLE outbox (
  id           SERIAL PRIMARY KEY,
  lead_id      INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  touch        INTEGER NOT NULL,
  to_email     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'sent', 'failed', 'cancelled')),
  message_id   TEXT,
  in_reply_to  TEXT,
  error        TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at  TIMESTAMPTZ,
  sent_at      TIMESTAMPTZ,
  UNIQUE (lead_id, touch)
);
CREATE INDEX outbox_status_idx ON outbox (status, created_at);
CREATE UNIQUE INDEX outbox_message_id_idx ON outbox (message_id) WHERE message_id IS NOT NULL;

CREATE TABLE replies (
  id           SERIAL PRIMARY KEY,
  lead_id      INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  message_id   TEXT NOT NULL UNIQUE,
  from_email   TEXT NOT NULL,
  subject      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL CHECK (kind IN ('reply', 'not_interested', 'opt_out', 'auto', 'bounce')),
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX replies_lead_idx ON replies (lead_id, received_at DESC);

-- When the prospect was emailed to the client.
ALTER TABLE leads ADD COLUMN handed_over_at TIMESTAMPTZ;
