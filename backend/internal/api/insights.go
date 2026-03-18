package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/score"
)

// GetInsights handles GET /api/insights.
//
// Fetches 90 days of real check-in history from the database and passes it
// through every insight function in the score package:
//   - Session context  (yesterday → today greeting)
//   - Pattern detection (DOW patterns, trend, strain frequency)
//   - Earned pattern insight (first-time DOW discovery with 30-day cooldown)
//   - Personal signature (hardest day, trigger keyword, recovery speed, trend)
//   - Long arc narrative (worst stretch + turning point)
//   - Monthly arc comparison (this month vs last month)
//   - What works for you (keyword → next-day score correlation)
//   - Milestone data (30 / 60 / 90 check-in summary)
func (h *Handler) GetInsights(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r.Context())
	today := localDate(user.Timezone)

	// ── Fetch history ────────────────────────────────────────────────────────
	ninetyDaysAgo := today.AddDate(0, 0, -90)
	all, err := h.q.ListCheckInsInRange(r.Context(), db.ListCheckInsInRangeParams{
		UserID:          user.ID,
		CheckedInDate:   pgtype.Date{Time: ninetyDaysAgo, Valid: true},
		CheckedInDate_2: pgtype.Date{Time: today, Valid: true},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load history")
		return
	}

	yesterday, yesterdayErr := h.q.GetYesterdayCheckIn(r.Context(), db.GetYesterdayCheckInParams{
		UserID:  user.ID,
		Column2: pgtype.Date{Time: today, Valid: true},
	})
	todayCI, todayErr := h.q.GetTodayCheckIn(r.Context(), db.GetTodayCheckInParams{
		UserID:        user.ID,
		CheckedInDate: pgtype.Date{Time: today, Valid: true},
	})
	totalCount, _ := h.q.CountCheckIns(r.Context(), user.ID)

	// ── Map DB rows to score package input types ─────────────────────────────
	// all is ordered ASC by date (from ListCheckInsInRange).

	historyEntries := make([]score.HistoryEntry, len(all))
	arcEntries := make([]score.ArcEntry, len(all))
	signatureEntries := make([]score.SignatureEntry, len(all))

	for i, c := range all {
		note := ""
		if c.Note.Valid {
			note = c.Note.String
		}
		t := c.CheckedInDate.Time
		s := int(c.Score)
		historyEntries[i] = score.HistoryEntry{Date: t, Score: s}
		arcEntries[i] = score.ArcEntry{Date: t, Score: s}
		signatureEntries[i] = score.SignatureEntry{
			Date:   t,
			Stress: int(c.Stress),
			Score:  s,
			Note:   note,
		}
	}

	// NoteEntry pairs each day with the following day's score.
	noteEntries := buildNoteEntries(all)

	// ── Session context ───────────────────────────────────────────────────────
	sessionCtx := buildSessionContext(r, h, user, today, todayErr, todayCI, yesterdayErr, yesterday)

	// ── Pattern detection ─────────────────────────────────────────────────────
	patterns := score.DetectPatterns(historyEntries)

	// ── Earned pattern insight (DOW, with 30-day cooldown) ───────────────────
	earnedPattern := h.buildEarnedPatternInsight(r, all, today)

	// ── Personal signature ────────────────────────────────────────────────────
	sig := score.ComputePersonalSignature(signatureEntries)
	var sigNarrative string
	if sig != nil {
		sigNarrative = score.BuildSignatureNarrative(*sig)
	}

	// ── Long arc narrative ────────────────────────────────────────────────────
	arcNarrative := score.BuildLongArcNarrative(arcEntries, today)

	// ── Monthly arc ───────────────────────────────────────────────────────────
	monthlyArc := h.buildMonthlyArc(r, today)

	// ── What works for you ────────────────────────────────────────────────────
	whatWorks := score.FindWhatWorksForYou(noteEntries)

	// ── Milestone ─────────────────────────────────────────────────────────────
	milestone := h.buildMilestone(r, int(totalCount), signatureEntries)

	// ── Dismissed components ──────────────────────────────────────────────────
	knownComponents := []string{
		"session-context", "earned-pattern", "arc-narrative",
		"monthly-arc", "what-works", "signature",
		"milestone-30", "milestone-60", "milestone-90",
	}
	dismissed, _ := h.q.ListDismissedComponents(r.Context(), db.ListDismissedComponentsParams{
		UserID:  user.ID,
		Column2: knownComponents,
	})
	if dismissed == nil {
		dismissed = []string{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"session_context":     sessionCtx,
		"patterns":            patterns.Patterns,
		"earned_pattern":      earnedPattern,
		"signature":           sig,
		"signature_narrative": sigNarrative,
		"arc_narrative":       arcNarrative,
		"monthly_arc":         monthlyArc,
		"what_works":          whatWorks,
		"milestone":           milestone,
		"check_in_count":      totalCount,
		"accuracy_label":      score.AccuracyLabel(int(totalCount)),
		"dismissed_components": dismissed,
	})
}

