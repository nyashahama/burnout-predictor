package insight

import (
	"testing"
	"time"

	"github.com/nyasha-hama/burnout-predictor-api/internal/score"
)

func TestBuildBriefingRecommendation_GenericWhenHistoryIsThin(t *testing.T) {
	rec := BuildBriefingRecommendation(BriefingRecommendationInput{
		CheckInCount: 2,
		Now:          time.Date(2026, 4, 16, 10, 0, 0, 0, time.UTC),
	})

	if rec == nil {
		t.Fatalf("rec = nil, want recommendation")
	}
	if rec.TargetDay != RecommendationTargetTomorrow {
		t.Fatalf("target day = %q, want %q", rec.TargetDay, RecommendationTargetTomorrow)
	}
	if rec.PrimaryAction.Key != "prioritize_sleep" {
		t.Fatalf("primary key = %q, want %q", rec.PrimaryAction.Key, "prioritize_sleep")
	}
	if rec.Basis == nil || rec.Basis.State != RecommendationStateGeneric {
		t.Fatalf("basis = %#v, want generic basis", rec.Basis)
	}
	if rec.FallbackAction == nil {
		t.Fatalf("fallback = nil, want fallback action")
	}
}

func TestBuildBriefingRecommendation_PrefersConfirmedTriggerWhenImpactIsHighest(t *testing.T) {
	rec := BuildBriefingRecommendation(BriefingRecommendationInput{
		CheckInCount: 11,
		Now:          time.Date(2026, 4, 16, 9, 30, 0, 0, time.UTC),
		PatternInsights: []score.PatternInsight{
			{
				Title:       "Back-to-back meeting mornings",
				Explanation: "Your next-day strain rises after stacked morning meetings.",
				Evidence:    "4 matching check-ins",
				Driver:      "meetings",
				Confidence:  score.ConfidenceHigh,
			},
		},
	})

	if rec.PrimaryAction.Key != "protect_focus_block" {
		t.Fatalf("primary key = %q, want %q", rec.PrimaryAction.Key, "protect_focus_block")
	}
	if rec.TargetDay != RecommendationTargetTomorrow {
		t.Fatalf("target day = %q, want %q", rec.TargetDay, RecommendationTargetTomorrow)
	}
}

func TestBuildBriefingRecommendation_AllowsTodayOnlyWhenActionIsStillFeasible(t *testing.T) {
	rec := BuildBriefingRecommendation(BriefingRecommendationInput{
		CheckInCount: 8,
		Now:          time.Date(2026, 4, 16, 16, 0, 0, 0, time.UTC),
		PatternInsights: []score.PatternInsight{
			{
				Title:       "Late work is pushing you up",
				Explanation: "Your strain tends to stay elevated after late work nights.",
				Evidence:    "3 matching check-ins",
				Driver:      "shutdown",
				Confidence:  score.ConfidenceMedium,
			},
		},
	})

	if rec.TargetDay != RecommendationTargetToday {
		t.Fatalf("target day = %q, want %q", rec.TargetDay, RecommendationTargetToday)
	}
	if rec.PrimaryAction.Key != "shutdown_on_time" {
		t.Fatalf("primary key = %q, want %q", rec.PrimaryAction.Key, "shutdown_on_time")
	}
}

func TestBuildBriefingRecommendation_UsesDistinctFallbackAction(t *testing.T) {
	rec := BuildBriefingRecommendation(BriefingRecommendationInput{
		CheckInCount: 14,
		Now:          time.Date(2026, 4, 16, 11, 0, 0, 0, time.UTC),
		RecoveryFeedback: []score.RecoveryFeedback{
			{
				Title:              "Early shutdown",
				Explanation:        "Leaving work on time lowers your next-day strain.",
				Evidence:           "3 improvements",
				Driver:             "shutdown",
				Confidence:         score.ConfidenceHigh,
				AverageImprovement: 6,
			},
		},
	})

	if rec.FallbackAction == nil {
		t.Fatalf("fallback = nil, want fallback action")
	}
	if rec.FallbackAction.Key == rec.PrimaryAction.Key {
		t.Fatalf("fallback key = %q, want action distinct from primary", rec.FallbackAction.Key)
	}
}
