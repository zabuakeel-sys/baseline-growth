-- A search that fails (the free map service timing out, Google over its daily quota) waits a while
-- before it is tried again, so one bad search never blocks every other search for that business.
ALTER TABLE targets
  ADD COLUMN IF NOT EXISTS failed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fail_count INTEGER NOT NULL DEFAULT 0;
