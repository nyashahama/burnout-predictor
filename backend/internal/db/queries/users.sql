-- name: CreateUser :one
INSERT INTO users (
    email,
    password_hash,
    name,
    role,
    sleep_baseline,
    estimated_score,
    timezone,
    google_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1
  AND deleted_at IS NULL;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE email = $1
  AND deleted_at IS NULL;

-- name: GetUserByGoogleID :one
SELECT * FROM users
WHERE google_id = $1
  AND deleted_at IS NULL;

-- name: GetUserByPaddleCustomerID :one
SELECT * FROM users
WHERE paddle_customer_id = $1
  AND deleted_at IS NULL;

-- name: UpdateUserProfile :one
UPDATE users SET
    name            = COALESCE(sqlc.narg('name'),           name),
    role            = COALESCE(sqlc.narg('role'),           role),
    sleep_baseline  = COALESCE(sqlc.narg('sleep_baseline'), sleep_baseline),
    timezone        = COALESCE(sqlc.narg('timezone'),       timezone)
WHERE id = $1
  AND deleted_at IS NULL
RETURNING *;

-- name: UpdateUserEmail :one
UPDATE users SET
    email          = $2,
    email_verified = FALSE
WHERE id = $1
  AND deleted_at IS NULL
RETURNING *;

-- name: UpdateUserPassword :exec
UPDATE users SET
    password_hash = $2
WHERE id = $1
  AND deleted_at IS NULL;

-- name: VerifyUserEmail :exec
UPDATE users SET
    email_verified = TRUE
WHERE id = $1
  AND deleted_at IS NULL;

-- name: SetUserGoogleID :exec
UPDATE users SET
    google_id = $2
WHERE id = $1
  AND deleted_at IS NULL;

-- name: SetCalendarToken :exec
UPDATE users SET
    calendar_token      = $2,
    calendar_connected  = TRUE,
    calendar_synced_at  = NOW()
WHERE id = $1
  AND deleted_at IS NULL;

-- name: ClearCalendarToken :exec
UPDATE users SET
    calendar_token      = NULL,
    calendar_connected  = FALSE,
    calendar_synced_at  = NULL
WHERE id = $1
  AND deleted_at IS NULL;

-- name: UpdateCalendarSyncedAt :exec
UPDATE users SET
    calendar_synced_at = NOW()
WHERE id = $1
  AND deleted_at IS NULL;

-- name: SetUserTier :exec
UPDATE users SET
    tier = $2
WHERE id = $1
  AND deleted_at IS NULL;

-- name: SetPaddleCustomerID :exec
UPDATE users SET
    paddle_customer_id = $2
WHERE id = $1
  AND deleted_at IS NULL;

-- name: SetEstimatedScore :exec
UPDATE users SET
    estimated_score = $2
WHERE id = $1
  AND deleted_at IS NULL;

-- name: SoftDeleteUser :exec
UPDATE users SET
    deleted_at = NOW(),
    email      = email || '.deleted.' || EXTRACT(EPOCH FROM NOW())::BIGINT
WHERE id = $1
  AND deleted_at IS NULL;

-- name: ListUsersForCheckinReminder :many
-- Called by the cron job every minute; returns users whose local time
-- matches their reminder_time and who have not yet checked in today.
SELECT
    u.id,
    u.email,
    u.name,
    u.timezone,
    np.reminder_time
FROM users u
JOIN user_notification_prefs np ON np.user_id = u.id
WHERE u.deleted_at IS NULL
  AND u.email_verified = TRUE
  AND np.checkin_reminder = TRUE
  -- match current UTC minute against user's local time
  AND TO_CHAR(
        (NOW() AT TIME ZONE u.timezone)::TIME,
        'HH24:MI'
      ) = TO_CHAR(np.reminder_time, 'HH24:MI')
  -- no check-in today in user's local date
  AND NOT EXISTS (
      SELECT 1 FROM check_ins ci
      WHERE ci.user_id = u.id
        AND ci.checked_in_date = (NOW() AT TIME ZONE u.timezone)::DATE
  );

-- name: ListUsersForReengagement :many
-- Users who have ≥5 check-ins in the last 14 days but none in the past 2 days,
-- and haven't received a re-engagement email in the last 7 days.
SELECT DISTINCT u.id, u.email, u.name
FROM users u
JOIN user_notification_prefs np ON np.user_id = u.id
WHERE u.deleted_at IS NULL
  AND u.email_verified = TRUE
  AND np.re_engage_email = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM check_ins ci
      WHERE ci.user_id = u.id
        AND ci.checked_in_date >= CURRENT_DATE - 2
  )
  AND (
      SELECT COUNT(*) FROM check_ins ci
      WHERE ci.user_id = u.id
        AND ci.checked_in_date >= CURRENT_DATE - 14
  ) >= 5
  AND NOT EXISTS (
      SELECT 1 FROM email_logs el
      WHERE el.user_id = u.id
        AND el.template = 're-engage'
        AND el.status = 'sent'
        AND el.sent_at >= NOW() - INTERVAL '7 days'
  );

-- name: ListUsersForStreakAlert :many
-- Users with a streak ≥5 who haven't checked in today and whose local
-- time is past 6 PM — sent once per day.
SELECT u.id, u.email, u.name, u.timezone
FROM users u
JOIN user_notification_prefs np ON np.user_id = u.id
WHERE u.deleted_at IS NULL
  AND u.email_verified = TRUE
  AND np.streak_alert_email = TRUE
  AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE u.timezone)) >= 18
  AND NOT EXISTS (
      SELECT 1 FROM check_ins ci
      WHERE ci.user_id = u.id
        AND ci.checked_in_date = (NOW() AT TIME ZONE u.timezone)::DATE
  )
  AND NOT EXISTS (
      SELECT 1 FROM email_logs el
      WHERE el.user_id = u.id
        AND el.template = 'streak-alert'
        AND el.dedup_key = 'streak-alert-' || TO_CHAR(NOW() AT TIME ZONE u.timezone, 'YYYY-MM-DD')
        AND el.status = 'sent'
  );

-- name: ListUsersForMondayDebrief :many
-- Users for whom it's Monday morning (local time 7–10 AM) and who have
-- ≥3 check-ins in the past 7 days and haven't received this week's debrief.
SELECT u.id, u.email, u.name, u.timezone
FROM users u
JOIN user_notification_prefs np ON np.user_id = u.id
WHERE u.deleted_at IS NULL
  AND u.email_verified = TRUE
  AND np.monday_debrief_email = TRUE
  AND EXTRACT(DOW  FROM (NOW() AT TIME ZONE u.timezone)) = 1
  AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE u.timezone)) BETWEEN 7 AND 9
  AND (
      SELECT COUNT(*) FROM check_ins ci
      WHERE ci.user_id = u.id
        AND ci.checked_in_date >= (NOW() AT TIME ZONE u.timezone)::DATE - 7
  ) >= 3
  AND NOT EXISTS (
      SELECT 1 FROM email_logs el
      WHERE el.user_id = u.id
        AND el.template = 'monday-debrief'
        AND el.dedup_key = 'monday-debrief-' || TO_CHAR(NOW() AT TIME ZONE u.timezone, 'IYYY-IW')
        AND el.status = 'sent'
  );