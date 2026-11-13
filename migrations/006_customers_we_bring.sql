-- The business model: we find prospects for each client, reach them, and introduce the
-- interested ones. A prospect who buys becomes a customer we brought, and the client pays us
-- a share of what that customer spends (and/or a fee per signup).

-- Deal terms. A share of each brought customer's revenue, for share_months months from the
-- month they became a customer (NULL = for as long as they stay), plus an optional fee per
-- signup and an optional flat monthly fee. bonus_percent (growth over baseline) is retired.
ALTER TABLE clients
  ADD COLUMN share_percent    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (share_percent >= 0 AND share_percent <= 100),
  ADD COLUMN share_months     INTEGER CHECK (share_months > 0),
  ADD COLUMN signup_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (signup_fee_cents >= 0),
  -- One sentence on what the client offers, used in outreach messages.
  ADD COLUMN offer            TEXT NOT NULL DEFAULT '',
  -- Postal address printed under outreach emails (US law requires one in commercial email).
  ADD COLUMN mailing_address  TEXT NOT NULL DEFAULT '';

-- Prospects keep the leads table. New stages: introduced to the client, became a customer,
-- and asked not to be contacted.
ALTER TABLE leads DROP CONSTRAINT leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'following_up', 'talking', 'introduced', 'won', 'lost', 'opted_out'));
ALTER TABLE leads
  ADD COLUMN introduced_on   DATE,
  ADD COLUMN customer_since  DATE;
-- Existing won leads count as customers from the day they were closed.
UPDATE leads SET customer_since = closed_on WHERE status = 'won' AND customer_since IS NULL;

-- What each brought customer paid the client, month by month, as the client reports it.
CREATE TABLE customer_revenue (
  lead_id        INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  month          DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  revenue_cents  INTEGER NOT NULL CHECK (revenue_cents >= 0),
  confirmed      BOOLEAN NOT NULL DEFAULT false,
  confirmed_by   TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, month)
);
