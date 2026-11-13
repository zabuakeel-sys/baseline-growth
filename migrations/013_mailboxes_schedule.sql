-- A mailbox per client (the address the client gave us), the mixed schedule, AI reply drafts.

CREATE TABLE client_mailboxes (
  client_id     INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  from_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  provider      TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'other')),
  smtp_host     TEXT NOT NULL,
  smtp_port     INTEGER NOT NULL,
  smtp_secure   BOOLEAN NOT NULL,
  imap_host     TEXT NOT NULL,
  imap_port     INTEGER NOT NULL,
  imap_secure   BOOLEAN NOT NULL,
  username      TEXT NOT NULL,
  -- Encrypted with APP_SECRET (AES-256-GCM); never stored or shown in plain text.
  password_enc  TEXT NOT NULL,
  daily_limit   INTEGER NOT NULL DEFAULT 20 CHECK (daily_limit BETWEEN 1 AND 200),
  verified_at   TIMESTAMPTZ,
  last_error    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clients
  ADD COLUMN visits    BOOLEAN NOT NULL DEFAULT false,   -- local business: reps visit in person
  ADD COLUMN logo_url  TEXT NOT NULL DEFAULT '';

-- Where each prospect is in the mixed schedule, and how many rep steps were skipped as missed.
ALTER TABLE leads
  ADD COLUMN cadence_step  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN steps_missed  INTEGER NOT NULL DEFAULT 0;
-- Prospects already mid-sequence continue after the emails they already got.
UPDATE leads SET cadence_step = CASE touches_sent WHEN 0 THEN 0 WHEN 1 THEN 1 WHEN 2 THEN 3 WHEN 3 THEN 5 ELSE 7 END
  WHERE status IN ('new', 'following_up');

-- Outbox holds schedule emails and AI reply drafts; replies have no schedule position.
ALTER TABLE outbox
  ALTER COLUMN touch DROP NOT NULL,
  ADD COLUMN kind      TEXT NOT NULL DEFAULT 'sequence' CHECK (kind IN ('sequence', 'reply')),
  ADD COLUMN step      INTEGER,
  ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE;
UPDATE outbox o SET client_id = l.client_id FROM leads l WHERE l.id = o.lead_id;

-- Which mailbox a reply arrived in (NULL = the shared outreach mailbox).
ALTER TABLE replies ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;

-- AI reply drafts: which reply they answer and what the prospect seems to want.
-- sent_via records which mailbox sent a message ('shared' or 'client:<id>') for per-mailbox daily limits.
ALTER TABLE outbox
  ADD COLUMN reply_id  INTEGER REFERENCES replies(id) ON DELETE SET NULL,
  ADD COLUMN intent    TEXT NOT NULL DEFAULT '',
  ADD COLUMN sent_via  TEXT NOT NULL DEFAULT '';
UPDATE outbox SET sent_via = 'shared' WHERE status = 'sent';
CREATE UNIQUE INDEX outbox_reply_draft_idx ON outbox (reply_id) WHERE reply_id IS NOT NULL;
