package insight

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/score"
	checkinsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
)

const insightHistoryDays = 30 // unified window for all pattern/arc/signature analysis

// insightStore is the data-access contract for the insight service.
// store.Postgres satisfies this implicitly.
type insightStore interface {
	ListCheckInsInRange(ctx context.Context, params db.ListCheckInsInRangeParams) ([]db.CheckIn, error)
	ListRecentCheckIns(ctx context.Context, params db.ListRecentCheckInsParams) ([]db.ListRecentCheckInsRow, error)
	GetTodayCheckIn(ctx context.Context, params db.GetTodayCheckInParams) (db.CheckIn, error)
	// Note: GetYesterdayCheckInParams.Column2 is interface{} in the generated code.
	// Callers must pass a pgtype.Date value.
	GetYesterdayCheckIn(ctx context.Context, params db.GetYesterdayCheckInParams) (db.CheckIn, error)
	CountCheckIns(ctx context.Context, userID uuid.UUID) (int64, error)
	GetCheckInStreak(ctx context.Context, userID uuid.UUID) (int32, error)
	GetInsightMetadata(ctx context.Context, params db.GetInsightMetadataParams) (db.InsightMetadatum, error)
	SetInsightMetadata(ctx context.Context, params db.SetInsightMetadataParams) (db.InsightMetadatum, error)
	ListInsightMetadataByPrefix(ctx context.Context, params db.ListInsightMetadataByPrefixParams) ([]db.InsightMetadatum, error)
	ListDismissedComponents(ctx context.Context, params db.ListDismissedComponentsParams) ([]string, error)
	DismissComponent(ctx context.Context, params db.DismissComponentParams) error
}

// Service owns all eight insight computations and component dismissal.
type Service struct {
	store insightStore
}

func New(store insightStore) *Service {
	return &Service{store: store}
}

// ── Request / Response types ──────────────────────────────────────────────────

type DismissRequest struct {
	ComponentKey string `json:"component_key"`
}

type StreakMilestone struct {
	Day     int    `json:"day"`
	Message string `json:"message"`
}

type WhatWorkedToday struct {
	Action      string `json:"action"`
	Improvement int    `json:"improvement"`
	Evidence    string `json:"evidence"`
}

// InsightBundle is the complete insight response — handler calls respond.JSON on it directly.
type InsightBundle struct {
	SessionContext      *score.SessionContext             `json:"session_context"`
	Patterns            []string                          `json:"patterns"`
	PatternInsights     []score.PatternInsight            `json:"pattern_insights"`
	EarnedPattern       *score.EarnedPatternInsightResult `json:"earned_pattern"`
	Signature           *score.SignatureData              `json:"signature"`
	SignatureNarrative  string                            `json:"signature_narrative"`
	ArcNarrative        string                            `json:"arc_narrative"`
	MonthlyArc          *score.MonthlyArcResult           `json:"monthly_arc"`
	WhatWorks           string                            `json:"what_works"`
	RecoveryFeedback    []score.RecoveryFeedback          `json:"recovery_feedback"`
	Milestone           *score.MilestoneData              `json:"milestone"`
	CheckInCount        int64                             `json:"check_in_count"`
	AccuracyLabel       string                            `json:"accuracy_label"`
	DismissedComponents []string                          `json:"dismissed_components"`
	StreakMilestones    []StreakMilestone                 `json:"streak_milestones"`
	StreakForgiven      bool                              `json:"streak_forgiven"`
	WhatWorkedToday     *WhatWorkedToday                  `json:"what_worked_today,omitempty"`
}

// ── Public methods ────────────────────────────────────────────────────────────

