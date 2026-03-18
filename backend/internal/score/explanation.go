package score

import "fmt"

// ExplanationInput is the data needed to build the one-sentence score explanation.
type ExplanationInput struct {
	Score                int
	TodayStress          *int  // nil = no check-in yet
	ConsecutiveDangerDays int
	RecentStresses       []int // last 7 days, newest first
}

// BuildScoreExplanation returns a single plain-English sentence that explains
// WHY the score is what it is. Always visible on the ScoreCard, above signals.
// Never a tooltip — always present.
func BuildScoreExplanation(in ExplanationInput) string {
	// No check-in yet — onboarding estimate path
	if in.TodayStress == nil {
		if in.Score > 65 {
			return "This estimate is based on your onboarding profile — check in below to make it yours."
		}
		return "Your starting estimate from onboarding. Check in below to refine it."
	}

	stress := *in.TodayStress

	// Compounding danger streaks
	if in.ConsecutiveDangerDays >= 3 {
		return fmt.Sprintf(
			"%d consecutive days of high load compound in ways that sleep alone can't fix overnight.",
			in.ConsecutiveDangerDays,
		)
	}
	if in.ConsecutiveDangerDays >= 2 {
		return "Back-to-back hard days leave a residue that a single rest day doesn't clear."
	}

	// Overwhelm today
	if stress >= 5 && in.Score > 65 {
		return "Overwhelm today drives the score hard. Sleep is the fastest recovery lever you have tonight."
	}

	// Calm day but elevated score — explain why
	if stress <= 2 && in.Score > 50 {
		recentHigh := 0
		for _, s := range in.RecentStresses {
			if s >= 4 {
				recentHigh++
			}
		}
		if recentHigh >= 1 {
			return "You're carrying it better today, but the load from earlier this week is still in the number."
		}
		return "Your sleep baseline is keeping the score up even on a calm day."
	}

	// Full recovery
	if stress <= 2 && in.Score <= 40 {
		return "Low stress and a solid sleep baseline put you in the clear. This is what recovery looks like."
	}

	// Generic high
	if in.Score > 65 {
		return "Today's stress combined with your recent pattern is pushing the number up."
	}

	// Green zone
	if in.Score <= 40 {
		return "Everything is working in your favour today. Protect tonight's sleep to carry this forward."
	}

	return "Your score reflects today's check-in and the load pattern from earlier this week."
}

// BuildSuggestion returns the "One thing to do today" text on the ScoreCard.
// hasCheckedIn = false triggers a neutral prompt to check in first.
func BuildSuggestion(score int, hasCheckedIn bool, dangerStreak int) string {
	if !hasCheckedIn {
		return "Complete your daily check-in below to get a personalised recommendation based on how you're actually feeling today."
	}
	// Witness path — no directive when the streak is very long
	if dangerStreak >= 4 {
		return fmt.Sprintf(
			"%d consecutive days in the red. That's not a rough patch. That's sustained. I see it.",
			dangerStreak,
		)
	}
	switch {
	case score > 75:
		return "You're in critical load territory. Hard-stop work by 8 PM tonight — no exceptions. Skip optional evening commitments and aim for 8+ hours of sleep. That's your single highest-leverage action right now."
	case score > 65:
		return "Block tomorrow 9–11 AM for deep work before your calendar fills. Convert at least one sync today to async. Sleep is your biggest lever tonight — aim for 8 hours."
	case score > 50:
		return "You're in the moderate zone. Protect your focus blocks and don't let meetings creep into mornings. A 15-minute walk today will measurably lower tomorrow's score."
	case score > 40:
		return "You're running sustainably. Build the habit here — consistent sleep and protected focus blocks will keep you in this zone."
	default:
		return "You're in the green. Cognitive capacity at its best — do the deep work that actually matters today. Protect tonight's sleep and this carries into tomorrow."
	}
}

// TrajectoryInput is the data needed to build the forward-looking trajectory sentence.
type TrajectoryInput struct {
	Score                int
	RecentStresses       []int // newest first
	ConsecutiveDangerDays int
	// DaysFromNow is a function that returns the weekday name N days from today.
	// Injected so this function stays pure and testable without time.Now().
	DayName func(daysAhead int) string
}

// BuildTrajectoryInsight returns a forward-looking sentence about where the
// load is heading and names a specific day. Returns empty string when there
// is not enough data or the trend is ambiguous.
func BuildTrajectoryInsight(in TrajectoryInput) string {
	if len(in.RecentStresses) < 2 {
		return ""
	}

	last3 := in.RecentStresses
	if len(last3) > 3 {
		last3 = last3[:3]
	}

	trendingUp := len(last3) >= 2 && last3[0] >= last3[len(last3)-1]
	trendingDown := len(last3) >= 2 && float64(last3[0]) < float64(last3[len(last3)-1])-0.4

	peakDay := in.DayName(2)
	clearDay := in.DayName(2)

	switch {
	case in.ConsecutiveDangerDays >= 4:
		return fmt.Sprintf(
			"%d days at high load without recovery. The compounding effect is real — this doesn't ease on its own. One structural change today matters more than a perfect week later.",
			in.ConsecutiveDangerDays,
		)
	case in.Score > 65 && trendingUp && len(in.RecentStresses) >= 2:
		return fmt.Sprintf(
			"The load has been building for %d days. If the pattern holds, %s is your highest-risk point this week. The window to change it is now, not then.",
			len(in.RecentStresses),
			peakDay,
		)
	case in.Score > 65 && trendingDown:
		return fmt.Sprintf(
			"The pressure is starting to ease. Two more careful nights and you should be out of the red by %s.",
			clearDay,
		)
	case in.Score > 40 && in.Score <= 65 && trendingUp && len(last3) > 0 && float64(last3[0]) >= 3.5:
		return "Three more days like this and you're in hard territory. The time to protect sleep and cut one commitment is before you hit the wall, not after."
	case in.Score <= 40 && trendingDown:
		return "You're holding the line. The risk now is letting a good run become an excuse to push harder. Protect tonight the same way you protected last night."
	}
	return ""
}