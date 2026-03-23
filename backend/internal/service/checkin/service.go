package checkin

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/nyasha-hama/burnout-predictor-api/internal/ai"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"
	"github.com/nyasha-hama/burnout-predictor-api/internal/score"
)

// checkinStore is the data-access contract for the checkin service.
// store.Postgres satisfies this implicitly.
type checkinStore interface {
	UpsertCheckIn(ctx context.Context, params db.UpsertCheckInParams) (db.CheckIn, error)
	GetTodayCheckIn(ctx context.Context, params db.GetTodayCheckInParams) (db.CheckIn, error)
	ListCheckIns(ctx context.Context, params db.ListCheckInsParams) ([]db.CheckIn, error)
	ListRecentCheckIns(ctx context.Context, params db.ListRecentCheckInsParams) ([]db.ListRecentCheckInsRow, error)
	GetConsecutiveDangerDays(ctx context.Context, userID uuid.UUID) (int32, error)
	GetCheckInStreak(ctx context.Context, userID uuid.UUID) (int32, error)
	CountCheckIns(ctx context.Context, userID uuid.UUID) (int64, error)
	SetAIRecoveryPlan(ctx context.Context, params db.SetAIRecoveryPlanParams) error
	CreateFollowUp(ctx context.Context, params db.CreateFollowUpParams) (db.FollowUp, error)
}

// Service owns check-in persistence, score computation, and follow-up scheduling.
type Service struct {
	store checkinStore
	ai    *ai.Client // nil = AI disabled
	log   *slog.Logger
}

func New(store checkinStore, aiClient *ai.Client, log *slog.Logger) *Service {
	return &Service{store: store, ai: aiClient, log: log}
}

// ── Request / Response types ──────────────────────────────────────────────────

type UpsertRequest struct {
	Stress           int      `json:"stress"`
	Note             string   `json:"note"`
	EnergyLevel      *int     `json:"energy_level,omitempty"`
	FocusQuality     *int     `json:"focus_quality,omitempty"`
	HoursWorked      *float64 `json:"hours_worked,omitempty"`
	PhysicalSymptoms []string `json:"physical_symptoms,omitempty"`
}

type UpsertResult struct {
	CheckIn      db.CheckIn          `json:"check_in"`
	Score        score.Output        `json:"score"`
	Explanation  string              `json:"explanation"`
	Suggestion   string              `json:"suggestion"`
	RecoveryPlan []score.PlanSection `json:"recovery_plan,omitempty"`
}

type ScoreCardResult struct {
	Score       score.Output `json:"score"`
	Explanation string       `json:"explanation"`
	Suggestion  string       `json:"suggestion"`
	Trajectory  string       `json:"trajectory"`
	Accuracy    string       `json:"accuracy_label"`
	Streak      int32        `json:"streak"`
	HasCheckIn  bool         `json:"has_checkin"`
}

// ── Exported helper ───────────────────────────────────────────────────────────

// BuildScoreInput constructs a score.Input from DB rows.
// This is the single authoritative implementation — called by Upsert, GetScoreCard,
// and insight.Service.buildSessionContext.
//
// todayStress: if non-nil, today's row is excluded from recentStresses (it's passed separately).
// today: used to identify today's row in the recent slice.
func BuildScoreInput(user db.User, rows []db.ListRecentCheckInsRow, todayStress *int, today time.Time) score.Input {
	recentStresses := make([]int, 0, len(rows))
	for _, c := range rows {
		if todayStress != nil && c.CheckedInDate.Time.Equal(today) {
			continue
		}
		recentStresses = append(recentStresses, int(c.Stress))
	}
	var estScore *int
	if user.EstimatedScore.Valid {
		v := int(user.EstimatedScore.Int16)
		estScore = &v
	}
	return score.Input{
		TodayStress:    todayStress,
		Role:           score.Role(user.Role),
		SleepBaseline:  score.SleepBaseline(user.SleepBaseline),
		RecentStresses: recentStresses,
		EstimatedScore: estScore,
		MeetingCount:   -1,
	}
}

// ── Public methods ────────────────────────────────────────────────────────────

