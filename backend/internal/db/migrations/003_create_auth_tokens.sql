-- +goose Up
-- +goose StatementBegin

-- ── Refresh tokens ────────────────────────────────────────────────────────────
-- Stores hashed refresh tokens for the JWT rotation flow.
-- Access tokens (15 min TTL) are stateless; refresh tokens (30 day TTL) are not.
-- On each /api/auth/refresh call the old token is revoked and a new one issued.

CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,    -- SHA-256 hex of the raw token
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user
    ON refresh_tokens (user_id)
    WHERE revoked = FALSE;

CREATE INDEX idx_refresh_tokens_expires
    ON refresh_tokens (expires_at)
    WHERE revoked = FALSE;

COMMENT ON TABLE  refresh_tokens IS 'Hashed refresh tokens for stateful JWT rotation. Rotated on every use.';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256(raw_token). Raw token is sent to client only once, never stored.';

-- ── Email verification tokens ─────────────────────────────────────────────────

CREATE TABLE email_verifications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,    -- SHA-256 hex of the raw token
    email       TEXT        NOT NULL,           -- email address being verified
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_verifications_user
    ON email_verifications (user_id)
    WHERE used_at IS NULL;

COMMENT ON TABLE email_verifications IS 'One-time tokens for email address verification. Expires after 24h.';

-- ── Password reset tokens ─────────────────────────────────────────────────────

CREATE TABLE password_resets (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_resets_user
    ON password_resets (user_id)
    WHERE used_at IS NULL;

COMMENT ON TABLE password_resets IS 'One-time tokens for password reset. Expires after 1h.';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS password_resets CASCADE;
DROP TABLE IF EXISTS email_verifications CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
-- +goose StatementEnd