-- Mailboxes sent and read through Microsoft Graph with the app's own access (no sign-in, no password).
ALTER TABLE client_mailboxes DROP CONSTRAINT client_mailboxes_auth_check;
ALTER TABLE client_mailboxes ADD CONSTRAINT client_mailboxes_auth_check CHECK (auth IN ('password', 'oauth', 'graph'));
