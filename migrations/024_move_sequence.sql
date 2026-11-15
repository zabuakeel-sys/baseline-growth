-- Where each lead is in its multichannel move sequence (LinkedIn, then mail, then a gift), so a rep
-- does one move at a time and the system remembers the next one.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS move_step    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS move_next_on DATE;
