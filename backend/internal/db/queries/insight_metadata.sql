-- ── Insight metadata ──────────────────────────────────────────────────────────

-- name: GetInsightMetadata :one
SELECT * FROM insight_metadata
WHERE user_id = $1
  AND key     = $2;

-- name: SetInsightMetadata :one
INSERT INTO insight_metadata (user_id, key, value)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, key)
DO UPDATE SET
    value      = EXCLUDED.value,
    updated_at = NOW()
RETURNING *;

-- name: DeleteInsightMetadata :exec
DELETE FROM insight_metadata
WHERE user_id = $1
  AND key     = $2;

-- name: ListInsightMetadataByPrefix :many
-- Used to load all pattern-seen-dow-* keys in a single query.
SELECT * FROM insight_metadata
WHERE user_id = $1
  AND key LIKE $2 || '%'
ORDER BY key;

-- name: GetAllInsightMetadata :many
-- Full export for GDPR portability.
SELECT * FROM insight_metadata
WHERE user_id = $1
ORDER BY key;

-- ── Dismissed components ──────────────────────────────────────────────────────

-- name: DismissComponent :exec
INSERT INTO dismissed_components (user_id, component_key)
VALUES ($1, $2)
ON CONFLICT (user_id, component_key) DO NOTHING;

-- name: IsComponentDismissed :one
SELECT EXISTS (
    SELECT 1 FROM dismissed_components
    WHERE user_id       = $1
      AND component_key = $2
) AS dismissed;

-- name: ListDismissedComponents :many
-- Used when building the dashboard to batch-check dismissal state.
SELECT component_key FROM dismissed_components
WHERE user_id = $1
  AND component_key = ANY($2::TEXT[]);

-- name: DeleteOldDismissals :exec
-- Maintenance: remove dismissals older than 90 days (they auto-expire by key).
DELETE FROM dismissed_components
WHERE dismissed_at < NOW() - INTERVAL '90 days';