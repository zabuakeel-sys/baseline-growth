-- Zaino asked on 2026-11-13 to remove LibraPro and AutoAt and set them up again from the start
-- through the new onboarding questions. Removes them (and the two clients dropped earlier, if any
-- remain) with everything attached: prospects, customers, revenue, payments, searches, partners.
DELETE FROM partners WHERE client_id IN (SELECT id FROM clients
  WHERE name IN ('LibraPro Facility Services', 'AutoAt', 'MAXPRO Fitness', 'Wedding business'));
DELETE FROM clients WHERE name IN ('LibraPro Facility Services', 'AutoAt', 'MAXPRO Fitness', 'Wedding business');
