package insight

import (
	"sort"
	"time"

	"github.com/nyasha-hama/burnout-predictor-api/internal/score"
)

type RecommendationTargetDay string

const (
	RecommendationTargetToday    RecommendationTargetDay = "today"
	RecommendationTargetTomorrow RecommendationTargetDay = "tomorrow"
)

type RecommendedActionCandidate struct {
	Key       string                  `json:"key"`
	Title     string                  `json:"title"`
	Detail    string                  `json:"detail"`
	Timeframe RecommendationTargetDay `json:"timeframe"`
	Kind      PersonalizationKind     `json:"kind"`
	State     RecommendationState     `json:"state"`
}

type BriefingRecommendation struct {
	Headline             string                      `json:"headline"`
	TargetDay            RecommendationTargetDay     `json:"target_day"`
	PrimaryAction        RecommendedActionCandidate  `json:"primary_action"`
	FallbackAction       *RecommendedActionCandidate `json:"fallback_action,omitempty"`
	PredictedScoreDelta  int                         `json:"predicted_score_delta"`
	RiskReductionSummary string                      `json:"risk_reduction_summary"`
	WhyThisAction        string                      `json:"why_this_action"`
	WhyNow               string                      `json:"why_now"`
	Confidence           string                      `json:"confidence"`
	Basis                *RecommendationBasis        `json:"basis,omitempty"`
}

type BriefingRecommendationInput struct {
	PatternInsights  []score.PatternInsight
	RecoveryFeedback []score.RecoveryFeedback
	WhatWorkedToday  *WhatWorkedToday
	CheckInCount     int64
	Now              time.Time
}

type actionDefinition struct {
	key             string
	title           string
	detail          string
	kind            PersonalizationKind
	sameDayEligible bool
	shutdownHour    int
	scoreDelta      int
	riskSummary     string
}

var actionCatalog = []actionDefinition{
	{key: "protect_focus_block", title: "Protect a 90-minute focus block tomorrow morning", detail: "Keep your first high-focus block free so tomorrow starts lighter.", kind: PersonalizationKindTrigger, sameDayEligible: false, scoreDelta: 6, riskSummary: "Reduces the chance of a heavier start tomorrow."},
	{key: "shutdown_on_time", title: "End work by 6 PM tonight", detail: "Use an earlier shutdown to prevent a second high-strain day.", kind: PersonalizationKindRecovery, sameDayEligible: true, shutdownHour: 18, scoreDelta: 4, riskSummary: "Reduces the chance of another high-strain day."},
	{key: "reduce_meeting_load", title: "Reduce tomorrow's meeting load", detail: "Create more open space so the morning is not fully consumed.", kind: PersonalizationKindTrigger, sameDayEligible: false, scoreDelta: 5, riskSummary: "Reduces the chance of a crash day driven by stacked meetings."},
	{key: "prioritize_sleep", title: "Prioritize sleep tonight", detail: "A steadier night remains the safest recovery lever.", kind: PersonalizationKindRecovery, sameDayEligible: true, shutdownHour: 22, scoreDelta: 3, riskSummary: "Improves the odds of a steadier tomorrow."},
	{key: "take_recovery_block", title: "Take one short recovery block today", detail: "Create one protected break to interrupt the strain pattern.", kind: PersonalizationKindRecovery, sameDayEligible: true, shutdownHour: 17, scoreDelta: 3, riskSummary: "Reduces the chance that strain compounds through the day."},
}

type candidateScore struct {
	action      RecommendedActionCandidate
	scoreDelta  int
	riskSummary string
	rank        int
	why         string
	whyNow      string
	basis       *RecommendationBasis
}

