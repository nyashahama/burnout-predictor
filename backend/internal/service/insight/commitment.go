package insight

import (
	"time"

	"github.com/google/uuid"
)

type CommitmentStatus string

const (
	CommitmentStatusCommitted CommitmentStatus = "committed"
	CommitmentStatusCompleted CommitmentStatus = "completed"
	CommitmentStatusSkipped   CommitmentStatus = "skipped"
	CommitmentStatusExpired   CommitmentStatus = "expired"
	CommitmentStatusEvaluated CommitmentStatus = "evaluated"
)

type OutcomeHelpfulness string

const (
	OutcomeHelpfulnessHelped     OutcomeHelpfulness = "helped"
	OutcomeHelpfulnessABit       OutcomeHelpfulness = "a_bit"
	OutcomeHelpfulnessDidNotHelp OutcomeHelpfulness = "did_not_help"
)

type RecommendationCommitment struct {
	ID                   uuid.UUID               `json:"id"`
	RecommendationKey    string                  `json:"recommendation_key"`
	RecommendationTitle  string                  `json:"recommendation_title"`
	RecommendationDetail string                  `json:"recommendation_detail"`
	WhyThisAction        string                  `json:"why_this_action"`
	WhyNow               string                  `json:"why_now"`
	TargetDay            RecommendationTargetDay `json:"target_day"`
	Status               CommitmentStatus        `json:"status"`
	PredictedScoreDelta  int                     `json:"predicted_score_delta"`
	CommittedAt          time.Time               `json:"committed_at"`
	DueAt                time.Time               `json:"due_at"`
	CompletedAt          *time.Time              `json:"completed_at,omitempty"`
	OutcomeHelpfulness   *OutcomeHelpfulness     `json:"outcome_helpfulness,omitempty"`
	EvaluatedAt          *time.Time              `json:"evaluated_at,omitempty"`
	Basis                *RecommendationBasis    `json:"basis,omitempty"`
}

type PendingOutcomePrompt struct {
	CommitmentID        uuid.UUID `json:"commitment_id"`
	RecommendationTitle string    `json:"recommendation_title"`
	Prompt              string    `json:"prompt"`
}

func deriveCommitmentDueAt(now time.Time, target RecommendationTargetDay) time.Time {
	year, month, day := now.Date()
	if target == RecommendationTargetTomorrow {
		base := time.Date(year, month, day, 0, 0, 0, 0, now.Location()).AddDate(0, 0, 1)
		return time.Date(base.Year(), base.Month(), base.Day(), 23, 59, 59, 0, now.Location())
	}
	return time.Date(year, month, day, 23, 59, 59, 0, now.Location())
}

func BuildPendingOutcomePrompt(commitment RecommendationCommitment) *PendingOutcomePrompt {
	if commitment.Status != CommitmentStatusCompleted || commitment.CompletedAt == nil || commitment.OutcomeHelpfulness != nil {
		return nil
	}

	return &PendingOutcomePrompt{
		CommitmentID:        commitment.ID,
		RecommendationTitle: commitment.RecommendationTitle,
		Prompt:              "Did this help?",
	}
}
