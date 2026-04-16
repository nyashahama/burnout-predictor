package insight

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestDeriveCommitmentDueAt_EndsAtLocalDayBoundary(t *testing.T) {
	loc := time.FixedZone("SAST", 2*60*60)
	now := time.Date(2026, 4, 16, 9, 30, 0, 0, loc)

	dueToday := deriveCommitmentDueAt(now, RecommendationTargetToday)
	dueTomorrow := deriveCommitmentDueAt(now, RecommendationTargetTomorrow)

	if dueToday.Format(time.RFC3339) != "2026-04-16T23:59:59+02:00" {
		t.Fatalf("dueToday = %s, want end of local day", dueToday.Format(time.RFC3339))
	}
	if dueTomorrow.Format(time.RFC3339) != "2026-04-17T23:59:59+02:00" {
		t.Fatalf("dueTomorrow = %s, want end of next local day", dueTomorrow.Format(time.RFC3339))
	}
}

func TestBuildPendingOutcomePrompt_RequiresCompletedUnevaluatedCommitment(t *testing.T) {
	completedAt := time.Date(2026, 4, 17, 7, 0, 0, 0, time.UTC)
	commitment := RecommendationCommitment{
		ID:                  uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		RecommendationKey:   "shutdown_on_time",
		RecommendationTitle: "End work by 6 PM tonight",
		Status:              CommitmentStatusCompleted,
		CompletedAt:         &completedAt,
	}

	prompt := BuildPendingOutcomePrompt(commitment)
	if prompt == nil {
		t.Fatalf("prompt = nil, want pending outcome prompt")
	}
	if prompt.CommitmentID != commitment.ID {
		t.Fatalf("commitment_id = %s, want %s", prompt.CommitmentID, commitment.ID)
	}
	if prompt.Prompt != "Did this help?" {
		t.Fatalf("prompt = %q, want %q", prompt.Prompt, "Did this help?")
	}
}
