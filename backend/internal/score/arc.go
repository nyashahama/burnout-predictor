package score

import (
	"fmt"
	"strings"
	"time"
)

// ── Long arc narrative ────────────────────────────────────────────────────────

// ArcEntry is one day of data for the long arc computation.
type ArcEntry struct {
	Date  time.Time
	Score int
}

// BuildLongArcNarrative narrates the past 2+ months as a story. Finds the
// worst stretch, detects whether a turning point occurred, and compares
// the recent 14 days to the 14 before.
// Requires ≥21 entries. Returns empty string when conditions aren't met.
func BuildLongArcNarrative(entries []ArcEntry, now time.Time) string {
	if len(entries) < 21 {
		return ""
	}

	// Find worst individual day
	worstIdx := 0
	for i, e := range entries {
		if e.Score > entries[worstIdx].Score {
			worstIdx = i
		}
	}
	worstEntry := entries[worstIdx]

	// Find the contiguous danger run containing the worst day
	runStart, runEnd := worstIdx, worstIdx
	for runStart > 0 && entries[runStart-1].Score > 65 {
		runStart--
	}
	for runEnd < len(entries)-1 && entries[runEnd+1].Score > 65 {
		runEnd++
	}
	runLength := runEnd - runStart + 1

	// Only narrate if worst period was at least 2 weeks ago (so it's history)
	daysAgo := int(now.Sub(worstEntry.Date).Hours() / 24)
	if daysAgo < 14 {
		return ""
	}

	// Detect turning point: first window after worst run where rolling avg drops ≥8 pts
	var turningPointLabel string
	for i := runEnd + 1; i < len(entries)-6; i++ {
		beforeSlice := entries[intMax(0, i-7):i]
		afterSlice := entries[i : intMin(len(entries), i+7)]
		if len(beforeSlice) < 3 {
			continue
		}
		beforeAvg := float64(arcScoreSum(beforeSlice)) / float64(len(beforeSlice))
		afterAvg := float64(arcScoreSum(afterSlice)) / float64(len(afterSlice))
		if beforeAvg-afterAvg >= 8 {
			turningPointLabel = entries[i].Date.Format("January 2")
			break
		}
	}

	// Recent 14 vs prior 14
	if len(entries) < 28 {
		return ""
	}
	recent := entries[len(entries)-14:]
	prior := entries[len(entries)-28 : len(entries)-14]
	if len(prior) < 7 {
		return ""
	}
	recentAvg := arcScoreSum(recent) / len(recent)
	priorAvg := arcScoreSum(prior) / len(prior)
	delta := recentAvg - priorAvg

	weeksAgo := max(1, roundInt(float64(daysAgo)/7))
	timeDesc := weeksAgoLabel(weeksAgo)

	if runLength >= 3 && worstEntry.Score > 65 {
		worstLabel := worstEntry.Date.Format("January 2")
		arc := fmt.Sprintf(
			"%s, you had your worst stretch in this dataset — %d consecutive %s in the red, peaking around %s.",
			capitalize(timeDesc),
			runLength,
			pluralDay(runLength),
			worstLabel,
		)
		switch {
		case turningPointLabel != "" && delta <= -5:
			arc += fmt.Sprintf(" Something shifted around %s. Your load has been holding lower since.", turningPointLabel)
		case delta <= -8:
			arc += " The past two weeks have been noticeably lighter. Whatever changed — it's in the data."
		case delta >= 6:
			arc += " The load is back up now. Worth paying attention to before it compounds."
		default:
			arc += " You've been holding steady since."
		}
		return arc
	}

	// No severe worst run, but narrate meaningful trend
	if delta <= -8 {
		return fmt.Sprintf(
			"The past two weeks are your lightest in the dataset — %d points lower on average than the two weeks before. Something changed and it's showing up.",
			-delta,
		)
	}
	if delta >= 8 {
		return fmt.Sprintf(
			"The load has been climbing. The past two weeks are running %d points heavier on average than the two weeks before that. Two weeks is long enough to be a trend.",
			delta,
		)
	}
	return ""
}

// ── Monthly arc comparison ────────────────────────────────────────────────────

// MonthlyArcResult is the result of comparing this month to last month.
type MonthlyArcResult struct {
	CurrentAvg  int
	PreviousAvg int
	Delta       int    // negative = current is lighter (better)
	MonthName   string // previous month name, e.g. "February"
	Message     string // the one-liner shown in UserGreeting
}

