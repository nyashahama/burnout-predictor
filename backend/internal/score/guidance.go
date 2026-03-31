package score

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

type ForecastDirection string

const (
	ForecastDown   ForecastDirection = "down"
	ForecastStable ForecastDirection = "stable"
	ForecastUp     ForecastDirection = "up"
)

type InsightConfidence string

const (
	ConfidenceLow    InsightConfidence = "low"
	ConfidenceMedium InsightConfidence = "medium"
	ConfidenceHigh   InsightConfidence = "high"
)

// AnalysisEntry is the richer per-day history shape used to power forecast,
// cause-based pattern detection, and recovery feedback.
type AnalysisEntry struct {
	Date             time.Time
	Stress           int
	Score            int
	Note             string
	EnergyLevel      *int
	FocusQuality     *int
	HoursWorked      *float64
	PhysicalSymptoms []string
}

type DailyForecast struct {
	Score      int                `json:"score"`
	Delta      int                `json:"delta"`
	Direction  ForecastDirection  `json:"direction"`
	Confidence InsightConfidence  `json:"confidence"`
	Summary    string             `json:"summary"`
}

type RecommendedAction struct {
	Title      string            `json:"title"`
	Detail     string            `json:"detail"`
	Driver     string            `json:"driver"`
	Confidence InsightConfidence `json:"confidence"`
}

type PatternInsight struct {
	Title       string            `json:"title"`
	Explanation string            `json:"explanation"`
	Evidence    string            `json:"evidence"`
	Driver      string            `json:"driver"`
	Confidence  InsightConfidence `json:"confidence"`
}

type RecoveryFeedback struct {
	Title              string            `json:"title"`
	Explanation        string            `json:"explanation"`
	Evidence           string            `json:"evidence"`
	Driver             string            `json:"driver"`
	Confidence         InsightConfidence `json:"confidence"`
	AverageImprovement int               `json:"average_improvement"`
}

func BuildDailyForecast(currentScore int, dangerStreak int, entries []AnalysisEntry) DailyForecast {
	if len(entries) == 0 {
		return DailyForecast{
			Score:      currentScore,
			Delta:      0,
			Direction:  ForecastStable,
			Confidence: ConfidenceLow,
			Summary:    "Log today to unlock a sharper tomorrow forecast.",
		}
	}

	recent := entries
	if len(recent) > 7 {
		recent = recent[:7]
	}
	today := recent[0]
	delta := 0

	if today.Stress >= 4 {
		delta += 4
	} else if today.Stress <= 2 {
		delta -= 3
	}

	if avgStress(recent[:intMin(len(recent), 3)]) >= 4 {
		delta += 3
	} else if avgStress(recent[:intMin(len(recent), 3)]) <= 2 {
		delta -= 2
	}

	if today.EnergyLevel != nil {
		switch {
		case *today.EnergyLevel <= 2:
			delta += 3
		case *today.EnergyLevel >= 4:
			delta -= 2
		}
	}
	if today.FocusQuality != nil {
		switch {
		case *today.FocusQuality <= 2:
			delta += 2
		case *today.FocusQuality >= 4:
			delta -= 1
		}
	}
	if today.HoursWorked != nil {
		switch {
		case *today.HoursWorked >= 9:
			delta += 3
		case *today.HoursWorked <= 7.5:
			delta -= 2
		}
	}
	if len(today.PhysicalSymptoms) > 0 {
		delta += intMin(3, len(today.PhysicalSymptoms))
	}
	if hasKeyword(today.Note, "deadline", "deliver", "launch", "submit", "due") {
		delta += 2
	}
	if hasKeyword(today.Note, "meeting", "call", "sync", "standup", "review", "presentation", "demo") {
		delta += 2
	}
	if hasKeyword(today.Note, "sleep", "tired", "exhausted", "rest", "insomnia") {
		delta += 2
	}
	if dangerStreak >= 2 {
		delta += 2
	}

	score := clamp(currentScore+delta, 8, 92)
	confidence := confidenceFromSamples(len(entries))
	direction := forecastDirection(delta)

	var summary string
	switch direction {
	case ForecastUp:
		summary = fmt.Sprintf("Tomorrow is likely to run about %d points higher unless you reduce the load tonight.", absInt(delta))
	case ForecastDown:
		summary = fmt.Sprintf("Tomorrow should ease by about %d points if today ends cleanly.", absInt(delta))
	default:
		summary = "Tomorrow looks similar to today unless something structural changes."
	}

	return DailyForecast{
		Score:      score,
		Delta:      delta,
		Direction:  direction,
		Confidence: confidence,
		Summary:    summary,
	}
}

