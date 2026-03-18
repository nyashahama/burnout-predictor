package score

import "fmt"

// stressBase maps a stress rating (1–5) to a base score.
// These are the same constants as the TypeScript base map.
var stressBase = map[int]int{
	1: 22,
	2: 35,
	3: 50,
	4: 64,
	5: 76,
}

// roleMod maps a role to its ambient pressure modifier.
// Founders carry the most ambient load; designers the least.
var roleMod = map[Role]int{
	RoleFounder:  6,
	RoleManager:  3,
	RolePM:       2,
	RoleEngineer: 0,
	RoleDesigner: -2,
	RoleOther:    0,
}

// sleepMod maps sleep baseline hours to a score modifier.
// Below 8 hours adds load; 9+ hours gives a small reduction.
var sleepMod = map[SleepBaseline]int{
	Sleep4: 16,
	Sleep5: 13,
	Sleep6: 10,
	Sleep7: 5,
	Sleep8: 0,
	Sleep9: -4,
}

// meetingMod translates a daily meeting count into a calendar pressure score.
// This replaces the flat +4 "calendar connected" bonus from the TypeScript
// version — the number of meetings now actually matters.
func meetingMod(count int) int {
	switch {
	case count < 0: // not connected
		return 0
	case count == 0:
		return 0
	case count <= 2:
		return 2
	case count <= 4:
		return 5
	case count <= 6:
		return 9
	default: // 7+
		return 12
	}
}

// Calculate computes the cognitive load score and signal list from the
// provided input. It is the single authoritative score computation for
// the entire backend — the frontend score engine is deprecated once the
// API is live.
//
// Score range: 8–92 (clamped). Higher = more cognitive load.
func Calculate(in Input) Output {
	// Day 1 path: no check-in yet — return onboarding estimate
	if in.TodayStress == nil {
		est := 55
		if in.EstimatedScore != nil {
			est = *in.EstimatedScore
		}
		score := clamp(est, 8, 92)
		return Output{
			Score:   score,
			Level:   ScoreLevel(score),
			Label:   ScoreLabel(score),
			Signals: buildSignals(nil, in.Role, in.SleepBaseline, in.MeetingCount),
		}
	}

	stress := *in.TodayStress
	score := stressBase[stress]
	if score == 0 {
		score = 50 // safety fallback for out-of-range stress
	}

	// Role modifier
	score += roleMod[in.Role]

	// Sleep deficit modifier
	score += sleepMod[in.SleepBaseline]

	// Recent trend: if the last ≥2 check-ins average above neutral (3),
	// add compounding weight. (avg−3) × 2.5, rounded.
	if len(in.RecentStresses) >= 2 {
		sum := 0
		for _, s := range in.RecentStresses {
			sum += s
		}
		avg := float64(sum) / float64(len(in.RecentStresses))
		score += roundInt((avg - 3.0) * 2.5)
	}

	// Calendar density modifier
	score += meetingMod(in.MeetingCount)

	score = clamp(score, 8, 92)

	return Output{
		Score:   score,
		Level:   ScoreLevel(score),
		Label:   ScoreLabel(score),
		Signals: buildSignals(&stress, in.Role, in.SleepBaseline, in.MeetingCount),
	}
}

// StressToScore converts a raw stress rating into an estimated score using
// only the role and sleep baseline (no trend data). Used when computing
// historical scores from stored check-ins and for the pattern detection
// functions that work over raw stress values.
func StressToScore(stress int, role Role, sleep SleepBaseline) int {
	base := stressBase[stress]
	if base == 0 {
		base = 50
	}
	return clamp(base+roleMod[role]+sleepMod[sleep], 8, 92)
}

// AccuracyLabel returns the copy that tells the user how well-calibrated
// their score is based on how many check-ins they've submitted.
// Returns empty string when there's not enough data to say anything useful.
func AccuracyLabel(checkinCount int) string {
	switch {
	case checkinCount >= 30:
		return fmt.Sprintf("%d check-ins in — as accurate as it gets", checkinCount)
	case checkinCount >= 14:
		return fmt.Sprintf("%d check-ins in — your most accurate reading yet", checkinCount)
	case checkinCount >= 7:
		return fmt.Sprintf("Based on %d real check-ins", checkinCount)
	case checkinCount >= 3:
		return fmt.Sprintf("%d check-ins in — getting smarter", checkinCount)
	default:
		return ""
	}
}