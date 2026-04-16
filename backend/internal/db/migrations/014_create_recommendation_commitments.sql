-- 014_create_recommendation_commitments.sql
-- Stores user commitments to act on recommendations.

CREATE TABLE IF NOT EXISTS recommendation_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recommendation_key VARCHAR(100) NOT NULL,
    recommendation_title TEXT NOT NULL,
    recommendation_detail TEXT NOT NULL,
    why_this_action TEXT NOT NULL,
    why_now TEXT NOT NULL,
    target_day VARCHAR(16) NOT NULL CHECK (target_day IN ('today', 'tomorrow')),
    basis_kind VARCHAR(16) NOT NULL CHECK (basis_kind IN ('trigger', 'recovery', 'experiment')),
    basis_state VARCHAR(16) NOT NULL CHECK (basis_state IN ('generic', 'observed', 'emerging', 'confirmed')),
    predicted_score_delta INT NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('committed', 'completed', 'skipped', 'expired', 'evaluated')),
    committed_at TIMESTAMPTZ NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    outcome_helpfulness VARCHAR(16) CHECK (outcome_helpfulness IN ('helped', 'a_bit', 'did_not_help')),
    evaluated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_recommendation_commitments_one_active
ON recommendation_commitments(user_id)
WHERE status IN ('committed', 'completed');

CREATE INDEX idx_recommendation_commitments_user_created
ON recommendation_commitments(user_id, created_at DESC);

CREATE TRIGGER trg_recommendation_commitments_updated_at
    BEFORE UPDATE ON recommendation_commitments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();