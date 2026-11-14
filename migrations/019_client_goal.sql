-- A plain-English goal per business: what to drive every prospect toward. The AI uses it to write
-- every email and reply, so one sentence steers the whole campaign.
ALTER TABLE clients ADD COLUMN goal TEXT NOT NULL DEFAULT '';
