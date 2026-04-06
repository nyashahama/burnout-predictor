-- +goose Up
-- +goose StatementBegin

-- Create EFT payments table for manual South African EFT payments
CREATE TABLE eft_payments (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reference         TEXT        NOT NULL UNIQUE,
    amount_cents      INT         NOT NULL,
    currency          TEXT        NOT NULL DEFAULT 'ZAR',
    plan_name         TEXT        NOT NULL DEFAULT 'pro',
    status            TEXT        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'rejected', 'expired')),
    proof_image_url   TEXT,
    verified_by       UUID        REFERENCES users(id),
    verified_at       TIMESTAMPTZ,
    rejection_note    TEXT,
    expires_at        TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_eft_payments_reference ON eft_payments(reference);
CREATE INDEX idx_eft_payments_user_id ON eft_payments(user_id);
CREATE INDEX idx_eft_payments_status ON eft_payments(status);
CREATE INDEX idx_eft_payments_expires_at ON eft_payments(expires_at);

-- Add payment_method column to subscriptions to distinguish Paddle vs EFT
ALTER TABLE subscriptions ADD COLUMN payment_method TEXT DEFAULT 'paddle'
    CHECK (payment_method IN ('paddle', 'eft'));
ALTER TABLE subscriptions ADD COLUMN eft_payment_id UUID REFERENCES eft_payments(id);

-- Add eft_payment_reference to users for easier lookup
ALTER TABLE users ADD COLUMN eft_payment_reference TEXT UNIQUE;

-- Apply updated_at trigger to eft_payments
CREATE TRIGGER trg_eft_payments_updated_at
    BEFORE UPDATE ON eft_payments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TRIGGER IF EXISTS trg_eft_payments_updated_at ON eft_payments;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS eft_payment_id;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS payment_method;
ALTER TABLE users DROP COLUMN IF EXISTS eft_payment_reference;
DROP TABLE IF EXISTS eft_payments;

-- +goose StatementEnd
