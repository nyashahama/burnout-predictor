-- ── EFT Payments ───────────────────────────────────────────────────────────────

-- name: CreateEFTPayment :one
INSERT INTO eft_payments (
    user_id,
    reference,
    amount_cents,
    currency,
    plan_name,
    status,
    expires_at
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetEFTPaymentByReference :one
SELECT * FROM eft_payments
WHERE reference = $1;

-- name: GetEFTPaymentByID :one
SELECT * FROM eft_payments
WHERE id = $1;

-- name: GetPendingEFTPayments :many
SELECT * FROM eft_payments
WHERE status = 'pending'
  AND expires_at > NOW()
ORDER BY created_at ASC;

-- name: UpdateEFTPaymentStatus :exec
UPDATE eft_payments SET
    status         = $2,
    verified_by    = $3,
    verified_at    = $4,
    rejection_note = $5,
    updated_at     = NOW()
WHERE id = $1;

-- name: GetEFTPaymentByUserID :many
SELECT * FROM eft_payments
WHERE user_id = $1
ORDER BY created_at DESC;

-- name: ExpireEFTPayments :many
-- Mark expired payments as expired (called by maintenance job)
UPDATE eft_payments SET
    status     = 'expired',
    updated_at = NOW()
WHERE status = 'pending'
  AND expires_at <= NOW()
RETURNING *;
