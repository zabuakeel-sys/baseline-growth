-- The owner's perfected opening email per business (subject + body). When set, it is used for the
-- first email instead of the AI draft, with {first_name} filled in per prospect.
ALTER TABLE clients
  ADD COLUMN outreach_subject TEXT NOT NULL DEFAULT '',
  ADD COLUMN outreach_body    TEXT NOT NULL DEFAULT '';
