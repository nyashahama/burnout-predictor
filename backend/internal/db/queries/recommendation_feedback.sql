-- name: UpsertRecommendationFeedback :one
INSERT INTO recommendation_feedback (
    user_id,
    recommended_action_key,
    helpful,
    check_in_id
) VALUES (
    @user_id,
    @recommended_action_key,
    @helpful,
    @check_in_id
) ON CONFLICT (user_id, recommended_action_key, feedback_date)
DO UPDATE SET
    helpful = @helpful,
    created_at = NOW()
RETURNING *;

-- name: GetTodayFeedback :one
SELECT * FROM recommendation_feedback
WHERE user_id = @user_id
AND recommended_action_key = @recommended_action_key
AND feedback_date = CURRENT_DATE;

-- name: ListRecentFeedback :many
SELECT * FROM recommendation_feedback
WHERE user_id = @user_id
ORDER BY created_at DESC
LIMIT @n;

-- name: GetFeedbackCountsByKey :many
SELECT
    recommended_action_key,
    COUNT(*) FILTER (WHERE helpful = true) as helpful_count,
    COUNT(*) FILTER (WHERE helpful = false) as not_helpful_count,
    COUNT(*) as total_count
FROM recommendation_feedback
WHERE user_id = @user_id
AND created_at >= @since
GROUP BY recommended_action_key;