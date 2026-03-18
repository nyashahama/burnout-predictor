package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/score"
)

// UpsertCheckIn handles POST /api/checkins.
//
// Flow:
//  1. Decode stress (1–5) and optional note from the request body.
//  2. Fetch the user's last 7 check-ins to build the trend modifier.
//  3. Construct score.Input from real DB data (user profile + recent history).
//  4. Call score.Calculate to compute the cognitive load score.
//  5. Persist the check-in with the computed score via UpsertCheckIn.
//  6. Return the stored check-in, score output, explanation, and suggestion.
func (h *Handler) UpsertCheckIn(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Stress int    `json:"stress"`
		Note   string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Stress < 1 || req.Stress > 5 {
		writeError(w, http.StatusBadRequest, "stress must be 1–5")
		return
	}

	user := userFromCtx(r.Context())
	today := localDate(user.Timezone)

	// Fetch the last 7 check-ins for the trend modifier.
	// We exclude today's date from the trend slice because today's stress is being set now.
	recent, err := h.q.ListRecentCheckIns(r.Context(), db.ListRecentCheckInsParams{
		UserID:  user.ID,
		Column2: 7,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load history")
		return
	}

	recentStresses := make([]int, 0, len(recent))
	for _, c := range recent {
		if c.CheckedInDate.Time.Equal(today) {
			continue // exclude today — it's being replaced
		}
		recentStresses = append(recentStresses, int(c.Stress))
	}

	// Calendar pressure: -1 = not connected. Plug in real meeting count when
	// Google Calendar OAuth is live; for now the signal is suppressed.
	meetingCount := -1

	var estScore *int
	if user.EstimatedScore.Valid {
		v := int(user.EstimatedScore.Int16)
		estScore = &v
	}

	// Build the score engine input from real DB data.
	in := score.Input{
		TodayStress:    &req.Stress,
		Role:           score.Role(user.Role),
		SleepBaseline:  score.SleepBaseline(user.SleepBaseline),
		RecentStresses: recentStresses,
		EstimatedScore: estScore,
		MeetingCount:   meetingCount,
	}
	out := score.Calculate(in)

	// Persist the check-in with the server-computed score.
	note := pgtype.Text{}
	if req.Note != "" {
		note = pgtype.Text{String: req.Note, Valid: true}
	}
	mtg := pgtype.Int2{}
	if meetingCount >= 0 {
		mtg = pgtype.Int2{Int16: int16(meetingCount), Valid: true}
	}

	checkin, err := h.q.UpsertCheckIn(r.Context(), db.UpsertCheckInParams{
		UserID:        user.ID,
		CheckedInDate: pgtype.Date{Time: today, Valid: true},
		Stress:        int16(req.Stress),
		Note:          note,
		Score:         int16(out.Score),
		RoleSnapshot:  user.Role,
		SleepSnapshot: user.SleepBaseline,
		MeetingCount:  mtg,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save check-in")
		return
	}

	danger, _ := h.q.GetConsecutiveDangerDays(r.Context(), user.ID)

	// Parse note for upcoming events and schedule follow-ups for tomorrow.
	if req.Note != "" {
		go h.scheduleFollowUps(checkin.ID, user.ID, req.Note, today)
	}

	// Generate a recovery plan for high-stress check-ins (stress >= 4).
	// Try AI with a 10-second timeout; fall back to rule-based plan on any failure.
	var recoveryPlan []score.PlanSection
	if req.Stress >= 4 {
		planInput := score.RecoveryPlanInput{
			Note:            req.Note,
			Stress:          req.Stress,
			ConsecutiveDays: int(danger),
			Role:            score.Role(user.Role),
		}
		if h.ai != nil {
			aiCtx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			aiPlan, aiErr := h.ai.GenerateRecoveryPlan(aiCtx, req.Stress, req.Note, user.Role)
			cancel()
			if aiErr == nil {
				recoveryPlan = aiPlan
				// Persist AI plan onto the check-in row asynchronously.
				go func(planSections []score.PlanSection) {
					planJSON, err := json.Marshal(planSections)
					if err != nil {
						return
					}
					bgCtx, bgCancel := context.WithTimeout(context.Background(), 5*time.Second)
					defer bgCancel()
					_ = h.q.SetAIRecoveryPlan(bgCtx, db.SetAIRecoveryPlanParams{
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

	resp := map[string]interface{}{
		"check_in": checkin,
		"score":    out,
		"explanation": score.BuildScoreExplanation(score.ExplanationInput{
			Score:                 out.Score,
			TodayStress:           &req.Stress,
			ConsecutiveDangerDays: int(danger),
			RecentStresses:        recentStresses,
		}),
		"suggestion": score.BuildSuggestion(out.Score, true, int(danger)),
	}
	if recoveryPlan != nil {
		resp["recovery_plan"] = recoveryPlan
	}
	writeJSON(w, http.StatusOK, resp)
}

// GetScore handles GET /api/score.
//
// Computes the full score card from real DB data — today's check-in (if any),
// recent check-in history, and the user's profile. Works before and after a
// check-in has been submitted for the day.
func (h *Handler) GetScore(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r.Context())
	today := localDate(user.Timezone)

	// Today's check-in (may not exist yet — Day 1 or not yet checked in).
	todayCI, todayErr := h.q.GetTodayCheckIn(r.Context(), db.GetTodayCheckInParams{
		UserID:        user.ID,
		CheckedInDate: pgtype.Date{Time: today, Valid: true},
	})
	hasTodayCI := todayErr == nil

	// Last 7 check-ins for the trend modifier.
	recent, _ := h.q.ListRecentCheckIns(r.Context(), db.ListRecentCheckInsParams{
		UserID:  user.ID,
		Column2: 7,
	})

	recentStresses := make([]int, 0, len(recent))
	for _, c := range recent {
		if hasTodayCI && c.CheckedInDate.Time.Equal(today) {
			continue // today's stress is passed separately via TodayStress
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

	danger, _ := h.q.GetConsecutiveDangerDays(r.Context(), user.ID)
	streak, _ := h.q.GetCheckInStreak(r.Context(), user.ID)
	count, _ := h.q.CountCheckIns(r.Context(), user.ID)

	trajectory := score.BuildTrajectoryInsight(score.TrajectoryInput{
		Score:                 out.Score,
		RecentStresses:        recentStresses,
		ConsecutiveDangerDays: int(danger),
		DayName: func(daysAhead int) string {
			return time.Now().In(userLocation(user.Timezone)).AddDate(0, 0, daysAhead).Weekday().String()
		},
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"score": out,
		"explanation": score.BuildScoreExplanation(score.ExplanationInput{
			Score:                 out.Score,
			TodayStress:           todayStress,
			ConsecutiveDangerDays: int(danger),
			RecentStresses:        recentStresses,
		}),
		"suggestion":  score.BuildSuggestion(out.Score, hasTodayCI, int(danger)),
		"trajectory":  trajectory,
		"accuracy":    score.AccuracyLabel(int(count)),
		"streak":      streak,
		"has_checkin": hasTodayCI,
	})
}

// ListCheckIns handles GET /api/checkins — returns the last 30 check-ins, newest first.
func (h *Handler) ListCheckIns(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r.Context())
	checkins, err := h.q.ListCheckIns(r.Context(), db.ListCheckInsParams{
		UserID: user.ID,
		Limit:  30,
		Offset: 0,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load check-ins")
		return
	}
	writeJSON(w, http.StatusOK, checkins)
}

// localDate returns midnight UTC for the current calendar date in the given timezone.
func localDate(timezone string) time.Time {
	loc := userLocation(timezone)
	now := time.Now().In(loc)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

// userLocation parses a timezone string, falling back to UTC on error.
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