// buildSessionContext computes the greeting insight from yesterday's data and
// today's computed score. Pure mapping from DB rows → score.GetSessionContext.
func buildSessionContext(
	r *http.Request,
	h *Handler,
	user db.User,
	today time.Time,
	todayErr error,
	todayCI db.CheckIn,
	yesterdayErr error,
	yesterday db.CheckIn,
) *score.SessionContext {
	// Compute today's score from real data.
	recent, _ := h.q.ListRecentCheckIns(r.Context(), db.ListRecentCheckInsParams{
		UserID:  user.ID,
		Column2: 7,
	})
	recentStresses := make([]int, 0, len(recent))
	for _, c := range recent {
		if todayErr == nil && c.CheckedInDate.Time.Equal(today) {
			continue
		}
		recentStresses = append(recentStresses, int(c.Stress))
	}

	var todayStress *int
	if todayErr == nil {
		s := int(todayCI.Stress)
		todayStress = &s
	}
	var estScore *int
	if user.EstimatedScore.Valid {
		v := int(user.EstimatedScore.Int16)
		estScore = &v
	}

	todayOut := score.Calculate(score.Input{
		TodayStress:    todayStress,
		Role:           score.Role(user.Role),
		SleepBaseline:  score.SleepBaseline(user.SleepBaseline),
		RecentStresses: recentStresses,
		EstimatedScore: estScore,
		MeetingCount:   -1,
	})

	in := score.SessionContextInput{
		UserName:    user.Name,
		TodayScore:  todayOut.Score,
		TodayStress: todayStress,
	}
	if yesterdayErr == nil {
		ys := int(yesterday.Stress)
		ysc := int(yesterday.Score)
		in.YesterdayStress = &ys
		in.YesterdayScore = &ysc
		if yesterday.Note.Valid {
			in.YesterdayNote = yesterday.Note.String
		}
	}

	return score.GetSessionContext(in)
}

// buildEarnedPatternInsight groups check-ins by day-of-week, loads per-DOW
// cooldown timestamps from insight_metadata, calls GetEarnedPatternInsight,
// and persists the seen flag when a pattern fires for the first time.
func (h *Handler) buildEarnedPatternInsight(
	r *http.Request,
	all []db.CheckIn,
	today time.Time,
) *score.EarnedPatternInsightResult {
	user := userFromCtx(r.Context())

	// Group check-ins by day of week.
	dowEntries := make(map[int][]score.DOWEntry)
	for _, c := range all {
		dow := int(c.CheckedInDate.Time.Weekday())
		dowEntries[dow] = append(dowEntries[dow], score.DOWEntry{
			Date:   c.CheckedInDate.Time,
			Stress: int(c.Stress),
			Score:  int(c.Score),
		})
	}

	seenRows, _ := h.q.ListInsightMetadataByPrefix(r.Context(), db.ListInsightMetadataByPrefixParams{
		UserID:  user.ID,
		Column2: pgtype.Text{String: "pattern-seen-dow-", Valid: true},
	})
	lastSeen := make(map[int]time.Time)
	for _, row := range seenRows {
		var dow int
		if _, err := fmt.Sscanf(row.Key, "pattern-seen-dow-%d", &dow); err == nil && row.SetAt.Valid {
			lastSeen[dow] = row.SetAt.Time
		}
	}

	result := score.GetEarnedPatternInsight(score.EarnedPatternInsightInput{
		DOWEntries:    dowEntries,
		LastSeenDates: lastSeen,
		Today:         today,
	})

	// Persist the seen flag so the 30-day cooldown is respected next time.
	if result != nil {
		key := fmt.Sprintf("pattern-seen-dow-%d", result.DOW)
		_, _ = h.q.SetInsightMetadata(r.Context(), db.SetInsightMetadataParams{
			UserID: user.ID,
			Key:    key,
			Value:  pgtype.Text{String: today.Format("2006-01-02"), Valid: true},
		})
	}
	return result
}

