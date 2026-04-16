-- 012_recommendation_feedback.sql
-- Stores user feedback on recommendations (helpful/not helpful) for personalization loop.

CREATE TABLE IF NOT EXISTS recommendation_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recommended_action_key VARCHAR(100) NOT NULL,
    helpful BOOLEAN NOT NULL,
    check_in_id UUID REFERENCES check_ins(id) ON DELETE SET NULL,
    feedback_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, recommended_action_key, feedback_date)
);

CREATE INDEX idx_recommendation_feedback_user_date ON recommendation_feedback(user_id, feedback_date DESC);
CREATE INDEX idx_recommendation_feedback_action_key ON recommendation_feedback(recommended_action_key);

COMMENT ON TABLE recommendation_feedback IS 'Stores user feedback on recommendations (helpful/not helpful) for personalization loop.';
COMMENT ON COLUMN recommendation_feedback.recommended_action_key IS 'The driver or key from recommended_action (e.g., meetings, sleep, shutdown)';
COMMENT ON COLUMN recommendation_feedback.helpful IS 'True if user found the recommendation useful';