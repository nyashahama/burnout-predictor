-- +goose Up
-- +goose StatementBegin

-- ── Subscriptions ─────────────────────────────────────────────────────────────
-- Managed exclusively by the Paddle webhook handler. The application never
-- writes to this table directly — all mutations come through verified Paddle
-- events.
--
-- Paddle is the merchant of record: it handles VAT, currency conversion,
-- ZAR / EFT / Ozow (SA), SEPA / iDEAL (EU), and card (global).

CREATE TABLE subscriptions (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Paddle identifiers
    paddle_subscription_id  TEXT        NOT NULL UNIQUE,
    paddle_plan_id          TEXT        NOT NULL,    -- references Paddle price ID
    paddle_transaction_id   TEXT,                   -- latest transaction

    -- plan metadata (denormalised for quick reads without Paddle API call)
    plan_name               TEXT        NOT NULL DEFAULT 'pro',  -- pro | team
    currency                TEXT        NOT NULL DEFAULT 'USD',  -- USD | EUR | ZAR
    unit_price_cents        INT,                    -- in the subscription currency

    -- lifecycle state machine
    -- active | trialing | past_due | cancelled | paused
    status                  TEXT        NOT NULL DEFAULT 'active',

    -- billing period
    trial_ends_at           TIMESTAMPTZ,
    current_period_start    TIMESTAMPTZ NOT NULL,
    current_period_end      TIMESTAMPTZ NOT NULL,
    cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT FALSE,
    cancelled_at            TIMESTAMPTZ,
    paused_at               TIMESTAMPTZ,

    -- team tier
    seat_count              SMALLINT    NOT NULL DEFAULT 1,

    -- audit trail — raw Paddle event payload stored for debugging
    last_event_type         TEXT,
    last_event_at           TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user
    ON subscriptions (user_id);

CREATE INDEX idx_subscriptions_period_end
    ON subscriptions (current_period_end)
    WHERE status IN ('active', 'trialing', 'past_due');

COMMENT ON TABLE  subscriptions IS 'Paddle subscription state. Written only by the /api/webhooks/paddle handler.';
COMMENT ON COLUMN subscriptions.status IS 'Mirrors Paddle subscription status. Downgrade enforced at current_period_end.';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS 'TRUE when user cancelled but service continues until current_period_end.';

-- ── Payment events log ────────────────────────────────────────────────────────
-- Idempotent log of all Paddle webhook events for debugging and replay.

CREATE TABLE paddle_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        TEXT        NOT NULL UNIQUE,    -- Paddle event_id for idempotency
    event_type      TEXT        NOT NULL,
    subscription_id TEXT,
    payload         JSONB       NOT NULL,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_paddle_events_subscription
    ON paddle_events (subscription_id)
    WHERE subscription_id IS NOT NULL;

COMMENT ON TABLE  paddle_events IS 'Append-only Paddle webhook log. Used for idempotency checks and debugging.';
COMMENT ON COLUMN paddle_events.event_id IS 'Paddle''s own event_id. Unique constraint prevents double-processing.';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS paddle_events CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
-- +goose StatementEnd