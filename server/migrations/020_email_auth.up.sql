-- Email + password accounts: google_id becomes optional, but every user must have a credential.
ALTER TABLE users ALTER COLUMN google_id DROP NOT NULL;
ALTER TABLE users
    ADD COLUMN password_hash     TEXT,
    ADD COLUMN email_verified_at TIMESTAMPTZ,
    ADD COLUMN provisioned_at    TIMESTAMPTZ;

-- Existing users are Google accounts: verified by Google and already provisioned.
UPDATE users SET email_verified_at = created_at, provisioned_at = created_at;

ALTER TABLE users ADD CONSTRAINT users_has_credential
    CHECK (google_id IS NOT NULL OR password_hash IS NOT NULL);

-- Single-use email tokens. Only the sha256 of the token is stored.
CREATE TABLE auth_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose    TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose);
CREATE INDEX auth_tokens_expires_idx ON auth_tokens (expires_at);
