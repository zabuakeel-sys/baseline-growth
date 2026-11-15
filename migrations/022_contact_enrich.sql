-- Who to contact at each prospect, found from the business website, Hunter and Apollo.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS website        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_name   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_title  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_source TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS enriched_at    TIMESTAMPTZ;

-- Finding a contact costs credits (Apollo / Hunter), so cap how many new prospects are enriched a day.
ALTER TABLE outreach_settings
  ADD COLUMN IF NOT EXISTS enrich_daily_limit INTEGER NOT NULL DEFAULT 25 CHECK (enrich_daily_limit BETWEEN 0 AND 500);