func BuildRecommendedAction(currentScore int, dangerStreak int, suggestion string, entries []AnalysisEntry, hasCheckedIn bool) RecommendedAction {
	if !hasCheckedIn || len(entries) == 0 {
		return RecommendedAction{
			Title:      "Complete today's check-in",
			Detail:     suggestion,
			Driver:     "missing_checkin",
			Confidence: ConfidenceLow,
		}
	}

	today := entries[0]
	switch {
	case hasKeyword(today.Note, "sleep", "tired", "exhausted", "rest", "insomnia") || hasSymptom(today.PhysicalSymptoms, "fatigue", "trouble_sleeping"):
		return RecommendedAction{
			Title:      "Protect tonight's sleep",
			Detail:     suggestion,
			Driver:     "sleep",
			Confidence: ConfidenceHigh,
		}
	case today.HoursWorked != nil && *today.HoursWorked >= 9:
		return RecommendedAction{
			Title:      "End work earlier tomorrow",
			Detail:     suggestion,
			Driver:     "hours_worked",
			Confidence: ConfidenceHigh,
		}
	case hasKeyword(today.Note, "meeting", "call", "sync", "standup", "review", "presentation", "demo"):
		return RecommendedAction{
			Title:      "Cut one meeting tomorrow",
			Detail:     suggestion,
			Driver:     "meeting_load",
			Confidence: ConfidenceHigh,
		}
	case today.FocusQuality != nil && *today.FocusQuality <= 2:
		return RecommendedAction{
			Title:      "Protect tomorrow morning",
			Detail:     suggestion,
			Driver:     "focus",
			Confidence: ConfidenceMedium,
		}
	case dangerStreak >= 2 || currentScore > 75:
		return RecommendedAction{
			Title:      "Take one thing off your plate",
			Detail:     suggestion,
			Driver:     "compounding_load",
			Confidence: ConfidenceMedium,
		}
	default:
		return RecommendedAction{
			Title:      "Keep tomorrow protected",
			Detail:     suggestion,
			Driver:     "baseline",
			Confidence: ConfidenceLow,
		}
	}
}

func BuildPatternInsights(entries []AnalysisEntry) []PatternInsight {
	if len(entries) < 7 {
		return nil
	}

	candidates := make([]patternCandidate, 0, 5)
	if p := detectWeekdayPattern(entries); p != nil {
		candidates = append(candidates, *p)
	}
	if p := detectHoursPattern(entries); p != nil {
		candidates = append(candidates, *p)
	}
	if p := detectEnergyPattern(entries); p != nil {
		candidates = append(candidates, *p)
	}
	if p := detectFocusPattern(entries); p != nil {
		candidates = append(candidates, *p)
	}
	if p := detectKeywordTrigger(entries); p != nil {
		candidates = append(candidates, *p)
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		return candidates[i].rank > candidates[j].rank
	})

	seenDrivers := map[string]bool{}
	out := make([]PatternInsight, 0, 3)
	for _, candidate := range candidates {
		if seenDrivers[candidate.Driver] {
			continue
		}
		seenDrivers[candidate.Driver] = true
		out = append(out, candidate.PatternInsight)
		if len(out) == 3 {
			break
		}
	}
	return out
}

