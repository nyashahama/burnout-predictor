package score

import "fmt"

// SessionContextInput carries yesterday's data for computing the
// greeting insight shown at the top of the dashboard.
type SessionContextInput struct {
	YesterdayStress *int    // nil = no check-in yesterday
	YesterdayScore  *int    // nil = no check-in yesterday
	YesterdayNote   string  // empty = no note
	TodayScore      int
	TodayStress     *int   // nil = not yet checked in today
	UserName        string
}

// SessionContext is the one-sentence greeting insight.
// Priority 1 in the insight space — always shown when available.
type SessionContext struct {
	Message string
	Kind    string // "drop" | "rise" | "note_reference" | "neutral"
}

// GetSessionContext produces one sentence connecting yesterday to today.
// It is the most immediate insight — always fresh, always specific.
//
// Rules (in priority order):
//  1. If yesterday had a note mentioning a future event, reference it
//  2. If score dropped ≥8 points, acknowledge the improvement
//  3. If score rose ≥8 points, flag the building load
//  4. Otherwise return nil (pattern insight or arc fills the space)
func GetSessionContext(in SessionContextInput) *SessionContext {
	if in.YesterdayStress == nil || in.YesterdayScore == nil {
		return nil
	}

	// Note reference — forward memory follow-through
	if in.YesterdayNote != "" {
		if reDeadline.MatchString(in.YesterdayNote) {
			return &SessionContext{
				Message: "Yesterday you had a deadline coming. Whatever happened — the app noticed.",
				Kind:    "note_reference",
			}
		}
		if containsAt(in.YesterdayNote, "presentation") || containsAt(in.YesterdayNote, "demo") {
			return &SessionContext{
				Message: "Yesterday you had a big moment coming. How did it go?",
				Kind:    "note_reference",
			}
		}
		if containsAt(in.YesterdayNote, "interview") {
			return &SessionContext{
				Message: "Yesterday you mentioned an interview. How are you sitting with it now?",
				Kind:    "note_reference",
			}
		}
	}

	// Score delta
	delta := in.TodayScore - *in.YesterdayScore
	switch {
	case delta <= -8:
		return &SessionContext{
			Message: fmt.Sprintf(
				"Whatever you did last night — the score dropped %d points. Keep doing it.",
				-delta,
			),
			Kind: "drop",
		}
	case delta >= 8:
		return &SessionContext{
			Message: "The load is building since yesterday. Today's the day to catch it before it compounds.",
			Kind:    "rise",
		}
	}

	return nil
}

// MilestoneData holds the computed data at the 30/60/90 check-in milestone.
type MilestoneData struct {
	Milestone      int     // 30, 60, or 90
	HardestDay     *string // nil if not enough DOW data
	EasiestDay     *string
	KeywordTrigger *string
	KeywordLift    float64
	RecoveryDays   *int
	FirstHalfAvg   int
	SecondHalfAvg  int
	TotalEntries   int
}

// BuildMilestoneData computes what the app has learned at the 30/60/90
// check-in milestone. Returns nil if checkinCount isn't near a milestone.
// The milestoneAlreadySeen flag should be read from insight_metadata.
func BuildMilestoneData(
	checkinCount int,
	entries []SignatureEntry,
	milestoneAlreadySeen bool,
) *MilestoneData {
	var milestone int
	switch {
	case checkinCount >= 28 && checkinCount <= 33:
		milestone = 30
	case checkinCount >= 58 && checkinCount <= 63:
		milestone = 60
	case checkinCount >= 88 && checkinCount <= 93:
		milestone = 90
	default:
		return nil
	}

	if milestoneAlreadySeen {
		return nil
	}

	if len(entries) < 10 {
		return nil
	}

	// DOW grouping
	byDow := make(map[int][]int)
	for _, e := range entries {
		dow := int(e.Date.Weekday())
		byDow[dow] = append(byDow[dow], e.Stress)
	}
	hardestDay, easiestDay := findHardestEasiestDays(byDow, 3)

	milestoneKeywords := []string{
		"deadline", "meeting", "sleep", "tired",
		"travel", "overwhelm", "pressure", "project", "launch",
	}
	topTrigger, keywordLift := findTopTrigger(entries, milestoneKeywords)
	recoveryDays := computeRecoveryDays(entries, 14)

	mid := len(entries) / 2
	firstHalfAvg := scoreAvgSlice(entries[:mid])
	secondHalfAvg := scoreAvgSlice(entries[mid:])

	return &MilestoneData{
		Milestone:      milestone,
		HardestDay:     hardestDay,
		EasiestDay:     easiestDay,
		KeywordTrigger: topTrigger,
		KeywordLift:    keywordLift,
		RecoveryDays:   recoveryDays,
		FirstHalfAvg:   firstHalfAvg,
		SecondHalfAvg:  secondHalfAvg,
		TotalEntries:   len(entries),
	}
}