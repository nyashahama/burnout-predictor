package score

import (
	"fmt"
	"time"
)

var dayNames = [7]string{"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"}

// HistoryEntry is one day of scored history used by pattern detection.
type HistoryEntry struct {
	Date  time.Time
	Score int
}

// DOWEntry is a lightweight check-in used specifically for day-of-week analysis.
type DOWEntry struct {
	Date   time.Time
	Stress int
	Score  int
}

// NoteEntry pairs a check-in score + note with the following day's score,
// used by WhatWorksForYou to detect lifestyle correlations.
type NoteEntry struct {
	Score     int
	Note      string
	NextScore *int // nil when the following day has no check-in
}

// PatternResult holds up to 3 human-readable pattern observations.
type PatternResult struct {
	Patterns []string // max 3 items
}

// DetectPatterns analyses the history and returns up to 3 plain-English
// pattern observations: highest/lowest DOW, 7-day trend, strain frequency.
// Requires ≥7 entries.
func DetectPatterns(entries []HistoryEntry) PatternResult {
	if len(entries) < 7 {
		return PatternResult{}
	}

	// Group scores by day of week
	byDow := make(map[int][]int)
	for _, e := range entries {
		dow := int(e.Date.Weekday())
		byDow[dow] = append(byDow[dow], e.Score)
	}

	// Overall average
	sum := 0
	for _, e := range entries {
		sum += e.Score
	}
	overallAvg := sum / len(entries)

	var patterns []string

	// Find highest and lowest average weekday (≥3 samples required)
	highDay, highAvg := -1, 0
	lowDay, lowAvg := -1, 101
	for dow, scores := range byDow {
		if len(scores) < 3 {
			continue
		}
		avg := sumSlice(scores) / len(scores)
		if avg > highAvg && avg > overallAvg+4 {
			highAvg = avg
			highDay = dow
		}
		if avg < lowAvg && avg < overallAvg-4 {
			lowAvg = avg
			lowDay = dow
		}
	}

	if highDay >= 0 {
		patterns = append(patterns, fmt.Sprintf(
			"%ss tend to run harder than the rest of your week. Whatever that day looks like — it's worth changing something about it.",
			dayNames[highDay],
		))
	}
	if lowDay >= 0 {
		patterns = append(patterns, fmt.Sprintf(
			"%ss bring you back reliably. Don't let meetings creep in — they're working.",
			dayNames[lowDay],
		))
	}

	// 7-day trend vs prior 7
	if len(entries) >= 14 {
		recent := entries[len(entries)-7:]
		prior := entries[len(entries)-14 : len(entries)-7]
		recentAvg := scoreAvg(recent)
		priorAvg := scoreAvg(prior)
		delta := recentAvg - priorAvg
		if delta >= 4 {
			patterns = append(patterns,
				"Your load has been climbing for two weeks straight. That trajectory doesn't reverse on its own.",
			)
		} else if delta <= -4 {
			patterns = append(patterns,
				"Your load dropped this week. Whatever changed — do it again.",
			)
		}
	}

	// High-strain frequency callout
	if len(patterns) < 3 {
		highStrainCount := 0
		for _, e := range entries {
			if e.Score > 65 {
				highStrainCount++
			}
		}
		pct := roundInt(float64(highStrainCount) / float64(len(entries)) * 100)
		if pct >= 25 {
			patterns = append(patterns, fmt.Sprintf(
				"More than %d%% of your days this month hit the danger zone. That pace isn't sustainable.",
				pct,
			))
		} else if pct <= 10 && len(entries) >= 14 {
			patterns = append(patterns, fmt.Sprintf(
				"Only %d%% of your days in the danger zone this month. You're managing the load.",
				pct,
			))
		}
	}

	if len(patterns) > 3 {
		patterns = patterns[:3]
	}
	return PatternResult{Patterns: patterns}
}

// EarnedPatternInsightInput carries the data for the once-per-30-days
// DOW pattern discovery message.
type EarnedPatternInsightInput struct {
	// DOWEntries maps day-of-week (0=Sun) to the user's check-ins on that DOW.
	// Callers should pre-group from the DB using ListCheckInsForDayOfWeek.
	DOWEntries map[int][]DOWEntry

	// LastSeenDates maps DOW index to the last time that DOW's pattern was
	// shown (from insight_metadata key "pattern-seen-dow-N").
	// A zero Time means never shown.
	LastSeenDates map[int]time.Time

	// Today is used to compute whether the 30-day cooldown has elapsed.
	Today time.Time
}

// EarnedPatternInsightResult is the discovery message plus the DOW it fires on,
// so the caller can persist "pattern-seen-dow-N" to insight_metadata.
type EarnedPatternInsightResult struct {
	Message string
	DOW     int // 0–6
}

