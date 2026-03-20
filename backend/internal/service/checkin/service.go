package checkin

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/nyasha-hama/burnout-predictor-api/internal/ai"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
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
}

func New(store checkinStore, aiClient *ai.Client) *Service {
	return &Service{store: store, ai: aiClient}
}

// ── Request / Response types ──────────────────────────────────────────────────

type UpsertRequest struct {
	Stress int    `json:"stress"`
	Note   string `json:"note"`
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

	// Exclude today from recent — it's being replaced now.
	recentStresses := make([]int, 0, len(recent))
	for _, c := range recent {
		if c.CheckedInDate.Time.Equal(today) {
			continue
		}
		recentStresses = append(recentStresses, int(c.Stress))
	}

	var estScore *int
	if user.EstimatedScore.Valid {
		v := int(user.EstimatedScore.Int16)
		estScore = &v
	}

	in := score.Input{
		TodayStress:    &req.Stress,
		Role:           score.Role(user.Role),
		SleepBaseline:  score.SleepBaseline(user.SleepBaseline),
		RecentStresses: recentStresses,
		EstimatedScore: estScore,
		MeetingCount:   -1,
	}
	out := score.Calculate(in)

	note := pgtype.Text{}
	if req.Note != "" {
		note = pgtype.Text{String: req.Note, Valid: true}
	}

	checkin, err := s.store.UpsertCheckIn(ctx, db.UpsertCheckInParams{
		UserID:        user.ID,
		CheckedInDate: pgtype.Date{Time: today, Valid: true},
		Stress:        int16(req.Stress),
		Note:          note,
		Score:         int16(out.Score),
		RoleSnapshot:  user.Role,
		SleepSnapshot: user.SleepBaseline,
	})
	if err != nil {
		return UpsertResult{}, err
	}

	danger, _ := s.store.GetConsecutiveDangerDays(ctx, user.ID)

	if req.Note != "" {
		bgCtx := context.WithoutCancel(ctx)
		go s.scheduleFollowUps(bgCtx, checkin.ID, user.ID, req.Note, today)
	}

	var recoveryPlan []score.PlanSection
	if req.Stress >= 4 {
		planInput := score.RecoveryPlanInput{
			Note:            req.Note,
			Stress:          req.Stress,
			ConsecutiveDays: int(danger),
			Role:            score.Role(user.Role),
		}
		if s.ai != nil {
			aiCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			aiPlan, aiErr := s.ai.GenerateRecoveryPlan(aiCtx, req.Stress, req.Note, user.Role)
			cancel()
			if aiErr == nil {
				recoveryPlan = aiPlan
				bgCtx := context.WithoutCancel(ctx)
				go func(planSections []score.PlanSection) {
					planJSON, err := json.Marshal(planSections)
					if err != nil {
						return
					}
					tCtx, tCancel := context.WithTimeout(bgCtx, 5*time.Second)
					defer tCancel()
					_ = s.store.SetAIRecoveryPlan(tCtx, db.SetAIRecoveryPlanParams{
						ID:             checkin.ID,
						UserID:         checkin.UserID,
						AiRecoveryPlan: planJSON,
					})
				}(recoveryPlan)
			}
		}
		if recoveryPlan == nil {
			recoveryPlan = score.BuildDynamicRecoveryPlan(planInput)
		}
	}

	return UpsertResult{
		CheckIn: checkin,
		Score:   out,
		Explanation: score.BuildScoreExplanation(score.ExplanationInput{
			Score:                 out.Score,
			TodayStress:           &req.Stress,
			ConsecutiveDangerDays: int(danger),
			RecentStresses:        recentStresses,
		}),
		Suggestion:   score.BuildSuggestion(out.Score, true, int(danger)),
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

	recent, _ := s.store.ListRecentCheckIns(ctx, db.ListRecentCheckInsParams{
		UserID:  user.ID,
		Column2: 7,
	})

	recentStresses := make([]int, 0, len(recent))
	for _, c := range recent {
		if hasTodayCI && c.CheckedInDate.Time.Equal(today) {
			continue
		}
		recentStresses = append(recentStresses, int(c.Stress))
	}

	var todayStress *int
	if hasTodayCI {
		s := int(todayCI.Stress)
		todayStress = &s
	}

	var estScore *int
	if user.EstimatedScore.Valid {
		v := int(user.EstimatedScore.Int16)
		estScore = &v
	}

	in := score.Input{
		TodayStress:    todayStress,
		Role:           score.Role(user.Role),
		SleepBaseline:  score.SleepBaseline(user.SleepBaseline),
		RecentStresses: recentStresses,
		EstimatedScore: estScore,
		MeetingCount:   -1,
	}
	out := score.Calculate(in)

	danger, _ := s.store.GetConsecutiveDangerDays(ctx, user.ID)
	streak, _ := s.store.GetCheckInStreak(ctx, user.ID)
	count, _ := s.store.CountCheckIns(ctx, user.ID)

	trajectory := score.BuildTrajectoryInsight(score.TrajectoryInput{
		Score:                 out.Score,
		RecentStresses:        recentStresses,
		ConsecutiveDangerDays: int(danger),
		DayName: func(daysAhead int) string {
			return time.Now().In(userLocation(user.Timezone)).AddDate(0, 0, daysAhead).Weekday().String()
		},
	})

	return ScoreCardResult{
		Score: out,
		Explanation: score.BuildScoreExplanation(score.ExplanationInput{
			Score:                 out.Score,
			TodayStress:           todayStress,
			ConsecutiveDangerDays: int(danger),
			RecentStresses:        recentStresses,
		}),
		Suggestion: score.BuildSuggestion(out.Score, hasTodayCI, int(danger)),
		Trajectory: trajectory,
		Accuracy:   score.AccuracyLabel(int(count)),
		Streak:     streak,
		HasCheckIn: hasTodayCI,
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
			log.Printf("checkin: create follow-up for %s: %v", userID, err)
		}
		break // only one follow-up per day
	}
}

func extractSnippet(note, keyword string) string {
	lower := strings.ToLower(note)
	idx := strings.Index(lower, strings.ToLower(keyword))
	if idx < 0 {
		return note
	}
	start := idx - 20
	if start < 0 {
		start = 0
	}
	end := idx + len(keyword) + 40
	if end > len(note) {
		end = len(note)
	}
	snippet := strings.TrimSpace(note[start:end])
	if start > 0 {
		snippet = "…" + snippet
	}
	if end < len(note) {
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
