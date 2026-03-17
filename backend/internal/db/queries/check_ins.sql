-- name: CreateCheckIn :one
INSERT INTO check_ins (
    user_id,
    checked_in_date,
    stress,
    note,
    score,
    role_snapshot,
    sleep_snapshot,
    meeting_count
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING *;

-- name: UpsertCheckIn :one
-- Allows editing today's check-in (score recomputed by the server before call).
INSERT INTO check_ins (
    user_id,
    checked_in_date,
    stress,
    note,
    score,
    role_snapshot,
    sleep_snapshot,
    meeting_count
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
ON CONFLICT (user_id, checked_in_date)
DO UPDATE SET
    stress          = EXCLUDED.stress,
    note            = EXCLUDED.note,
    score           = EXCLUDED.score,
    role_snapshot   = EXCLUDED.role_snapshot,
    sleep_snapshot  = EXCLUDED.sleep_snapshot,
    meeting_count   = EXCLUDED.meeting_count,
    -- reset AI plan when check-in is meaningfully edited
    ai_recovery_plan    = CASE
                            WHEN check_ins.stress != EXCLUDED.stress
                              OR check_ins.note IS DISTINCT FROM EXCLUDED.note
                            THEN NULL
                            ELSE check_ins.ai_recovery_plan
                          END,
    ai_generated_at = CASE
                        WHEN check_ins.stress != EXCLUDED.stress
                          OR check_ins.note IS DISTINCT FROM EXCLUDED.note
                        THEN NULL
                        ELSE check_ins.ai_generated_at
                      END,
    updated_at      = NOW()
RETURNING *;

-- name: GetCheckInByID :one
SELECT * FROM check_ins
WHERE id = $1
  AND user_id = $2;

-- name: GetTodayCheckIn :one
SELECT * FROM check_ins
WHERE user_id = $1
  AND checked_in_date = $2;

-- name: GetYesterdayCheckIn :one
SELECT * FROM check_ins
WHERE user_id = $1
  AND checked_in_date = $2 - INTERVAL '1 day';

-- name: ListCheckIns :many
-- Paginated history, newest first. Used by the History page.
SELECT * FROM check_ins
WHERE user_id = $1
ORDER BY checked_in_date DESC
LIMIT $2
OFFSET $3;

-- name: ListCheckInsInRange :many
-- Used by pattern detection, arc computation, and weekly debrief.
SELECT * FROM check_ins
WHERE user_id = $1
  AND checked_in_date BETWEEN $2 AND $3
ORDER BY checked_in_date ASC;

-- name: ListRecentCheckIns :many
-- Last N days of check-ins for the score engine's recentStresses input.
-- Also used to compute streak and consecutive danger days.
SELECT
    checked_in_date,
    stress,
    score,
    note
FROM check_ins
WHERE user_id = $1
  AND checked_in_date >= CURRENT_DATE - $2::INT
ORDER BY checked_in_date DESC;

-- name: ListCheckInsForDayOfWeek :many
-- Returns all check-ins for a specific day of week (0=Sun … 6=Sat).
-- Used by the earned-pattern-insight DOW analysis.
SELECT
    checked_in_date,
    stress,
    score
FROM check_ins
WHERE user_id = $1
  AND EXTRACT(DOW FROM checked_in_date) = $2
ORDER BY checked_in_date DESC;

-- name: CountCheckIns :one
SELECT COUNT(*) FROM check_ins
WHERE user_id = $1;

-- name: CountCheckInsInRange :one
SELECT COUNT(*) FROM check_ins
WHERE user_id = $1
  AND checked_in_date BETWEEN $2 AND $3;

-- name: GetCheckInStreak :one
-- Counts consecutive days with a check-in ending today (or yesterday if
-- today has no check-in yet). Returns 0 when no streak exists.
WITH RECURSIVE streak AS (
    SELECT
        checked_in_date,
        1 AS n
    FROM check_ins
    WHERE check_ins.user_id = $1                     -- qualified
      AND checked_in_date = (
          SELECT MAX(checked_in_date)
          FROM check_ins
          WHERE check_ins.user_id = $1               -- qualified
            AND checked_in_date >= CURRENT_DATE - 1
      )
    UNION ALL
    SELECT
        ci.checked_in_date,
        s.n + 1
    FROM check_ins ci
    JOIN streak s ON ci.checked_in_date = s.checked_in_date - INTERVAL '1 day'
    WHERE ci.user_id = $1                             -- already qualified
)
SELECT COALESCE(MAX(n), 0)::INT AS streak
FROM streak;

-- name: GetConsecutiveDangerDays :one
-- Counts consecutive past days (not including today) where score > 65.
WITH RECURSIVE danger AS (
    SELECT
        checked_in_date,
        score,
        1 AS n
    FROM check_ins
    WHERE check_ins.user_id = $1                     -- qualified
      AND checked_in_date = CURRENT_DATE - 1
      AND score > 65
    UNION ALL
    SELECT
        ci.checked_in_date,
        ci.score,
        d.n + 1
    FROM check_ins ci
    JOIN danger d ON ci.checked_in_date = d.checked_in_date - INTERVAL '1 day'
    WHERE ci.user_id = $1                             -- already qualified
      AND ci.score > 65
)
SELECT COALESCE(MAX(n), 0)::INT AS consecutive_danger_days
FROM danger;

-- name: GetScoreTrendVs7DaysAgo :one
-- Returns the score delta between today and 7 days ago.
SELECT
    today.score - week_ago.score AS delta
FROM
    (SELECT score FROM check_ins WHERE check_ins.user_id = $1 AND check_ins.checked_in_date = $2) AS today,
    (SELECT score FROM check_ins WHERE check_ins.user_id = $1 AND check_ins.checked_in_date = $2 - 7) AS week_ago;
    
-- name: GetMonthlyAverageScore :one
-- Returns the average score for a given calendar month (year + month number).
SELECT
    ROUND(AVG(score))::INT AS avg_score,
    COUNT(*)::INT           AS entry_count
FROM check_ins
WHERE user_id   = $1
  AND EXTRACT(YEAR  FROM checked_in_date) = $2
  AND EXTRACT(MONTH FROM checked_in_date) = $3;

-- name: SetAIRecoveryPlan :exec
UPDATE check_ins SET
    ai_recovery_plan = $3,
    ai_generated_at  = NOW()
WHERE id      = $1
  AND user_id = $2;

-- name: ListCheckInsNeedingAIPlan :many
-- Used by background worker to generate AI plans for high-stress check-ins
-- that were submitted before the AI service was available, or where it
-- timed out.
SELECT * FROM check_ins
WHERE ai_recovery_plan IS NULL
  AND note IS NOT NULL
  AND stress >= 4
  AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 50;

-- name: ExportUserCheckIns :many
-- Full export for GDPR / POPIA data portability.
SELECT
    id,
    checked_in_date,
    stress,
    note,
    score,
    role_snapshot,
    sleep_snapshot,
    created_at
FROM check_ins
WHERE user_id = $1
ORDER BY checked_in_date ASC;