// GetEarnedPatternInsight returns a discovery message the first time a
// consistent DOW high-load pattern is detected (≥2 weeks of elevated scores).
// Returns nil when no pattern qualifies or the 30-day cooldown is active.
func GetEarnedPatternInsight(in EarnedPatternInsightInput) *EarnedPatternInsightResult {
	const cooldownDays = 30
	const minWeeks = 2

	for dow, entries := range in.DOWEntries {
		if len(entries) < minWeeks {
			continue
		}

		// Check cooldown
		if last, ok := in.LastSeenDates[dow]; ok && !last.IsZero() {
			if in.Today.Sub(last).Hours() < float64(cooldownDays*24) {
				continue
			}
		}

		// Require ≥2 consistent high-load weeks on this DOW
		highCount := 0
		for _, e := range entries {
			if e.Score > 65 {
				highCount++
			}
		}
		if highCount < minWeeks {
			continue
		}

		weeks := len(entries)
		return &EarnedPatternInsightResult{
			DOW: dow,
			Message: fmt.Sprintf(
				"Something we noticed — your %ss have been running consistently high for %d weeks. That's a pattern, not a coincidence.",
				dayNames[dow],
				weeks,
			),
		}
	}
	return nil
}

// ── Personal signature ────────────────────────────────────────────────────────

// Trend describes the direction of a user's load over time.
type Trend string

const (
	TrendImproving Trend = "improving"
	TrendStable    Trend = "stable"
	TrendWorsening Trend = "worsening"
)

// SignatureData is the computed personal load signature for the History page.
type SignatureData struct {
	HardestDay   *string // nil when not enough DOW data
	EasiestDay   *string
	TopTrigger   *string // nil when no keyword correlation found
	TriggerLift  float64 // average stress delta above baseline when keyword present
	AvgScore     int
	RecoveryDays *int // nil when no high→low transitions observed
	Trend        Trend
}

// SignatureEntry is the data shape needed to compute the personal signature.
type SignatureEntry struct {
	Date   time.Time
	Stress int
	Score  int
	Note   string
}

var signatureKeywords = []string{
	"deadline", "meeting", "sleep", "tired",
	"travel", "overwhelm", "pressure", "project",
}

// ComputePersonalSignature derives the user's load signature from all
// available check-ins. Requires ≥14 entries; returns nil otherwise.
func ComputePersonalSignature(entries []SignatureEntry) *SignatureData {
	if len(entries) < 14 {
		return nil
	}

	// DOW grouping (stress values)
	byDow := make(map[int][]int)
	for _, e := range entries {
		dow := int(e.Date.Weekday())
		byDow[dow] = append(byDow[dow], e.Stress)
	}

	hardestDay, easiestDay := findHardestEasiestDays(byDow, 2)

	// Keyword trigger — which keyword most predicts elevated stress
	topTrigger, triggerLift := findTopTrigger(entries, signatureKeywords)

	// Average score
	avgScore := 0
	for _, e := range entries {
		avgScore += e.Score
	}
	avgScore = roundInt(float64(avgScore) / float64(len(entries)))

	// Recovery speed
	recoveryDays := computeRecoveryDays(entries, 10)

	// Trend: compare first half avg vs second half avg
	mid := len(entries) / 2
	firstAvg := float64(scoreAvgSlice(entries[:mid]))
	secondAvg := float64(scoreAvgSlice(entries[mid:]))
	var trend Trend
	switch {
	case secondAvg < firstAvg-4:
		trend = TrendImproving
	case secondAvg > firstAvg+4:
		trend = TrendWorsening
	default:
		trend = TrendStable
	}

	return &SignatureData{
		HardestDay:   hardestDay,
		EasiestDay:   easiestDay,
		TopTrigger:   topTrigger,
		TriggerLift:  triggerLift,
		AvgScore:     avgScore,
		RecoveryDays: recoveryDays,
		Trend:        trend,
	}
}

// BuildSignatureNarrative turns a SignatureData into a fluent prose paragraph.
func BuildSignatureNarrative(sig SignatureData) string {
	var sentences []string

	if sig.TopTrigger != nil && sig.TriggerLift >= 0.5 {
		triggerNarrative := map[string]string{
			"deadline":  "Deadlines are what break you — not meetings, not your calendar. When they appear in your notes, your stress climbs every time.",
			"meeting":   "Heavy meeting days are your main stress driver. It's not the work itself — it's the fragmentation.",
			"sleep":     "Sleep is the variable that moves your score more than anything else. When you're rested, the same week looks different.",
			"tired":     "Fatigue compounds everything for you. When you note that you're tired, the days that follow are reliably harder.",
			"travel":    "Travel disrupts your baseline more than most. Your score is almost always elevated on those weeks.",
			"overwhelm": "Overwhelm isn't occasional for you — it's a pattern the data has seen enough times to call out.",
			"pressure":  "Pressure — the ambient kind — is what drives your load more than specific events.",
			"project":   "Project complexity is your main stressor. The bigger the scope, the higher the score.",
		}
		if s, ok := triggerNarrative[*sig.TopTrigger]; ok {
			sentences = append(sentences, s)
		} else {
			sentences = append(sentences, fmt.Sprintf(
				"When \"%s\" appears in your notes, your stress reads %.1f points above your baseline. Consistently.",
				*sig.TopTrigger, sig.TriggerLift,
			))
		}
	}

	if sig.HardestDay != nil && sig.EasiestDay != nil && *sig.HardestDay != *sig.EasiestDay {
		sentences = append(sentences, fmt.Sprintf(
			"Your %ss tend to run hot. Your %ss almost always bring you back.",
			*sig.HardestDay, *sig.EasiestDay,
		))
	} else if sig.HardestDay != nil {
		sentences = append(sentences, fmt.Sprintf(
			"Your %ss are consistently your hardest day of the week.", *sig.HardestDay,
		))
	}

	if sig.RecoveryDays != nil {
		switch {
		case *sig.RecoveryDays <= 1:
			sentences = append(sentences, "You recover fast — usually back to calm within a day after a hard stretch.")
		case *sig.RecoveryDays == 2:
			sentences = append(sentences, "It takes you about two days to fully reset after a hard period.")
		default:
			sentences = append(sentences, fmt.Sprintf(
				"Recovery takes you %d days on average after a hard stretch — plan for it.", *sig.RecoveryDays,
			))
		}
	}

	switch sig.Trend {
	case TrendImproving:
		sentences = append(sentences, "Your load has been coming down. Whatever you've changed — it's showing up in the data.")
	case TrendWorsening:
		sentences = append(sentences, "The trend is climbing. This is the kind of thing that doesn't reverse on its own.")
	}

	if len(sentences) == 0 {
		return "Keep checking in. The app is still learning your pattern."
	}

	result := ""
	for i, s := range sentences {
		if i > 0 {
			result += " "
		}
		result += s
	}
	return result
}