// BuildMonthlyArc compares this month's average score to last month's.
// Returns nil when either month has fewer than 7 entries or the delta is < 5.
func BuildMonthlyArc(thisMonth, lastMonth []ArcEntry, lastMonthName string) *MonthlyArcResult {
	if len(thisMonth) < 7 || len(lastMonth) < 7 {
		return nil
	}

	currentAvg := arcScoreSum(thisMonth) / len(thisMonth)
	previousAvg := arcScoreSum(lastMonth) / len(lastMonth)
	delta := currentAvg - previousAvg

	if abs(delta) < 5 {
		return nil
	}

	var msg string
	if delta < 0 {
		msg = fmt.Sprintf(
			"Running %d points lighter than %s. Whatever shifted — it's working.",
			-delta,
			lastMonthName,
		)
	} else {
		msg = fmt.Sprintf(
			"Running %d points heavier than %s. The trend is worth watching before it compounds.",
			delta,
			lastMonthName,
		)
	}

	return &MonthlyArcResult{
		CurrentAvg:  currentAvg,
		PreviousAvg: previousAvg,
		Delta:       delta,
		MonthName:   lastMonthName,
		Message:     msg,
	}
}

// ── What works specifically for you ──────────────────────────────────────────

var whatWorksKeywords = []string{
	"walk", "exercise", "gym", "outside", "run",
	"meditation", "yoga", "lunch", "break", "reading",
	"no meetings", "sleep early", "early",
}

// FindWhatWorksForYou scans past check-in notes for keywords that consistently
// correlate with a lower score the following day. Returns empty string when
// no pattern qualifies.
// Requires ≥14 entries with notes and ≥3 keyword matches.
func FindWhatWorksForYou(entries []NoteEntry) string {
	if len(entries) < 5 {
		return ""
	}

	bestKeyword := ""
	bestAvgDelta := 0.0

	for _, kw := range whatWorksKeywords {
		var matches []NoteEntry
		for _, e := range entries {
			if e.NextScore != nil && containsAt(e.Note, kw) {
				matches = append(matches, e)
			}
		}
		if len(matches) < 3 {
			continue
		}

		deltas := make([]float64, len(matches))
		posCount := 0
		for i, m := range matches {
			d := float64(m.Score - *m.NextScore)
			deltas[i] = d
			if d > 0 {
				posCount++
			}
		}

		sum := 0.0
		for _, d := range deltas {
			sum += d
		}
		avgDelta := sum / float64(len(deltas))

		if float64(posCount)/float64(len(matches)) >= 0.6 && avgDelta > 3 && avgDelta > bestAvgDelta {
			bestKeyword = kw
			bestAvgDelta = avgDelta
		}
	}

	if bestKeyword == "" || bestAvgDelta < 3 {
		return ""
	}

	delta := roundInt(bestAvgDelta)
	activity := keywordToActivity(bestKeyword)
	return fmt.Sprintf(
		"When %s, your next-day score drops an average of %d points. That's not generic advice — that's your data.",
		activity,
		delta,
	)
}

// ── Notification text ─────────────────────────────────────────────────────────

// NotificationInput carries the state needed to build a context-aware
// check-in reminder notification.
type NotificationInput struct {
	Streak                int
	ConsecutiveDangerDays int
	Name                  string // empty = no name
}

// BuildNotificationText returns a notification title + body that responds to
// the user's actual state rather than being a generic calendar reminder.
func BuildNotificationText(in NotificationInput) (title, body string) {
	switch {
	case in.ConsecutiveDangerDays >= 3:
		return "Check in tonight",
			fmt.Sprintf("%d days in the danger zone. Tonight's check-in matters more than usual.", in.ConsecutiveDangerDays)
	case in.ConsecutiveDangerDays >= 1:
		return "How's today landing?",
			"Yesterday was hard. See if today feels different — it only takes 30 seconds."
	case in.Streak >= 7:
		return fmt.Sprintf("%d-day streak", in.Streak),
			"You've checked in every day this week. Don't break it tonight."
	case in.Streak >= 3:
		return "Keep the streak going",
			fmt.Sprintf("%d days in a row. One more tonight.", in.Streak)
	default:
		if in.Name != "" {
			return fmt.Sprintf("How are you carrying it, %s?", in.Name),
				"Take 30 seconds. The data gets smarter every time you check in."
		}
		return "How are you carrying it?",
			"Take 30 seconds. The data gets smarter every time you check in."
	}
}

// ── Internal helpers ──────────────────────────────────────────────────────────

func arcScoreSum(entries []ArcEntry) int {
	s := 0
	for _, e := range entries {
		s += e.Score
	}
	return s
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func weeksAgoLabel(weeks int) string {
	switch {
	case weeks >= 8:
		return fmt.Sprintf("%d weeks ago", weeks)
	case weeks >= 4:
		return "about a month ago"
	case weeks >= 3:
		return "three weeks ago"
	case weeks >= 2:
		return "a couple of weeks ago"
	default:
		return "about two weeks ago"
	}
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func pluralDay(n int) string {
	if n == 1 {
		return "day"
	}
	return "days"
}

func keywordToActivity(kw string) string {
	switch kw {
	case "no meetings":
		return "you protect meeting-free time"
	case "sleep early":
		return "you sleep early"
	case "outside":
		return "you get outside"
	case "early":
		return "you start early"
	default:
		return fmt.Sprintf("you %s", kw)
	}
}