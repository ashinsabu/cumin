-- Revocable refresh tokens for web login. Only the sha256 of the token is stored.
-- A family is one login: each refresh rotates the token within the family, and presenting an
-- already-rotated token (theft) revokes the whole family.
CREATE TABLE refresh_tokens (
    token_hash        TEXT PRIMARY KEY,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id         UUID NOT NULL,
    expires_at        TIMESTAMPTZ NOT NULL,  -- sliding idle deadline
    family_expires_at TIMESTAMPTZ NOT NULL,  -- absolute cap from login
    rotated_at        TIMESTAMPTZ,
    revoked_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_expires_idx ON refresh_tokens (expires_at);
