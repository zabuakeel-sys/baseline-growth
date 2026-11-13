-- Sign-up from a website: answers drafted from the site, kept until the owner saves them.
CREATE TABLE onboarding_drafts (
  id          SERIAL PRIMARY KEY,
  website     TEXT NOT NULL,
  answers     JSONB NOT NULL,
  filled      TEXT[] NOT NULL DEFAULT '{}',   -- which answers came from the website
  used_ai     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The owner's standard deal terms, pre-filled for each new business.
ALTER TABLE outreach_settings
  ADD COLUMN default_terms JSONB;