func (s *Service) Upsert(ctx context.Context, user db.User, req UpsertRequest) (UpsertResult, error) {
	if req.Stress < 1 || req.Stress > 5 {
		return UpsertResult{}, ErrInvalidStress
	}

	today := localDate(user.Timezone)

	recent, err := s.store.ListRecentCheckIns(ctx, db.ListRecentCheckInsParams{
		UserID:  user.ID,
		Column2: 7,
	})
	if err != nil {
		return UpsertResult{}, err
	}

	in := BuildScoreInput(user, recent, &req.Stress, today)
	out := score.Calculate(in)

	note := pgtype.Text{}
	if req.Note != "" {
		note = pgtype.Text{String: req.Note, Valid: true}
	}

	var energyLevel, focusQuality pgtype.Int2
	if req.EnergyLevel != nil {
		energyLevel = pgtype.Int2{Int16: int16(*req.EnergyLevel), Valid: true}
	}
	if req.FocusQuality != nil {
		focusQuality = pgtype.Int2{Int16: int16(*req.FocusQuality), Valid: true}
	}
	var hoursWorked pgtype.Numeric
	if req.HoursWorked != nil {
		_ = hoursWorked.Scan(fmt.Sprintf("%.1f", *req.HoursWorked)) // Scan sets Valid on success
	}
	var physicalSymptoms []string
	if len(req.PhysicalSymptoms) > 0 {
		physicalSymptoms = req.PhysicalSymptoms
	}

	checkin, err := s.store.UpsertCheckIn(ctx, db.UpsertCheckInParams{
		UserID:           user.ID,
		CheckedInDate:    pgtype.Date{Time: today, Valid: true},
		Stress:           int16(req.Stress),
		Note:             note,
		Score:            int16(out.Score),
		RoleSnapshot:     user.Role,
		SleepSnapshot:    user.SleepBaseline,
		EnergyLevel:      energyLevel,
		FocusQuality:     focusQuality,
		HoursWorked:      hoursWorked,
		PhysicalSymptoms: physicalSymptoms,
	})
	if err != nil {
		return UpsertResult{}, err
	}

	danger, _ := s.store.GetConsecutiveDangerDays(ctx, user.ID)

	if req.Note != "" {
		bgCtx := context.WithoutCancel(ctx)
		go s.scheduleFollowUps(bgCtx, checkin.ID, user.ID, req.Note, today)
	}

	// Rule-based recovery plan — used when AI is disabled; also final fallback if AI fails.
	var recoveryPlan []score.PlanSection
	if s.ai == nil && req.Stress >= 4 {
		recoveryPlan = score.BuildDynamicRecoveryPlan(score.RecoveryPlanInput{
			Note:            req.Note,
			Stress:          req.Stress,
			ConsecutiveDays: int(danger),
			Role:            score.Role(user.Role),
		})
	}

	// Build narrative — AI if available, silent rule-based fallback on any error.
	explanation := score.BuildScoreExplanation(score.ExplanationInput{
		Score:                 out.Score,
		TodayStress:           &req.Stress,
		ConsecutiveDangerDays: int(danger),
		RecentStresses:        in.RecentStresses,
	})
	suggestion := score.BuildSuggestion(out.Score, true, int(danger))

	if s.ai != nil {
		history30, _ := s.store.ListRecentCheckIns(ctx, db.ListRecentCheckInsParams{
			UserID:  user.ID,
			Column2: 30,
		})
		count, countErr := s.store.CountCheckIns(ctx, user.ID)
		if countErr != nil {
			s.log.WarnContext(ctx, "count check-ins failed", "err", countErr)
		}

		scIn := ai.ScoreCardInput{
			Role:          user.Role,
			SleepBaseline: int(user.SleepBaseline),
			CheckInCount:  count,
			TodayStress:   req.Stress,
			TodayEnergy:   req.EnergyLevel,
			TodayFocus:    req.FocusQuality,
			TodayHours:    req.HoursWorked,
			TodaySymptoms: req.PhysicalSymptoms,
			TodayNote:     req.Note,
			TodayScore:    out.Score,
		}

		aiCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		narrative, aiErr := s.ai.GenerateScoreCard(aiCtx, scIn, history30)
		cancel()
		if aiErr == nil {
			explanation = narrative.Explanation
			suggestion = narrative.Suggestion
			out.Signals = narrative.Signals
			if len(narrative.RecoveryPlan) > 0 {
				recoveryPlan = narrative.RecoveryPlan
			}
		} else {
			s.log.WarnContext(ctx, "ai score card failed, using fallback", "err", aiErr)
		}
	}

	// Final fallback: if AI was enabled but failed and stress >= 4, still provide a plan.
	if recoveryPlan == nil && req.Stress >= 4 {
		recoveryPlan = score.BuildDynamicRecoveryPlan(score.RecoveryPlanInput{
			Note:            req.Note,
			Stress:          req.Stress,
			ConsecutiveDays: int(danger),
			Role:            score.Role(user.Role),
		})
	}

	return UpsertResult{
		CheckIn:      checkin,
		Score:        out,
		Explanation:  explanation,
		Suggestion:   suggestion,
		RecoveryPlan: recoveryPlan,
	}, nil
}

