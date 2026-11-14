-- The strategy a business was set up with (a "play" key from src/lib/plays.js), shown on its
-- workspace. Empty for businesses added before plays existed.
ALTER TABLE clients ADD COLUMN play TEXT NOT NULL DEFAULT '';
