-- ── Notification preferences ──────────────────────────────────────────────────

-- name: UpsertNotificationPrefs :one
INSERT INTO user_notification_prefs (
    user_id,
    checkin_reminder,
    reminder_time,
    monday_debrief_email,
    weekly_summary_email,
    streak_alert_email,
    pattern_email,
    re_engage_email
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (user_id)
DO UPDATE SET
    checkin_reminder        = EXCLUDED.checkin_reminder,
    reminder_time           = EXCLUDED.reminder_time,
    monday_debrief_email    = EXCLUDED.monday_debrief_email,
    weekly_summary_email    = EXCLUDED.weekly_summary_email,
    streak_alert_email      = EXCLUDED.streak_alert_email,
    pattern_email           = EXCLUDED.pattern_email,
    re_engage_email         = EXCLUDED.re_engage_email,
    updated_at              = NOW()
RETURNING *;

-- name: GetNotificationPrefs :one
SELECT * FROM user_notification_prefs
WHERE user_id = $1;

-- name: CreateDefaultNotificationPrefs :one
-- Called automatically on user registration.
INSERT INTO user_notification_prefs (user_id)
VALUES ($1)
ON CONFLICT (user_id) DO NOTHING
RETURNING *;

-- ── Email logs ────────────────────────────────────────────────────────────────

-- name: CreateEmailLog :one
INSERT INTO email_logs (
    user_id,
    email,
    template,
    dedup_key,
    resend_message_id,
    status
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: IsEmailAlreadySent :one
-- Guards against duplicate sends. Returns true if the dedup_key has
-- already been sent successfully for this user.
SELECT EXISTS (
    SELECT 1 FROM email_logs
    WHERE user_id   = $1
      AND dedup_key = $2
      AND status    = 'sent'
) AS already_sent;

-- name: MarkEmailFailed :exec
UPDATE email_logs SET
    status        = 'failed',
    error_message = $2
WHERE id = $1;

-- name: ListRecentEmailsForUser :many
SELECT
    template,
    dedup_key,
    status,
    sent_at
FROM email_logs
WHERE user_id = $1
ORDER BY sent_at DESC
LIMIT $2;