// ── Internal helpers ──────────────────────────────────────────────────────────

func sumSlice(s []int) int {
	t := 0
	for _, v := range s {
		t += v
	}
	return t
}

func scoreAvg(entries []HistoryEntry) int {
	if len(entries) == 0 {
		return 0
	}
	sum := 0
	for _, e := range entries {
		sum += e.Score
	}
	return sum / len(entries)
}

func scoreAvgSlice(entries []SignatureEntry) int {
	if len(entries) == 0 {
		return 0
	}
	sum := 0
	for _, e := range entries {
		sum += e.Score
	}
	return sum / len(entries)
}

// findHardestEasiestDays returns the day name for the DOW with highest and
// lowest average stress, requiring minSamples per DOW.
func findHardestEasiestDays(byDow map[int][]int, minSamples int) (*string, *string) {
	hardestAvg := -1.0
	easiestAvg := 6.0
	var hardestDay, easiestDay *string

	for dow, stresses := range byDow {
		if len(stresses) < minSamples {
			continue
		}
		avg := float64(sumSlice(stresses)) / float64(len(stresses))
		name := dayNames[dow]
		if avg > hardestAvg {
			hardestAvg = avg
			n := name
			hardestDay = &n
		}
		if avg < easiestAvg {
			easiestAvg = avg
			n := name
			easiestDay = &n
		}
	}
	return hardestDay, easiestDay
}

// findTopTrigger finds the keyword whose presence in notes most lifts stress
// above baseline. Returns nil when no qualifying keyword is found.
func findTopTrigger(entries []SignatureEntry, keywords []string) (*string, float64) {
	if len(entries) == 0 {
		return nil, 0
	}

	baseline := 0.0
	for _, e := range entries {
		baseline += float64(e.Stress)
	}
	baseline /= float64(len(entries))

	var topTrigger *string
	topLift := 0.0

	for _, kw := range keywords {
		var matches []SignatureEntry
		for _, e := range entries {
			if containsWord(e.Note, kw) {
				matches = append(matches, e)
			}
		}
		if len(matches) < 2 {
			continue
		}
		avg := 0.0
		for _, m := range matches {
			avg += float64(m.Stress)
		}
		avg /= float64(len(matches))
		lift := avg - baseline
		if lift > topLift {
			topLift = lift
			k := kw
			topTrigger = &k
		}
	}
	return topTrigger, roundFloat1(topLift)
}

// computeRecoveryDays computes the average number of days it takes for stress
// to drop to ≤2 after hitting ≥4. lookAhead limits the search window.
func computeRecoveryDays(entries []SignatureEntry, lookAhead int) *int {
	total, count := 0, 0
	for i := 0; i < len(entries)-1; i++ {
		if entries[i].Stress >= 4 {
			for j := i + 1; j < intMin(len(entries), i+lookAhead); j++ {
				if entries[j].Stress <= 2 {
					total += j - i
					count++
					break
				}
			}
		}
	}
	if count == 0 {
		return nil
	}
	days := roundInt(float64(total) / float64(count))
	return &days
}

func containsWord(s, sub string) bool {
	return len(s) >= len(sub) &&
		(s == sub ||
			(len(s) > len(sub) &&
				(containsAt(s, sub))))
}

func containsAt(s, sub string) bool {
	lower := toLower(s)
	lsub := toLower(sub)
	for i := 0; i <= len(lower)-len(lsub); i++ {
		if lower[i:i+len(lsub)] == lsub {
			return true
		}
	}
	return false
}

func toLower(s string) string {
	b := make([]byte, len(s))
	for i := range s {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 32
		}
		b[i] = c
	}
	return string(b)
}

func roundFloat1(f float64) float64 {
	return float64(roundInt(f*10)) / 10
}