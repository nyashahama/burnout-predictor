-- ── Subscriptions ────────────────────────────────────────────────────────────

-- name: UpsertSubscription :one
-- Called by the Paddle webhook handler for subscription.created and
-- subscription.updated events. Idempotent on paddle_subscription_id.
INSERT INTO subscriptions (
    user_id,
    paddle_subscription_id,
    paddle_plan_id,
    paddle_transaction_id,
    plan_name,
    currency,
    unit_price_cents,
    status,
    trial_ends_at,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    seat_count,
    last_event_type,
    last_event_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
)
ON CONFLICT (paddle_subscription_id)
DO UPDATE SET
    paddle_plan_id          = EXCLUDED.paddle_plan_id,
    paddle_transaction_id   = EXCLUDED.paddle_transaction_id,
    plan_name               = EXCLUDED.plan_name,
    currency                = EXCLUDED.currency,
    unit_price_cents        = EXCLUDED.unit_price_cents,
    status                  = EXCLUDED.status,
    trial_ends_at           = EXCLUDED.trial_ends_at,
    current_period_start    = EXCLUDED.current_period_start,
    current_period_end      = EXCLUDED.current_period_end,
    cancel_at_period_end    = EXCLUDED.cancel_at_period_end,
    seat_count              = EXCLUDED.seat_count,
    last_event_type         = EXCLUDED.last_event_type,
    last_event_at           = EXCLUDED.last_event_at,
    updated_at              = NOW()
RETURNING *;

-- name: GetSubscriptionByPaddleID :one
SELECT * FROM subscriptions
WHERE paddle_subscription_id = $1;

-- name: GetActiveSubscriptionByUserID :one
SELECT * FROM subscriptions
WHERE user_id = $1
  AND status IN ('active', 'trialing')
ORDER BY current_period_end DESC
LIMIT 1;

-- name: CancelSubscription :exec
UPDATE subscriptions SET
    status               = 'cancelled',
    cancel_at_period_end = TRUE,
    cancelled_at         = NOW(),
    last_event_type      = 'subscription.cancelled',
    last_event_at        = NOW()
WHERE paddle_subscription_id = $1;

-- name: SetSubscriptionPastDue :exec
UPDATE subscriptions SET
    status          = 'past_due',
    last_event_type = 'payment.failed',
    last_event_at   = NOW()
WHERE paddle_subscription_id = $1;

-- name: ListExpiredSubscriptions :many
-- Used by the hourly cron to downgrade users whose subscription period ended.
SELECT s.*, u.id AS uid
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.cancel_at_period_end = TRUE
  AND s.current_period_end   < NOW()
  AND s.status               != 'cancelled';

-- ── Paddle events ────────────────────────────────────────────────────────────

-- name: CreatePaddleEvent :one
INSERT INTO paddle_events (
    event_id,
    event_type,
    subscription_id,
    payload
) VALUES ($1, $2, $3, $4)
ON CONFLICT (event_id) DO NOTHING
RETURNING *;

-- name: PaddleEventExists :one
SELECT EXISTS (
    SELECT 1 FROM paddle_events WHERE event_id = $1
) AS exists;