func (s *Service) Get(ctx context.Context, user db.User) (InsightBundle, error) {
	today := localDate(user.Timezone)
	historyStart := today.AddDate(0, 0, -insightHistoryDays)

	all, err := s.store.ListCheckInsInRange(ctx, db.ListCheckInsInRangeParams{
		UserID:          user.ID,
		CheckedInDate:   pgtype.Date{Time: historyStart, Valid: true},
		CheckedInDate_2: pgtype.Date{Time: today, Valid: true},
	})
	if err != nil {
		return InsightBundle{}, err
	}

	yesterday, yesterdayErr := s.store.GetYesterdayCheckIn(ctx, db.GetYesterdayCheckInParams{
		UserID:  user.ID,
		Column2: pgtype.Date{Time: today, Valid: true},
	})
	todayCI, todayErr := s.store.GetTodayCheckIn(ctx, db.GetTodayCheckInParams{
		UserID:        user.ID,
		CheckedInDate: pgtype.Date{Time: today, Valid: true},
	})
	totalCount, _ := s.store.CountCheckIns(ctx, user.ID)

	// Map DB rows to score package input types.
	historyEntries := make([]score.HistoryEntry, len(all))
	arcEntries := make([]score.ArcEntry, len(all))
	signatureEntries := make([]score.SignatureEntry, len(all))

	for i, c := range all {
		note := ""
		if c.Note.Valid {
			note = c.Note.String
		}
		t := c.CheckedInDate.Time
		sc := int(c.Score)
		historyEntries[i] = score.HistoryEntry{Date: t, Score: sc}
		arcEntries[i] = score.ArcEntry{Date: t, Score: sc}
		signatureEntries[i] = score.SignatureEntry{
			Date:   t,
			Stress: int(c.Stress),
			Score:  sc,
			Note:   note,
		}
	}

	noteEntries := s.buildNoteEntries(all)
	analysisEntries := s.buildAnalysisEntries(all)

	sessionCtx := s.buildSessionContext(ctx, user, today, todayErr, todayCI, yesterdayErr, yesterday)
	patterns := score.DetectPatterns(historyEntries)
	patternInsights := score.BuildPatternInsights(analysisEntries)
	earnedPattern := s.buildEarnedPatternInsight(ctx, user, all, today)

	sig := score.ComputePersonalSignature(signatureEntries)
	var sigNarrative string
	if sig != nil {
		sigNarrative = score.BuildSignatureNarrative(*sig)
	}

	arcNarrative := score.BuildLongArcNarrative(arcEntries, today) // returns string
	monthlyArc := s.buildMonthlyArc(ctx, user, today)
	whatWorks := score.FindWhatWorksForYou(noteEntries) // returns string
	recoveryFeedback := score.BuildRecoveryFeedback(analysisEntries)
	milestone := s.buildMilestone(ctx, user, int(totalCount), signatureEntries)

	var streakMilestones []StreakMilestone
	streak, _ := s.store.GetCheckInStreak(ctx, user.ID)
	milestoneThresholds := []struct {
		day int
		msg string
	}{
		{3, "You're building the habit. Three days of data."},
		{7, "One full week. Your data is getting meaningful. Patterns are starting to form."},
		{14, "Pattern unlocked. The app can now see your personal trends."},
		{30, "Signature discovered. Your burnout fingerprint is clear."},
		{60, "Long arc visible. You can see your trajectory over months."},
	}
	for _, m := range milestoneThresholds {
		if int(streak) == m.day {
			seenKey := fmt.Sprintf("streak-milestone-%d", m.day)
			_, seenErr := s.store.GetInsightMetadata(ctx, db.GetInsightMetadataParams{
				UserID: user.ID,
				Key:    seenKey,
			})
			if seenErr != nil {
				streakMilestones = append(streakMilestones, StreakMilestone{Day: m.day, Message: m.msg})
				_, _ = s.store.SetInsightMetadata(ctx, db.SetInsightMetadataParams{
					UserID: user.ID,
					Key:    seenKey,
					Value:  pgtype.Text{String: "true", Valid: true},
				})
			}
		}
	}

	var streakForgiven bool
	if yesterdayErr != nil && streak >= 3 {
		streakForgiven = true
	}

	var whatWorkedToday *WhatWorkedToday
	if todayErr == nil && todayCI.SmallWins.Valid && todayCI.SmallWins.String != "" {
		improvement := score.FindSmallWinsImpact(noteEntries, todayCI.SmallWins.String)
		if improvement > 0 {
			whatWorkedToday = &WhatWorkedToday{
				Action:      todayCI.SmallWins.String,
				Improvement: improvement,
				Evidence:    fmt.Sprintf("When you %s, your next-day score improved by an average of %d points.", strings.ToLower(todayCI.SmallWins.String), improvement),
			}
		}
	}

	knownComponents := make([]string, 0, len(knownDismissableComponents))
	for k := range knownDismissableComponents {
		knownComponents = append(knownComponents, k)
	}
	dismissed, _ := s.store.ListDismissedComponents(ctx, db.ListDismissedComponentsParams{
		UserID:  user.ID,
		Column2: knownComponents,
	})
	if dismissed == nil {
		dismissed = []string{}
	}

	return InsightBundle{
		SessionContext:      sessionCtx,
		Patterns:            patterns.Patterns,
		PatternInsights:     patternInsights,
		EarnedPattern:       earnedPattern,
		Signature:           sig,
		SignatureNarrative:  sigNarrative,
		ArcNarrative:        arcNarrative,
		MonthlyArc:          monthlyArc,
		WhatWorks:           whatWorks,
		RecoveryFeedback:    recoveryFeedback,
		Milestone:           milestone,
		CheckInCount:        totalCount,
		AccuracyLabel:       score.AccuracyLabel(int(totalCount)),
		DismissedComponents: dismissed,
		StreakMilestones:    streakMilestones,
		StreakForgiven:      streakForgiven,
		WhatWorkedToday:     whatWorkedToday,
	}, nil
}