func (s *Service) GetScoreCard(ctx context.Context, user db.User) (ScoreCardResult, error) {
	today := localDate(user.Timezone)

	todayCI, todayErr := s.store.GetTodayCheckIn(ctx, db.GetTodayCheckInParams{
		UserID:        user.ID,
		CheckedInDate: pgtype.Date{Time: today, Valid: true},
	})
	hasTodayCI := todayErr == nil

	recent, err := s.store.ListRecentCheckIns(ctx, db.ListRecentCheckInsParams{
		UserID:  user.ID,
		Column2: 7,
	})
	if err != nil {
		s.log.WarnContext(ctx, "list recent check-ins failed", "err", err)
	}

	var todayStress *int
	if hasTodayCI {
		stressVal := int(todayCI.Stress)
		todayStress = &stressVal
	}

	in := BuildScoreInput(user, recent, todayStress, today)
	out := score.Calculate(in)

	danger, _ := s.store.GetConsecutiveDangerDays(ctx, user.ID)
	streak, _ := s.store.GetCheckInStreak(ctx, user.ID)
	count, countErr := s.store.CountCheckIns(ctx, user.ID)
	if countErr != nil {
		s.log.WarnContext(ctx, "count check-ins failed", "err", countErr)
	}

	trajectory := score.BuildTrajectoryInsight(score.TrajectoryInput{
		Score:                 out.Score,
		RecentStresses:        in.RecentStresses,
		ConsecutiveDangerDays: int(danger),
		DayName: func(daysAhead int) string {
			return time.Now().In(userLocation(user.Timezone)).AddDate(0, 0, daysAhead).Weekday().String()
		},
	})

	explanation := score.BuildScoreExplanation(score.ExplanationInput{
		Score:                 out.Score,
		TodayStress:           todayStress,
		ConsecutiveDangerDays: int(danger),
		RecentStresses:        in.RecentStresses,
	})
	suggestion := score.BuildSuggestion(out.Score, hasTodayCI, int(danger))

	if s.ai != nil && hasTodayCI {
		history30, _ := s.store.ListRecentCheckIns(ctx, db.ListRecentCheckInsParams{
			UserID:  user.ID,
			Column2: 30,
		})

		var todayEnergy, todayFocus *int
		if todayCI.EnergyLevel.Valid {
			v := int(todayCI.EnergyLevel.Int16)
			todayEnergy = &v
		}
		if todayCI.FocusQuality.Valid {
			v := int(todayCI.FocusQuality.Int16)
			todayFocus = &v
		}
		var todayHours *float64
		if todayCI.HoursWorked.Valid {
			f, err := todayCI.HoursWorked.Float64Value()
			if err == nil && f.Valid {
				todayHours = &f.Float64
			}
		}

		scIn := ai.ScoreCardInput{
			Role:          user.Role,
			SleepBaseline: int(user.SleepBaseline),
			CheckInCount:  count,
			TodayStress:   int(todayCI.Stress),
			TodayEnergy:   todayEnergy,
			TodayFocus:    todayFocus,
			TodayHours:    todayHours,
			TodaySymptoms: todayCI.PhysicalSymptoms,
			TodayNote:     todayCI.Note.String,
			TodayScore:    out.Score,
		}

		aiCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		narrative, aiErr := s.ai.GenerateScoreCard(aiCtx, scIn, history30)
		cancel()
		if aiErr == nil {
			explanation = narrative.Explanation
			suggestion = narrative.Suggestion
			out.Signals = narrative.Signals
			// recovery_plan intentionally discarded — only surfaced post-check-in via UpsertResult
		} else {
			s.log.WarnContext(ctx, "ai score card failed, using fallback", "err", aiErr)
		}
	}

	return ScoreCardResult{
		Score:       out,
		Explanation: explanation,
		Suggestion:  suggestion,
		Trajectory:  trajectory,
		Accuracy:    score.AccuracyLabel(int(count)),
		Streak:      streak,
		HasCheckIn:  hasTodayCI,
	}, nil
}

