-- Step 4: the work. Tasks come from a checkup's plan or are added by hand.
CREATE TABLE tasks (
  id           SERIAL PRIMARY KEY,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  checkup_id   INTEGER REFERENCES checkups(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  area         TEXT NOT NULL DEFAULT '',
  assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_on       DATE,
  done_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_open_idx ON tasks (due_on) WHERE done_at IS NULL;
CREATE INDEX tasks_client_idx ON tasks (client_id);

-- A checkup's plan is turned into tasks once; this stops it being added twice.
ALTER TABLE checkups ADD COLUMN tasks_created_at TIMESTAMPTZ;

-- Step 5: each month's numbers, compared against the signed baseline.
CREATE TABLE monthly_results (
  client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month          DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  revenue_cents  INTEGER NOT NULL CHECK (revenue_cents >= 0),
  inquiries      INTEGER CHECK (inquiries >= 0),
  new_customers  INTEGER CHECK (new_customers >= 0),
  notes          TEXT NOT NULL DEFAULT '',
  confirmed      BOOLEAN NOT NULL DEFAULT false,
  confirmed_by   TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, month)
);

-- Step 6: money. A contract can end; fees stop after the end month.
ALTER TABLE clients ADD COLUMN contract_end DATE;

CREATE TABLE payments (
  id           SERIAL PRIMARY KEY,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month        DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  received_on  DATE NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_client_idx ON payments (client_id, month);