func BuildBriefingRecommendation(input BriefingRecommendationInput) *BriefingRecommendation {
	if input.CheckInCount < 3 {
		return buildGenericRecommendation(input)
	}

	candidates := buildCandidates(input)
	if len(candidates) == 0 {
		return buildGenericRecommendation(input)
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		return candidates[i].rank > candidates[j].rank
	})

	primary := candidates[0]
	var fallback *candidateScore
	for i := 1; i < len(candidates); i++ {
		if candidates[i].action.Key != primary.action.Key {
			fallback = &candidates[i]
			break
		}
	}

	rec := &BriefingRecommendation{
		Headline:             headlineFor(primary.action.Timeframe),
		TargetDay:            primary.action.Timeframe,
		PrimaryAction:        primary.action,
		PredictedScoreDelta:  primary.scoreDelta,
		RiskReductionSummary: primary.riskSummary,
		WhyThisAction:        primary.why,
		WhyNow:               primary.whyNow,
		Confidence:           string(primary.action.State),
		Basis:                primary.basis,
	}
	if fallback != nil {
		rec.FallbackAction = &fallback.action
	}
	return rec
}

func buildGenericRecommendation(input BriefingRecommendationInput) *BriefingRecommendation {
	return &BriefingRecommendation{
		Headline:  "Best move for tomorrow",
		TargetDay: RecommendationTargetTomorrow,
		PrimaryAction: RecommendedActionCandidate{
			Key:       "prioritize_sleep",
			Title:     "Prioritize sleep tonight",
			Detail:    "A steadier night is the safest first lever while Overload is still learning your patterns.",
			Timeframe: RecommendationTargetTomorrow,
			Kind:      PersonalizationKindExperiment,
			State:     RecommendationStateGeneric,
		},
		FallbackAction: &RecommendedActionCandidate{
			Key:       "take_recovery_block",
			Title:     "Protect one short recovery block tomorrow",
			Detail:    "Give yourself one deliberate break to lower the load while the model calibrates.",
			Timeframe: RecommendationTargetTomorrow,
			Kind:      PersonalizationKindExperiment,
			State:     RecommendationStateGeneric,
		},
		PredictedScoreDelta:  3,
		RiskReductionSummary: "Reduces the chance of another high-strain day while we collect more evidence.",
		WhyThisAction:        "This is generic for now because there are not enough check-ins to make the recommendation personal.",
		WhyNow:               "This is easiest to set up before tomorrow starts.",
		Confidence:           "generic",
		Basis: &RecommendationBasis{
			Kind:          PersonalizationKindExperiment,
			State:         RecommendationStateGeneric,
			Summary:       "We are still collecting enough check-ins to make this recommendation personal.",
			EvidenceCount: int(input.CheckInCount),
		},
	}
}

func buildCandidates(input BriefingRecommendationInput) []candidateScore {
	var candidates []candidateScore
	currentHour := input.Now.Hour()

	for _, action := range actionCatalog {
		timeframe := RecommendationTargetTomorrow
		if action.sameDayEligible && currentHour < action.shutdownHour {
			timeframe = RecommendationTargetToday
		}

		matched := matchAction(action, input)
		if matched == nil {
			continue
		}

		scoreDelta := action.scoreDelta
		riskSummary := action.riskSummary
		why := matched.why
		whyNow := matched.whyNow
		basis := matched.basis
		rank := matched.rank

		candidates = append(candidates, candidateScore{
			action: RecommendedActionCandidate{
				Key:       action.key,
				Title:     action.title,
				Detail:    action.detail,
				Timeframe: timeframe,
				Kind:      action.kind,
				State:     matched.state,
			},
			scoreDelta:  scoreDelta,
			riskSummary: riskSummary,
			rank:        rank,
			why:         why,
			whyNow:      whyNow,
			basis:       basis,
		})
	}

	return candidates
}

type matchResult struct {
	why    string
	whyNow string
	basis  *RecommendationBasis
	rank   int
	state  RecommendationState
}

