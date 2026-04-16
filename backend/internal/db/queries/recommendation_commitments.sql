-- name: CreateRecommendationCommitment :one
INSERT INTO recommendation_commitments (
    user_id,
    recommendation_key,
    recommendation_title,
    recommendation_detail,
    why_this_action,
    why_now,
    target_day,
    basis_kind,
    basis_state,
    predicted_score_delta,
    status,
    committed_at,
    due_at
) VALUES (
    @user_id,
    @recommendation_key,
    @recommendation_title,
    @recommendation_detail,
    @why_this_action,
    @why_now,
    @target_day,
    @basis_kind,
    @basis_state,
    @predicted_score_delta,
    @status,
    @committed_at,
    @due_at
)
RETURNING *;

-- name: GetActiveRecommendationCommitment :one
SELECT *
FROM recommendation_commitments
WHERE user_id = @user_id
  AND status IN ('committed', 'completed')
ORDER BY committed_at DESC
LIMIT 1;

-- name: GetRecommendationCommitmentByID :one
SELECT *
FROM recommendation_commitments
WHERE id = @id
  AND user_id = @user_id;

-- name: UpdateRecommendationCommitmentStatus :one
UPDATE recommendation_commitments
SET
    status = @status,
    completed_at = COALESCE(sqlc.narg('completed_at'), completed_at)
WHERE id = @id
  AND user_id = @user_id
RETURNING *;

-- name: SetRecommendationCommitmentOutcome :one
UPDATE recommendation_commitments
SET
    outcome_helpfulness = @outcome_helpfulness,
    status = 'evaluated',
    evaluated_at = NOW()
WHERE id = @id
  AND user_id = @user_id
RETURNING *;

-- name: ExpireRecommendationCommitment :one
UPDATE recommendation_commitments
SET status = 'expired'
WHERE id = @id
  AND user_id = @user_id
RETURNING *;