-- Zaino narrowed the client list to LibraPro and AutoAt on 2026-11-13.
-- Remove the two seeded clients that were dropped. A client with any recorded work
-- (a baseline or a checkup) is only marked ended, never deleted, so no data is lost.
DELETE FROM clients c
WHERE c.name IN ('MAXPRO Fitness', 'Wedding business')
  AND NOT EXISTS (SELECT 1 FROM baselines b WHERE b.client_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM checkups k WHERE k.client_id = c.id);

UPDATE clients SET status = 'ended'
WHERE name IN ('MAXPRO Fitness', 'Wedding business');