// buildMonthlyArc fetches this month's and last month's check-ins separately
// and delegates comparison to score.BuildMonthlyArc.
func (h *Handler) buildMonthlyArc(r *http.Request, today time.Time) *score.MonthlyArcResult {
	user := userFromCtx(r.Context())

	thisMonthStart := time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, time.UTC)
	lastMonthEnd := thisMonthStart.AddDate(0, 0, -1)
	lastMonthStart := time.Date(lastMonthEnd.Year(), lastMonthEnd.Month(), 1, 0, 0, 0, 0, time.UTC)

	thisMonthRows, _ := h.q.ListCheckInsInRange(r.Context(), db.ListCheckInsInRangeParams{
		UserID:          user.ID,
		CheckedInDate:   pgtype.Date{Time: thisMonthStart, Valid: true},
		CheckedInDate_2: pgtype.Date{Time: today, Valid: true},
	})
	lastMonthRows, _ := h.q.ListCheckInsInRange(r.Context(), db.ListCheckInsInRangeParams{
		UserID:          user.ID,
		CheckedInDate:   pgtype.Date{Time: lastMonthStart, Valid: true},
		CheckedInDate_2: pgtype.Date{Time: lastMonthEnd, Valid: true},
	})

	toArcEntries := func(rows []db.CheckIn) []score.ArcEntry {
		out := make([]score.ArcEntry, len(rows))
		for i, c := range rows {
			out[i] = score.ArcEntry{Date: c.CheckedInDate.Time, Score: int(c.Score)}
		}
		return out
	}

	return score.BuildMonthlyArc(
		toArcEntries(thisMonthRows),
		toArcEntries(lastMonthRows),
		lastMonthEnd.Month().String(),
	)
}

// buildMilestone checks whether the user is near a 30/60/90 check-in milestone,
// reads the seen flag from insight_metadata, and persists it when the milestone fires.
func (h *Handler) buildMilestone(
	r *http.Request,
	totalCount int,
	signatureEntries []score.SignatureEntry,
) *score.MilestoneData {
	user := userFromCtx(r.Context())
	milestoneNum := nearestMilestone(totalCount)
	milestoneKey := fmt.Sprintf("milestone-seen-%d", milestoneNum)

	_, err := h.q.GetInsightMetadata(r.Context(), db.GetInsightMetadataParams{
		UserID: user.ID,
		Key:    milestoneKey,
	})
	alreadySeen := err == nil

	m := score.BuildMilestoneData(totalCount, signatureEntries, alreadySeen)
	if m != nil && !alreadySeen {
		_, _ = h.q.SetInsightMetadata(r.Context(), db.SetInsightMetadataParams{
			UserID: user.ID,
			Key:    milestoneKey,
			Value:  pgtype.Text{String: "true", Valid: true},
		})
	}
	return m
}

// buildNoteEntries pairs each check-in with the following day's score.
// all must be ordered ASC by date (as returned by ListCheckInsInRange).
func buildNoteEntries(all []db.CheckIn) []score.NoteEntry {
	entries := make([]score.NoteEntry, len(all))
	for i, c := range all {
		note := ""
		if c.Note.Valid {
			note = c.Note.String
		}
		e := score.NoteEntry{Score: int(c.Score), Note: note}
		if i+1 < len(all) {
			next := int(all[i+1].Score)
			e.NextScore = &next
		}
		entries[i] = e
	}
	return entries
}

// nearestMilestone maps a check-in count to its milestone bucket key.
func nearestMilestone(count int) int {
	switch {
	case count >= 88 && count <= 93:
		return 90
	case count >= 58 && count <= 63:
		return 60
	default:
		return 30
	}
}
