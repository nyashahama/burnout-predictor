// Package score is the cognitive-load computation engine for Overload.
//
// All functions are pure — no I/O, no database, no HTTP. They accept plain
// Go structs and return plain Go structs. This makes them trivially testable
// and lets the API layer call them without any mocking.
//
// Every function in this package is a direct port of the TypeScript logic in
// data.ts, with two deliberate improvements:
//
//  1. The calendar signal is wired to a real MeetingCount rather than a flat
//     +4 bonus for "calendar connected", so the signal earns its place.
//
//  2. All string-keyed maps (role, sleep) are typed constants rather than
//     open strings, catching bad inputs at the call site.
package score

// Level represents the traffic-light severity used on dashboard signals.
type Level string

const (
	LevelOK      Level = "ok"
	LevelWarning Level = "warning"
	LevelDanger  Level = "danger"
)

// Role mirrors the CHECK constraint on users.role.
type Role string

const (
	RoleEngineer Role = "engineer"
	RoleDesigner Role = "designer"
	RolePM       Role = "pm"
	RoleManager  Role = "manager"
	RoleFounder  Role = "founder"
	RoleOther    Role = "other"
)

// SleepBaseline is the user's self-reported normal sleep hours (4–12).
type SleepBaseline int

const (
	Sleep4 SleepBaseline = 4
	Sleep5 SleepBaseline = 5
	Sleep6 SleepBaseline = 6
	Sleep7 SleepBaseline = 7
	Sleep8 SleepBaseline = 8
	Sleep9 SleepBaseline = 9
)

// Signal is a single row in the ScoreCard signals list.
type Signal struct {
	Label  string `json:"label"`
	Detail string `json:"detail"`
	Val    string `json:"val"`
	Level  Level  `json:"level"`
}

// PlanSection is one timing block in the recovery plan (Tonight / Tomorrow / This week).
type PlanSection struct {
	Timing  string   `json:"timing"`
	Actions []string `json:"actions"`
}

// Input is everything the score engine needs. Callers construct this from the
// DB rows for the user + their recent check-ins.
type Input struct {
	// TodayStress is nil when no check-in exists yet for today.
	TodayStress *int

	Role          Role
	SleepBaseline SleepBaseline

	// RecentStresses is the last 7 days of stress values, newest first.
	// Used to compute the trend modifier.
	RecentStresses []int

	// EstimatedScore is the onboarding estimate shown before any check-in.
	// Only consulted when TodayStress is nil.
	EstimatedScore *int

	// MeetingCount is from Google Calendar for today. -1 means not connected.
	MeetingCount int
}

// Output is the full computed result for one day.
type Output struct {
	Score   int      `json:"score"`
	Level   Level    `json:"level"`
	Label   string   `json:"label"`
	Signals []Signal `json:"signals"`
}

// ScoreLabel returns the human label for a numeric score.
func ScoreLabel(score int) string {
	switch {
	case score > 65:
		return "High strain"
	case score > 40:
		return "Moderate load"
	default:
		return "In your zone"
	}
}

// ScoreLevel returns the traffic-light level for a numeric score.
func ScoreLevel(score int) Level {
	switch {
	case score > 65:
		return LevelDanger
	case score > 40:
		return LevelWarning
	default:
		return LevelOK
	}
}

// intMin returns the smaller of a and b.
func intMin(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// intMax returns the larger of a and b.
func intMax(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// clamp constrains v to [lo, hi].
func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// roundInt rounds a float64 to the nearest integer.
func roundInt(f float64) int {
	if f < 0 {
		return int(f - 0.5)
	}
	return int(f + 0.5)
}