func BuildRecoveryFeedback(entries []AnalysisEntry) []RecoveryFeedback {
	if len(entries) < 4 {
		return nil
	}

	ordered := append([]AnalysisEntry(nil), entries...)
	sort.Slice(ordered, func(i, j int) bool {
		return ordered[i].Date.Before(ordered[j].Date)
	})

	candidates := make([]recoveryCandidate, 0, 4)
	if r := evaluateRecoveryCandidate(ordered, recoveryRule{
		driver: "hours_worked",
		title:  "Shorter workdays help you recover faster",
		label:  "worked under 8 hours",
		match: func(e AnalysisEntry) bool {
			return e.HoursWorked != nil && *e.HoursWorked <= 8
		},
	}); r != nil {
		candidates = append(candidates, *r)
	}
	if r := evaluateRecoveryCandidate(ordered, recoveryRule{
		driver: "energy",
		title:  "High-energy days carry into the next morning",
		label:  "reported energy at 4 or 5",
		match: func(e AnalysisEntry) bool {
			return e.EnergyLevel != nil && *e.EnergyLevel >= 4
		},
	}); r != nil {
		candidates = append(candidates, *r)
	}
	if r := evaluateRecoveryCandidate(ordered, recoveryRule{
		driver: "focus",
		title:  "Sharp-focus days predict a lighter next day",
		label:  "reported focus at 4 or 5",
		match: func(e AnalysisEntry) bool {
			return e.FocusQuality != nil && *e.FocusQuality >= 4
		},
	}); r != nil {
		candidates = append(candidates, *r)
	}
	if r := evaluateRecoveryCandidate(ordered, recoveryRule{
		driver: "symptoms",
		title:  "Symptom-free days rebound better",
		label:  "had no physical symptoms",
		match: func(e AnalysisEntry) bool {
			return len(e.PhysicalSymptoms) == 0
		},
	}); r != nil {
		candidates = append(candidates, *r)
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		return candidates[i].rank > candidates[j].rank
	})

	out := make([]RecoveryFeedback, 0, 2)
	for _, candidate := range candidates {
		out = append(out, candidate.RecoveryFeedback)
		if len(out) == 2 {
			break
		}
	}
	return out
}

type patternCandidate struct {
	PatternInsight
	rank int
}

type recoveryCandidate struct {
	RecoveryFeedback
	rank int
}

func detectWeekdayPattern(entries []AnalysisEntry) *patternCandidate {
	byDow := map[int][]int{}
	total := 0
	for _, entry := range entries {
		byDow[int(entry.Date.Weekday())] = append(byDow[int(entry.Date.Weekday())], entry.Score)
		total += entry.Score
	}
	overall := total / len(entries)
	bestDow, bestAvg, bestSamples := -1, 0, 0
	for dow, scores := range byDow {
		if len(scores) < 2 {
			continue
		}
		avg := sumSlice(scores) / len(scores)
		if avg > bestAvg && avg >= overall+5 {
			bestDow = dow
			bestAvg = avg
			bestSamples = len(scores)
		}
	}
	if bestDow < 0 {
		return nil
	}
	confidence := confidenceFromSamples(bestSamples)
	return &patternCandidate{
		PatternInsight: PatternInsight{
			Title:       fmt.Sprintf("%ss are your pressure point", dayNames[bestDow]),
			Explanation: fmt.Sprintf("Your average score on %ss runs %d points above the rest of your week.", dayNames[bestDow], bestAvg-overall),
			Evidence:    fmt.Sprintf("%d %s samples averaged %d versus %d overall.", bestSamples, strings.ToLower(dayNames[bestDow]), bestAvg, overall),
			Driver:      "weekday",
			Confidence:  confidence,
		},
		rank: bestSamples*10 + (bestAvg - overall),
	}
}