var knownDismissableComponents = map[string]bool{
	"session-context":     true,
	"earned-pattern":      true,
	"arc-narrative":       true,
	"monthly-arc":         true,
	"what-works":          true,
	"signature":           true,
	"milestone-30":        true,
	"milestone-60":        true,
	"milestone-90":        true,
	"streak-milestone-3":  true,
	"streak-milestone-7":  true,
	"streak-milestone-14": true,
	"streak-milestone-30": true,
	"streak-milestone-60": true,
}

func (s *Service) DismissComponent(ctx context.Context, userID uuid.UUID, req DismissRequest) error {
	if req.ComponentKey == "" {
		return ErrInvalidComponent
	}
	if !knownDismissableComponents[req.ComponentKey] &&
		!strings.HasPrefix(req.ComponentKey, "burnout-alert-") &&
		!strings.HasPrefix(req.ComponentKey, "streak-milestone-") &&
		!strings.HasPrefix(req.ComponentKey, "pattern-") {
		return ErrInvalidComponent
	}
	return s.store.DismissComponent(ctx, db.DismissComponentParams{
		UserID:       userID,
		ComponentKey: req.ComponentKey,
	})
}

// ── Private helpers ───────────────────────────────────────────────────────────

func (s *Service) buildSessionContext(
	ctx context.Context,
	user db.User,
	today time.Time,
	todayErr error,
	todayCI db.CheckIn,
	yesterdayErr error,
	yesterday db.CheckIn,
) *score.SessionContext {
	recent, _ := s.store.ListRecentCheckIns(ctx, db.ListRecentCheckInsParams{
		UserID:  user.ID,
		Column2: 7,
	})

	var todayStress *int
	if todayErr == nil {
		ts := int(todayCI.Stress)
		todayStress = &ts
	}

	in := checkinsvc.BuildScoreInput(user, recent, todayStress, today)
	todayOut := score.Calculate(in)

	sessionIn := score.SessionContextInput{
		UserName:    user.Name,
		TodayScore:  todayOut.Score,
		TodayStress: todayStress,
	}
	if yesterdayErr == nil {
		ys := int(yesterday.Stress)
		ysc := int(yesterday.Score)
		sessionIn.YesterdayStress = &ys
		sessionIn.YesterdayScore = &ysc
		if yesterday.Note.Valid {
			sessionIn.YesterdayNote = yesterday.Note.String
		}
	}

	return score.GetSessionContext(sessionIn)
}

