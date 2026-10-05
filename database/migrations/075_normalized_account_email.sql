-- preserve original spelling while preventing case variants from claiming one mailbox twice
-- a collision fails the migration for explicit operator resolution
CREATE UNIQUE INDEX login_normalized_email_unique ON app.login (lower(btrim(email)));
