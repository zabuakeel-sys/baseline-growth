-- Approve a business's outreach once: after that its schedule emails send without per-email approval.
ALTER TABLE clients ADD COLUMN outreach_approved_at TIMESTAMPTZ;