func (s *Service) buildEarnedPatternInsight(
	ctx context.Context,
	user db.User,
	all []db.CheckIn,
	today time.Time,
) *score.EarnedPatternInsightResult {
	dowEntries := make(map[int][]score.DOWEntry)
	for _, c := range all {
		dow := int(c.CheckedInDate.Time.Weekday())
		dowEntries[dow] = append(dowEntries[dow], score.DOWEntry{
			Date:   c.CheckedInDate.Time,
			Stress: int(c.Stress),
			Score:  int(c.Score),
		})
	}

	seenRows, _ := s.store.ListInsightMetadataByPrefix(ctx, db.ListInsightMetadataByPrefixParams{
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

	if result != nil {
		key := fmt.Sprintf("pattern-seen-dow-%d", result.DOW)
		_, _ = s.store.SetInsightMetadata(ctx, db.SetInsightMetadataParams{
			UserID: user.ID,
			Key:    key,
			Value:  pgtype.Text{String: today.Format("2006-01-02"), Valid: true},
		})
	}
	return result
}

func (s *Service) buildMonthlyArc(ctx context.Context, user db.User, today time.Time) *score.MonthlyArcResult {
	thisMonthStart := time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, time.UTC)
	lastMonthEnd := thisMonthStart.AddDate(0, 0, -1)
	lastMonthStart := time.Date(lastMonthEnd.Year(), lastMonthEnd.Month(), 1, 0, 0, 0, 0, time.UTC)

	thisMonthRows, _ := s.store.ListCheckInsInRange(ctx, db.ListCheckInsInRangeParams{
		UserID:          user.ID,
		CheckedInDate:   pgtype.Date{Time: thisMonthStart, Valid: true},
		CheckedInDate_2: pgtype.Date{Time: today, Valid: true},
	})
	lastMonthRows, _ := s.store.ListCheckInsInRange(ctx, db.ListCheckInsInRangeParams{
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

func (s *Service) buildMilestone(
	ctx context.Context,
	user db.User,
	totalCount int,
	signatureEntries []score.SignatureEntry,
) *score.MilestoneData {
	milestoneNum := nearestMilestone(totalCount)
	milestoneKey := fmt.Sprintf("milestone-seen-%d", milestoneNum)

	_, err := s.store.GetInsightMetadata(ctx, db.GetInsightMetadataParams{
		UserID: user.ID,
		Key:    milestoneKey,
	})
	alreadySeen := err == nil

	m := score.BuildMilestoneData(totalCount, signatureEntries, alreadySeen)
	if m != nil && !alreadySeen {
		_, _ = s.store.SetInsightMetadata(ctx, db.SetInsightMetadataParams{
			UserID: user.ID,
			Key:    milestoneKey,
			Value:  pgtype.Text{String: "true", Valid: true},
		})
	}
	return m
}

func (s *Service) buildNoteEntries(all []db.CheckIn) []score.NoteEntry {
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

func (s *Service) buildAnalysisEntries(all []db.CheckIn) []score.AnalysisEntry {
	entries := make([]score.AnalysisEntry, 0, len(all))
	for _, c := range all {
		entry := score.AnalysisEntry{
			Date:             c.CheckedInDate.Time,
			Stress:           int(c.Stress),
			Score:            int(c.Score),
			PhysicalSymptoms: c.PhysicalSymptoms,
		}
		if c.Note.Valid {
			entry.Note = c.Note.String
		}
		if c.EnergyLevel.Valid {
			v := int(c.EnergyLevel.Int16)
			entry.EnergyLevel = &v
		}
		if c.FocusQuality.Valid {
			v := int(c.FocusQuality.Int16)
			entry.FocusQuality = &v
		}
		if c.HoursWorked.Valid {
			f, err := c.HoursWorked.Float64Value()
			if err == nil && f.Valid {
				entry.HoursWorked = &f.Float64
			}
		}
		entries = append(entries, entry)
	}
	return entries
}

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

func localDate(timezone string) time.Time {
	loc := userLocation(timezone)
	now := time.Now().In(loc)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

func userLocation(timezone string) *time.Location {
	if timezone == "" {
		return time.UTC
	}
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return time.UTC
	}
	return loc
}
