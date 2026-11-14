-- Mailboxes connected with "Connect with Microsoft" (OAuth) instead of a password.
-- The refresh token is encrypted with APP_SECRET like passwords are.
ALTER TABLE client_mailboxes
  ADD COLUMN auth               TEXT NOT NULL DEFAULT 'password' CHECK (auth IN ('password', 'oauth')),
  ADD COLUMN refresh_token_enc  TEXT NOT NULL DEFAULT '';