func detectHoursPattern(entries []AnalysisEntry) *patternCandidate {
	longDayScores := make([]int, 0)
	shortDayScores := make([]int, 0)
	for _, entry := range entries {
		if entry.HoursWorked == nil {
			continue
		}
		if *entry.HoursWorked >= 9 {
			longDayScores = append(longDayScores, entry.Score)
		}
		if *entry.HoursWorked <= 8 {
			shortDayScores = append(shortDayScores, entry.Score)
		}
	}
	if len(longDayScores) < 2 || len(shortDayScores) < 2 {
		return nil
	}
	longAvg := sumSlice(longDayScores) / len(longDayScores)
	shortAvg := sumSlice(shortDayScores) / len(shortDayScores)
	if longAvg < shortAvg+5 {
		return nil
	}
	samples := intMin(len(longDayScores), len(shortDayScores))
	return &patternCandidate{
		PatternInsight: PatternInsight{
			Title:       "Long days are a reliable trigger",
			Explanation: fmt.Sprintf("When you work 9+ hours, your score runs about %d points higher than on shorter days.", longAvg-shortAvg),
			Evidence:    fmt.Sprintf("%d long days averaged %d versus %d on shorter days.", len(longDayScores), longAvg, shortAvg),
			Driver:      "hours_worked",
			Confidence:  confidenceFromSamples(samples),
		},
		rank: samples*10 + (longAvg - shortAvg),
	}
}

func detectEnergyPattern(entries []AnalysisEntry) *patternCandidate {
	low := make([]int, 0)
	high := make([]int, 0)
	for _, entry := range entries {
		if entry.EnergyLevel == nil {
			continue
		}
		if *entry.EnergyLevel <= 2 {
			low = append(low, entry.Score)
		}
		if *entry.EnergyLevel >= 4 {
			high = append(high, entry.Score)
		}
	}
	if len(low) < 2 || len(high) < 2 {
		return nil
	}
	lowAvg := sumSlice(low) / len(low)
	highAvg := sumSlice(high) / len(high)
	if lowAvg < highAvg+5 {
		return nil
	}
	samples := intMin(len(low), len(high))
	return &patternCandidate{
		PatternInsight: PatternInsight{
			Title:       "Low-energy days drag the score up fast",
			Explanation: fmt.Sprintf("Low-energy check-ins are running about %d points higher than your high-energy days.", lowAvg-highAvg),
			Evidence:    fmt.Sprintf("%d low-energy days averaged %d versus %d when your energy was high.", len(low), lowAvg, highAvg),
			Driver:      "energy",
			Confidence:  confidenceFromSamples(samples),
		},
		rank: samples*10 + (lowAvg - highAvg),
	}
}

func detectFocusPattern(entries []AnalysisEntry) *patternCandidate {
	low := make([]int, 0)
	high := make([]int, 0)
	for _, entry := range entries {
		if entry.FocusQuality == nil {
			continue
		}
		if *entry.FocusQuality <= 2 {
			low = append(low, entry.Score)
		}
		if *entry.FocusQuality >= 4 {
			high = append(high, entry.Score)
		}
	}
	if len(low) < 2 || len(high) < 2 {
		return nil
	}
	lowAvg := sumSlice(low) / len(low)
	highAvg := sumSlice(high) / len(high)
	if lowAvg < highAvg+5 {
		return nil
	}
	samples := intMin(len(low), len(high))
	return &patternCandidate{
		PatternInsight: PatternInsight{
			Title:       "Scattered days are pushing you off baseline",
			Explanation: fmt.Sprintf("When focus drops, your score runs about %d points higher than on sharp-focus days.", lowAvg-highAvg),
			Evidence:    fmt.Sprintf("%d low-focus days averaged %d versus %d when focus was high.", len(low), lowAvg, highAvg),
			Driver:      "focus",
			Confidence:  confidenceFromSamples(samples),
		},
		rank: samples*10 + (lowAvg - highAvg),
	}
}

