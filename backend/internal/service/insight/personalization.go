package insight

import (
	"strings"

	"github.com/nyasha-hama/burnout-predictor-api/internal/score"
)

type RecommendationState string

const (
	RecommendationStateGeneric   RecommendationState = "generic"
	RecommendationStateObserved  RecommendationState = "observed"
	RecommendationStateEmerging  RecommendationState = "emerging"
	RecommendationStateConfirmed RecommendationState = "confirmed"
)

type PersonalizationKind string

const (
	PersonalizationKindTrigger    PersonalizationKind = "trigger"
	PersonalizationKindRecovery   PersonalizationKind = "recovery"
	PersonalizationKindExperiment PersonalizationKind = "experiment"
)

type RecommendationBasis struct {
	Kind          PersonalizationKind `json:"kind"`
	State         RecommendationState `json:"state"`
	Summary       string              `json:"summary"`
	EvidenceCount int                 `json:"evidence_count"`
}

type BriefingChange struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

type PersonalizationProgress struct {
	ConfirmedTriggers       int    `json:"confirmed_triggers"`
	ConfirmedRecoveryLevers int    `json:"confirmed_recovery_levers"`
	Experiments             int    `json:"experiments"`
	ConfidenceTrend         string `json:"confidence_trend"`
}

type PlaybookItem struct {
	Key           string              `json:"key"`
	Title         string              `json:"title"`
	Detail        string              `json:"detail"`
	Kind          PersonalizationKind `json:"kind"`
	State         RecommendationState `json:"state"`
	EvidenceCount int                 `json:"evidence_count"`
	LastSeenDate  string              `json:"last_seen_date"`
	Trend         string              `json:"trend"`
}

type PlaybookSections struct {
	ConfirmedTriggers       []PlaybookItem `json:"confirmed_triggers"`
	ConfirmedRecoveryLevers []PlaybookItem `json:"confirmed_recovery_levers"`
	Experiments             []PlaybookItem `json:"experiments"`
}

type PersonalizationView struct {
	Progress            PersonalizationProgress `json:"progress"`
	RecommendationBasis *RecommendationBasis    `json:"recommendation_basis,omitempty"`
	Playbook            PlaybookSections        `json:"playbook"`
}

func BuildBriefingChange(currentKey, previousKey, body string) *BriefingChange {
	if currentKey == "" || currentKey == previousKey || body == "" {
		return nil
	}
	return &BriefingChange{
		Title: "New today",
		Body:  body,
	}
}

func BuildPersonalizationView(
	patternInsights []score.PatternInsight,
	recoveryFeedback []score.RecoveryFeedback,
	whatWorkedToday *WhatWorkedToday,
	checkInCount int64,
	lastSeenDate string,
) PersonalizationView {
	view := PersonalizationView{
		Progress: PersonalizationProgress{ConfidenceTrend: "flat"},
		Playbook: PlaybookSections{
			ConfirmedTriggers:       []PlaybookItem{},
			ConfirmedRecoveryLevers: []PlaybookItem{},
			Experiments:             []PlaybookItem{},
		},
	}

	if checkInCount < 3 {
		view.RecommendationBasis = &RecommendationBasis{
			Kind:          PersonalizationKindExperiment,
			State:         RecommendationStateGeneric,
			Summary:       "We are still collecting enough check-ins to make this recommendation personal.",
			EvidenceCount: int(checkInCount),
		}
		return view
	}

	for _, p := range patternInsights {
		state := RecommendationStateObserved
		if p.Confidence == "medium" {
			state = RecommendationStateEmerging
		}
		if p.Confidence == "high" {
			state = RecommendationStateConfirmed
		}
		item := PlaybookItem{
			Key:           p.Driver,
			Title:         p.Title,
			Detail:        p.Explanation,
			Kind:          PersonalizationKindTrigger,
			State:         state,
			EvidenceCount: extractEvidenceCount(p.Evidence),
			LastSeenDate:  lastSeenDate,
			Trend:         "stable",
		}
		if state == RecommendationStateConfirmed {
			view.Playbook.ConfirmedTriggers = append(view.Playbook.ConfirmedTriggers, item)
			view.Progress.ConfirmedTriggers++
		} else {
			item.Kind = PersonalizationKindExperiment
			view.Playbook.Experiments = append(view.Playbook.Experiments, item)
			view.Progress.Experiments++
		}
	}

	for _, r := range recoveryFeedback {
		state := RecommendationStateObserved
		if r.Confidence == "medium" {
			state = RecommendationStateEmerging
		}
		if r.Confidence == "high" {
			state = RecommendationStateConfirmed
		}
		item := PlaybookItem{
			Key:           r.Driver,
			Title:         r.Title,
			Detail:        r.Explanation,
			Kind:          PersonalizationKindRecovery,
			State:         state,
			EvidenceCount: extractEvidenceCount(r.Evidence),
			LastSeenDate:  lastSeenDate,
			Trend:         "stable",
		}
		if state == RecommendationStateConfirmed {
			view.Playbook.ConfirmedRecoveryLevers = append(view.Playbook.ConfirmedRecoveryLevers, item)
			view.Progress.ConfirmedRecoveryLevers++
		} else {
			item.Kind = PersonalizationKindExperiment
			view.Playbook.Experiments = append(view.Playbook.Experiments, item)
			view.Progress.Experiments++
		}
	}

	if len(view.Playbook.ConfirmedTriggers) > 0 {
		top := view.Playbook.ConfirmedTriggers[0]
		view.RecommendationBasis = &RecommendationBasis{
			Kind:          PersonalizationKindTrigger,
			State:         RecommendationStateConfirmed,
			Summary:       top.Detail,
			EvidenceCount: top.EvidenceCount,
		}
	} else if len(view.Playbook.Experiments) > 0 {
		top := view.Playbook.Experiments[0]
		view.RecommendationBasis = &RecommendationBasis{
			Kind:          top.Kind,
			State:         top.State,
			Summary:       top.Detail,
			EvidenceCount: top.EvidenceCount,
		}
	}

	if whatWorkedToday != nil {
		view.Progress.ConfidenceTrend = "up"
	}
	if view.Progress.ConfirmedTriggers == 0 && view.Progress.ConfirmedRecoveryLevers == 0 {
		view.Progress.ConfidenceTrend = "calibrating"
	}

	return view
}

func extractEvidenceCount(s string) int {
	fields := strings.Fields(s)
	for _, field := range fields {
		switch field {
		case "1", "2", "3", "4", "5", "6", "7", "8", "9":
			return int(field[0] - '0')
		}
	}
	return 1
}
