-- name: CreateFollowUp :one
INSERT INTO follow_ups (
    user_id,
    fire_date,
    event_type,
    question,
    note_snippet,
    source_checkin_id
) VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (user_id, fire_date, event_type)
    DO NOTHING
RETURNING *;

-- name: GetTodayFollowUp :one
-- Returns the single active follow-up for today (if any).
-- Priority: unsurfaced follow-ups first, then ones seen but not dismissed.
SELECT * FROM follow_ups
WHERE user_id     = $1
  AND fire_date   = $2
  AND dismissed_at IS NULL
  AND expired_at   IS NULL
ORDER BY surfaced_at NULLS FIRST
LIMIT 1;

-- name: MarkFollowUpSurfaced :exec
UPDATE follow_ups SET
    surfaced_at = NOW()
WHERE id      = $1
  AND user_id = $2;

-- name: DismissFollowUp :exec
UPDATE follow_ups SET
    dismissed_at = NOW()
WHERE id      = $1
  AND user_id = $2;

-- name: ExpireStaleFollowUps :exec
-- Cleanup cron: mark follow-ups older than 7 days that were never surfaced.
UPDATE follow_ups SET
    expired_at = NOW()
WHERE fire_date   < CURRENT_DATE - 7
  AND surfaced_at IS NULL
  AND expired_at  IS NULL;

-- name: ListFollowUpsForUser :many
-- Used by the history/export pages to show the user their full follow-up log.
SELECT * FROM follow_ups
WHERE user_id = $1
ORDER BY fire_date DESC
LIMIT $2
OFFSET $3;