func (s *Service) List(ctx context.Context, userID uuid.UUID) ([]db.CheckIn, error) {
	return s.store.ListCheckIns(ctx, db.ListCheckInsParams{
		UserID: userID,
		Limit:  30,
		Offset: 0,
	})
}

// ── Follow-up scheduling ──────────────────────────────────────────────────────

type followUpRule struct {
	keywords  []string
	eventType string
	question  string
}

var followUpRules = []followUpRule{
	{
		keywords:  []string{"deadline", "due", "submit", "deliver", "launch"},
		eventType: "deadline",
		question:  "How did the deadline go? Was it as stressful as you expected?",
	},
	{
		keywords:  []string{"presentation", "present", "demo", "pitch"},
		eventType: "presentation",
		question:  "How did the presentation go? Did it land the way you wanted?",
	},
	{
		keywords:  []string{"interview", "interviewing"},
		eventType: "interview",
		question:  "How did the interview go? Feeling okay about it?",
	},
	{
		keywords:  []string{"travel", "flight", "trip", "fly", "conference"},
		eventType: "travel",
		question:  "How was the travel? Did being away affect your load?",
	},
	{
		keywords:  []string{"big meeting", "all-hands", "board", "review meeting"},
		eventType: "meeting",
		question:  "How did the big meeting go? Anything worth reflecting on?",
	},
	{
		keywords:  []string{"surgery", "procedure", "hospital"},
		eventType: "medical",
		question:  "How are you doing after the medical appointment? Hope it went okay.",
	},
}

func (s *Service) scheduleFollowUps(ctx context.Context, checkinID uuid.UUID, userID uuid.UUID, note string, today time.Time) {
	if note == "" {
		return
	}
	lower := strings.ToLower(note)
	fireDate := today.AddDate(0, 0, 1)

	for _, rule := range followUpRules {
		matched := false
		snippet := ""
		for _, kw := range rule.keywords {
			if strings.Contains(lower, kw) {
				matched = true
				snippet = extractSnippet(note, kw)
				break
			}
		}
		if !matched {
			continue
		}

		tCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		_, err := s.store.CreateFollowUp(tCtx, db.CreateFollowUpParams{
			UserID:          userID,
			FireDate:        pgtype.Date{Time: fireDate, Valid: true},
			EventType:       rule.eventType,
			Question:        rule.question,
			NoteSnippet:     pgtype.Text{String: snippet, Valid: snippet != ""},
			SourceCheckinID: pgtype.UUID{Bytes: checkinID, Valid: true},
		})
		cancel()
		if err != nil {
			s.log.ErrorContext(ctx, "create follow-up failed", "request_id", reqid.FromCtx(ctx), "user_id", userID, "err", err)
		}
		break // only one follow-up per day
	}
}

func extractSnippet(note, keyword string) string {
	runes := []rune(note)
	lowerRunes := []rune(strings.ToLower(note))
	kwRunes := []rune(strings.ToLower(keyword))

	// Find keyword position in rune space to avoid mid-rune slicing.
	idx := -1
	for i := 0; i <= len(lowerRunes)-len(kwRunes); i++ {
		match := true
		for j, r := range kwRunes {
			if lowerRunes[i+j] != r {
				match = false
				break
			}
		}
		if match {
			idx = i
			break
		}
	}
	if idx < 0 {
		return note
	}
	start := idx - 20
	if start < 0 {
		start = 0
	}
	end := idx + len(kwRunes) + 40
	if end > len(runes) {
		end = len(runes)
	}
	snippet := strings.TrimSpace(string(runes[start:end]))
	if start > 0 {
		snippet = "…" + snippet
	}
	if end < len(runes) {
		snippet = snippet + "…"
	}
	return snippet
}

// ── Date helpers ──────────────────────────────────────────────────────────────

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