func matchAction(action actionDefinition, input BriefingRecommendationInput) *matchResult {
	switch action.key {
	case "protect_focus_block", "reduce_meeting_load":
		for _, p := range input.PatternInsights {
			if p.Driver == "meetings" {
				state := RecommendationStateObserved
				if p.Confidence == score.ConfidenceMedium {
					state = RecommendationStateEmerging
				}
				if p.Confidence == score.ConfidenceHigh {
					state = RecommendationStateConfirmed
				}
				rank := 1
				if state == RecommendationStateConfirmed {
					rank = 10
				}
				return &matchResult{
					why:    "Meetings are your strongest confirmed trigger.",
					whyNow: "This is easiest to set up before tomorrow starts.",
					basis: &RecommendationBasis{
						Kind:          PersonalizationKindTrigger,
						State:         state,
						Summary:       p.Explanation,
						EvidenceCount: recExtractEvidenceCount(p.Evidence),
					},
					rank:  rank,
					state: state,
				}
			}
		}

	case "shutdown_on_time":
		for _, p := range input.PatternInsights {
			if p.Driver == "shutdown" {
				state := RecommendationStateObserved
				if p.Confidence == score.ConfidenceMedium {
					state = RecommendationStateEmerging
				}
				if p.Confidence == score.ConfidenceHigh {
					state = RecommendationStateConfirmed
				}
				return &matchResult{
					why:    "Late work is pushing your strain up.",
					whyNow: "There's still time to end work on time today.",
					basis: &RecommendationBasis{
						Kind:          PersonalizationKindRecovery,
						State:         state,
						Summary:       p.Explanation,
						EvidenceCount: recExtractEvidenceCount(p.Evidence),
					},
					rank:  7,
					state: state,
				}
			}
		}
		for _, r := range input.RecoveryFeedback {
			if r.Driver == "shutdown" && r.Confidence == score.ConfidenceHigh {
				return &matchResult{
					why:    "Early shutdown has lowered your strain before.",
					whyNow: "This worked before, try it again today.",
					basis: &RecommendationBasis{
						Kind:          PersonalizationKindRecovery,
						State:         RecommendationStateConfirmed,
						Summary:       r.Explanation,
						EvidenceCount: recExtractEvidenceCount(r.Evidence),
					},
					rank:  8,
					state: RecommendationStateConfirmed,
				}
			}
		}

	case "prioritize_sleep":
		if len(input.PatternInsights) == 0 && len(input.RecoveryFeedback) == 0 {
			return &matchResult{
				why:    "Better sleep improves energy and focus.",
				whyNow: "Start tonight for a better tomorrow.",
				basis: &RecommendationBasis{
					Kind:          PersonalizationKindRecovery,
					State:         RecommendationStateGeneric,
					Summary:       "Sleep is a foundational recovery lever.",
					EvidenceCount: 0,
				},
				rank:  2,
				state: RecommendationStateGeneric,
			}
		}

	case "take_recovery_block":
		if len(input.RecoveryFeedback) > 0 {
			r := input.RecoveryFeedback[0]
			state := RecommendationStateObserved
			if r.Confidence == score.ConfidenceMedium {
				state = RecommendationStateEmerging
			}
			if r.Confidence == score.ConfidenceHigh {
				state = RecommendationStateConfirmed
			}
			return &matchResult{
				why:    "This recovery action has worked for you before.",
				whyNow: "Even a short break can help today.",
				basis: &RecommendationBasis{
					Kind:          PersonalizationKindRecovery,
					State:         state,
					Summary:       r.Explanation,
					EvidenceCount: recExtractEvidenceCount(r.Evidence),
				},
				rank:  5,
				state: state,
			}
		}
		if input.WhatWorkedToday != nil {
			return &matchResult{
				why:    "You tried something that worked today.",
				whyNow: "Do it again to keep the momentum.",
				basis: &RecommendationBasis{
					Kind:          PersonalizationKindRecovery,
					State:         RecommendationStateObserved,
					Summary:       "What worked today can work again.",
					EvidenceCount: 1,
				},
				rank:  4,
				state: RecommendationStateObserved,
			}
		}
	}

	return nil
}

func headlineFor(timeframe RecommendationTargetDay) string {
	if timeframe == RecommendationTargetToday {
		return "Best move for today"
	}
	return "Best move for tomorrow"
}

func recExtractEvidenceCount(s string) int {
	return 1
}
