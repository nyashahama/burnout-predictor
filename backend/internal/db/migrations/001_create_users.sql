-- +goose Up
-- +goose StatementBegin

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email               TEXT        NOT NULL UNIQUE,
    password_hash       TEXT,                           -- NULL for OAuth-only users
    name                TEXT        NOT NULL DEFAULT '',
    -- onboarding profile (drives score engine)
    role                TEXT        NOT NULL DEFAULT 'engineer'
                            CHECK (role IN ('engineer','designer','pm','manager','founder','other')),
    sleep_baseline      SMALLINT    NOT NULL DEFAULT 8
                            CHECK (sleep_baseline BETWEEN 4 AND 12),
    estimated_score     SMALLINT    CHECK (estimated_score BETWEEN 0 AND 100),
    -- calendar integration
    calendar_connected  BOOLEAN     NOT NULL DEFAULT FALSE,
    calendar_token      JSONB,                          -- AES-256-GCM encrypted token blob
    calendar_synced_at  TIMESTAMPTZ,
    -- billing
    tier                TEXT        NOT NULL DEFAULT 'free'
                            CHECK (tier IN ('free','pro','team')),
    paddle_customer_id  TEXT,
    -- localisation
    timezone            TEXT        NOT NULL DEFAULT 'UTC',
    -- auth state
    email_verified      BOOLEAN     NOT NULL DEFAULT FALSE,
    google_id           TEXT        UNIQUE,             -- for OAuth users
    -- soft delete / lifecycle
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_paddle_customer ON users (paddle_customer_id) WHERE paddle_customer_id IS NOT NULL;
CREATE INDEX idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_users_tier ON users (tier);

COMMENT ON TABLE  users IS 'Core identity and profile. One row per registered account.';
COMMENT ON COLUMN users.role IS 'Onboarding-selected role; tunes the score engine role modifier.';
COMMENT ON COLUMN users.sleep_baseline IS 'Self-reported normal sleep hours; drives sleep deficit signal.';
COMMENT ON COLUMN users.estimated_score IS 'Seeded from onboarding stress estimate; shown on Day 1 before any check-in.';
COMMENT ON COLUMN users.calendar_token IS 'Encrypted Google Calendar OAuth token blob; never returned by the API.';
COMMENT ON COLUMN users.tier IS 'Billing tier; controlled exclusively by Paddle webhook handler.';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS users CASCADE;
-- +goose StatementEnd