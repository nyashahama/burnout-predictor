-- +goose Up
ALTER TABLE users
ADD COLUMN onboarded_at TIMESTAMPTZ;

CREATE INDEX idx_users_onboarded_at
    ON users (onboarded_at)
    WHERE onboarded_at IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_users_onboarded_at;
ALTER TABLE users DROP COLUMN IF EXISTS onboarded_at;
