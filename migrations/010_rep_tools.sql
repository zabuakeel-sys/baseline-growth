-- Rep tools: personal preview pages, instant quotes, briefs, referral partners, referral asks
-- and daily goals.

-- Personal page: where the "claim / book" button and QR code send the prospect. A ref code is
-- added so the client can tell which signups came from us.
ALTER TABLE clients
  ADD COLUMN claim_url     TEXT NOT NULL DEFAULT '',
  ADD COLUMN claim_label   TEXT NOT NULL DEFAULT '',
  -- Instant quote rules, e.g. {"types":[{"name":"Office","ratePer1000Cents":4500}],"minimumCents":40000,"rangePercent":10}
  ADD COLUMN pricing       JSONB;

-- Signals for the brief, copied from the business listing when a prospect is found.
ALTER TABLE leads
  ADD COLUMN rating          NUMERIC(2,1),
  ADD COLUMN reviews         INTEGER,
  ADD COLUMN partner_id      INTEGER,
  ADD COLUMN referred_by     INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN referral_asked  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN quote_cents     INTEGER CHECK (quote_cents >= 0);

-- Referral partners: businesses that send us prospects for a client, through a link of their own.
CREATE TABLE partners (
  id               SERIAL PRIMARY KEY,
  client_id        INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL DEFAULT '',
  contact_name     TEXT NOT NULL DEFAULT '',
  email            TEXT NOT NULL DEFAULT '',
  phone            TEXT NOT NULL DEFAULT '',
  code             TEXT NOT NULL UNIQUE,
  fee_cents        INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  assignee_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  active           BOOLEAN NOT NULL DEFAULT true,
  notes            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE leads ADD CONSTRAINT leads_partner_fk FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;

-- Daily goals per rep.
ALTER TABLE users
  ADD COLUMN goal_calls     INTEGER NOT NULL DEFAULT 0 CHECK (goal_calls >= 0),
  ADD COLUMN goal_visits    INTEGER NOT NULL DEFAULT 0 CHECK (goal_visits >= 0),
  ADD COLUMN goal_meetings  INTEGER NOT NULL DEFAULT 0 CHECK (goal_meetings >= 0);
