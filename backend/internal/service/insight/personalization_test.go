package insight

import (
	"testing"

	"github.com/nyasha-hama/burnout-predictor-api/internal/score"
)

func TestBuildPersonalizationView_GenericWhenHistoryIsThin(t *testing.T) {
	view := BuildPersonalizationView([]score.PatternInsight{}, []score.RecoveryFeedback{}, nil, 2, "")

	if view.RecommendationBasis == nil {
		t.Fatalf("RecommendationBasis = nil, want generic basis")
	}
	if view.RecommendationBasis.State != RecommendationStateGeneric {
		t.Fatalf("state = %q, want %q", view.RecommendationBasis.State, RecommendationStateGeneric)
	}
	if view.Progress.ConfirmedTriggers != 0 {
		t.Fatalf("ConfirmedTriggers = %d, want 0", view.Progress.ConfirmedTriggers)
	}
}

func TestBuildPersonalizationView_BucketsTriggersAndRecoveryLevers(t *testing.T) {
	view := BuildPersonalizationView(
		[]score.PatternInsight{
			{
				Title:       "Back-to-back meeting mornings",
				Explanation: "Your next-day strain rises after stacked morning meetings.",
				Evidence:    "4 matching check-ins",
				Driver:      "meetings",
				Confidence:  "high",
			},
			{
				Title:       "Deadline-heavy Tuesdays",
				Explanation: "This may matter, but the evidence is still thin.",
				Evidence:    "1 matching check-in",
				Driver:      "deadline",
				Confidence:  "low",
			},
		},
		[]score.RecoveryFeedback{
			{
				Title:              "Early shutdown",
				Explanation:        "Leaving work on time lowers your next-day strain.",
				Evidence:           "3 improvements",
				Driver:             "shutdown",
				Confidence:         "high",
				AverageImprovement: 6,
			},
		},
		nil,
		14,
		"",
	)

	if view.Progress.ConfirmedTriggers != 1 {
		t.Fatalf("ConfirmedTriggers = %d, want 1", view.Progress.ConfirmedTriggers)
	}
	if len(view.Playbook.ConfirmedRecoveryLevers) != 1 {
		t.Fatalf("ConfirmedRecoveryLevers = %d, want 1", len(view.Playbook.ConfirmedRecoveryLevers))
	}
	if len(view.Playbook.Experiments) != 1 {
		t.Fatalf("Experiments = %d, want 1", len(view.Playbook.Experiments))
	}
	if view.RecommendationBasis == nil || view.RecommendationBasis.State != RecommendationStateConfirmed {
		t.Fatalf("RecommendationBasis = %#v, want confirmed trigger basis", view.RecommendationBasis)
	}
}

func TestBuildBriefingChange_PrefersNewKey(t *testing.T) {
	change := BuildBriefingChange("trigger:meetings", "trigger:sleep", "Meetings replaced sleep loss as your strongest trigger.")
	if change == nil {
		t.Fatalf("change = nil, want briefing change")
	}
	if change.Title != "New today" {
		t.Fatalf("title = %q, want %q", change.Title, "New today")
	}
}
