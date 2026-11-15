-- Map coordinates for prospects, so visits can be ordered into the shortest route from where the
-- rep is. Filled by the finder (OSM/Google return them) or geocoded from the address on demand.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
