-- ── Refresh tokens ────────────────────────────────────────────────────────────

-- name: CreateRefreshToken :one
INSERT INTO refresh_tokens (
    user_id,
    token_hash,
    expires_at
) VALUES ($1, $2, $3)
RETURNING *;

-- name: GetRefreshToken :one
SELECT * FROM refresh_tokens
WHERE token_hash = $1
  AND revoked     = FALSE
  AND expires_at > NOW();

-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens SET
    revoked = TRUE
WHERE token_hash = $1;

-- name: RevokeAllUserRefreshTokens :exec
-- Called on password change or explicit sign-out-all-devices.
UPDATE refresh_tokens SET
    revoked = TRUE
WHERE user_id = $1
  AND revoked = FALSE;

-- name: DeleteExpiredRefreshTokens :exec
-- Maintenance query — run nightly.
DELETE FROM refresh_tokens
WHERE expires_at < NOW() - INTERVAL '7 days';

-- ── Email verifications ───────────────────────────────────────────────────────

-- name: CreateEmailVerification :one
INSERT INTO email_verifications (
    user_id,
    token_hash,
    email,
    expires_at
) VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetEmailVerification :one
SELECT * FROM email_verifications
WHERE token_hash = $1
  AND used_at    IS NULL
  AND expires_at > NOW();

-- name: MarkEmailVerificationUsed :exec
UPDATE email_verifications SET
    used_at = NOW()
WHERE token_hash = $1;

-- ── Password resets ───────────────────────────────────────────────────────────

-- name: CreatePasswordReset :one
INSERT INTO password_resets (
    user_id,
    token_hash,
    expires_at
) VALUES ($1, $2, $3)
RETURNING *;

-- name: GetPasswordReset :one
SELECT * FROM password_resets
WHERE token_hash = $1
  AND used_at    IS NULL
  AND expires_at > NOW();

-- name: MarkPasswordResetUsed :exec
UPDATE password_resets SET
    used_at = NOW()
WHERE token_hash = $1;

-- name: DeleteExpiredPasswordResets :exec
DELETE FROM password_resets
WHERE expires_at < NOW() - INTERVAL '24 hours';