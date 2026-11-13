-- The prospect finder: for each client, what kind of business to look for and where.
CREATE TABLE targets (
  id           SERIAL PRIMARY KEY,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  what         TEXT NOT NULL,              -- e.g. "independent auto repair shop"
  location     TEXT NOT NULL,              -- e.g. "Detroit, MI"
  exclude      TEXT NOT NULL DEFAULT '',   -- comma-separated names to skip, e.g. chains
  max_results  INTEGER NOT NULL DEFAULT 60 CHECK (max_results BETWEEN 1 AND 60),
  last_run_at  TIMESTAMPTZ,
  last_found   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Businesses the finder turned up, waiting for approval before they become prospects.
CREATE TABLE candidates (
  id            SERIAL PRIMARY KEY,
  client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  target_id     INTEGER REFERENCES targets(id) ON DELETE SET NULL,
  place_id      TEXT NOT NULL,
  name          TEXT NOT NULL,
  address       TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  website       TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  about         TEXT NOT NULL DEFAULT '',
  rating        NUMERIC(2,1),
  reviews       INTEGER,
  score         INTEGER NOT NULL DEFAULT 0,
  reasons       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'found' CHECK (status IN ('found', 'added', 'skipped')),
  lead_id       INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  researched_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, place_id)
);
CREATE INDEX candidates_queue_idx ON candidates (client_id, status, score DESC);
