CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'team')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE clients (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  industry          TEXT NOT NULL DEFAULT '',
  website           TEXT NOT NULL DEFAULT '',
  contact_name      TEXT NOT NULL DEFAULT '',
  contact_email     TEXT NOT NULL DEFAULT '',
  contact_phone     TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'prospect'
                    CHECK (status IN ('prospect', 'active', 'paused', 'ended')),
  -- Deal terms. Money is stored in whole cents.
  monthly_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_fee_cents >= 0),
  bonus_percent     NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (bonus_percent >= 0 AND bonus_percent <= 100),
  contract_start    DATE,
  minimum_months    INTEGER NOT NULL DEFAULT 6 CHECK (minimum_months >= 0),
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One baseline per client: the day-one numbers every growth bonus is measured against.
CREATE TABLE baselines (
  client_id             INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  monthly_revenue_cents INTEGER CHECK (monthly_revenue_cents >= 0),
  monthly_inquiries     INTEGER CHECK (monthly_inquiries >= 0),
  close_rate_percent    NUMERIC(5,2) CHECK (close_rate_percent >= 0 AND close_rate_percent <= 100),
  avg_sale_cents        INTEGER CHECK (avg_sale_cents >= 0),
  repeat_rate_percent   NUMERIC(5,2) CHECK (repeat_rate_percent >= 0 AND repeat_rate_percent <= 100),
  measured_on           DATE,
  signed_off            BOOLEAN NOT NULL DEFAULT false,
  signed_off_by         TEXT NOT NULL DEFAULT '',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
