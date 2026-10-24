DROP TABLE auth_tokens;
ALTER TABLE users DROP CONSTRAINT users_has_credential;
-- Password-only users have no google_id and cannot be represented by the old schema.
DELETE FROM users WHERE google_id IS NULL;
ALTER TABLE users
    DROP COLUMN password_hash,
    DROP COLUMN email_verified_at,
    DROP COLUMN provisioned_at;
ALTER TABLE users ALTER COLUMN google_id SET NOT NULL;