func detectKeywordTrigger(entries []AnalysisEntry) *patternCandidate {
	highStrainDays := 0
	meetings := 0
	deadlines := 0
	sleep := 0

	for _, entry := range entries {
		if entry.Score <= 65 {
			continue
		}
		highStrainDays++
		switch {
		case hasKeyword(entry.Note, "meeting", "call", "sync", "standup", "review", "presentation", "demo"):
			meetings++
		case hasKeyword(entry.Note, "deadline", "deliver", "launch", "submit", "due"):
			deadlines++
		case hasKeyword(entry.Note, "sleep", "tired", "exhausted", "rest", "insomnia"):
			sleep++
		}
	}
	if highStrainDays < 3 {
		return nil
	}

	driver := ""
	label := ""
	count := 0
	switch {
	case meetings >= deadlines && meetings >= sleep && meetings >= 2:
		driver, label, count = "meeting_load", "meeting-heavy", meetings
	case deadlines >= meetings && deadlines >= sleep && deadlines >= 2:
		driver, label, count = "deadlines", "deadline-heavy", deadlines
	case sleep >= 2:
		driver, label, count = "sleep", "sleep-related", sleep
	default:
		return nil
	}

	if count*100/highStrainDays < 40 {
		return nil
	}

	return &patternCandidate{
		PatternInsight: PatternInsight{
			Title:       fmt.Sprintf("%s days are showing up in the red", humanizeLabel(label)),
			Explanation: fmt.Sprintf("%d of your last %d danger-zone days mentioned %s context.", count, highStrainDays, strings.ReplaceAll(label, "-", " ")),
			Evidence:    fmt.Sprintf("%d/%d recent high-strain notes pointed to the same driver.", count, highStrainDays),
			Driver:      driver,
			Confidence:  confidenceFromSamples(count),
		},
		rank: count*12 + highStrainDays,
	}
}

type recoveryRule struct {
	driver string
	title  string
	label  string
	match  func(entry AnalysisEntry) bool
}

func evaluateRecoveryCandidate(entries []AnalysisEntry, rule recoveryRule) *recoveryCandidate {
	type pairedImprovement struct {
		improvement int
		success     bool
	}

	pairs := make([]pairedImprovement, 0)
	for i := 0; i < len(entries)-1; i++ {
		current := entries[i]
		next := entries[i+1]
		if !current.Date.AddDate(0, 0, 1).Equal(next.Date) {
			continue
		}
		if !rule.match(current) {
			continue
		}
		improvement := current.Score - next.Score
		pairs = append(pairs, pairedImprovement{
			improvement: improvement,
			success:     improvement >= 3,
		})
	}

	if len(pairs) < 2 {
		return nil
	}

	totalImprovement := 0
	successes := 0
	for _, pair := range pairs {
		totalImprovement += pair.improvement
		if pair.success {
			successes++
		}
	}
	avgImprovement := roundInt(float64(totalImprovement) / float64(len(pairs)))
	if avgImprovement < 3 || successes < 2 {
		return nil
	}

	return &recoveryCandidate{
		RecoveryFeedback: RecoveryFeedback{
			Title:              rule.title,
			Explanation:        fmt.Sprintf("The next day eased by about %d points when you %s.", avgImprovement, rule.label),
			Evidence:           fmt.Sprintf("%d of %d matching days were followed by a materially lower score.", successes, len(pairs)),
			Driver:             rule.driver,
			Confidence:         confidenceFromSamples(len(pairs)),
			AverageImprovement: avgImprovement,
		},
		rank: len(pairs)*10 + avgImprovement,
	}
}

func avgStress(entries []AnalysisEntry) int {
	if len(entries) == 0 {
		return 0
	}
	sum := 0
	for _, entry := range entries {
		sum += entry.Stress
	}
	return roundInt(float64(sum) / float64(len(entries)))
}

func confidenceFromSamples(samples int) InsightConfidence {
	switch {
	case samples >= 6:
		return ConfidenceHigh
	case samples >= 3:
		return ConfidenceMedium
	default:
		return ConfidenceLow
	}
}

func forecastDirection(delta int) ForecastDirection {
	switch {
	case delta >= 3:
		return ForecastUp
	case delta <= -3:
		return ForecastDown
	default:
		return ForecastStable
	}
}

func hasKeyword(note string, keywords ...string) bool {
	note = strings.ToLower(note)
	for _, keyword := range keywords {
		if strings.Contains(note, keyword) {
			return true
		}
	}
	return false
}

func humanizeLabel(label string) string {
	label = strings.ReplaceAll(label, "-", " ")
	if label == "" {
		return ""
	}
	return strings.ToUpper(label[:1]) + label[1:]
}

func hasSymptom(symptoms []string, values ...string) bool {
	for _, symptom := range symptoms {
		for _, value := range values {
			if symptom == value {
				return true
			}
		}
	}
	return false
}

func absInt(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
