-- Searches that failed (e.g. Google refused the key) were marked as run and would have been
-- skipped for 30 days. A search that finished always records last_found, so these never ran.
UPDATE targets SET last_run_at = NULL WHERE last_run_at IS NOT NULL AND last_found IS NULL;
