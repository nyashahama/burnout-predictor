// Package notification owns all email dispatch and background maintenance tasks.
package notification

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/nyasha-hama/burnout-predictor-api/internal/ai"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	eml "github.com/nyasha-hama/burnout-predictor-api/internal/email"
	"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"
	"github.com/nyasha-hama/burnout-predictor-api/internal/score"
)

// notificationStore is the data-access contract for the notification service.
// store.Postgres satisfies this implicitly.
type notificationStore interface {
	ListUsersForCheckinReminder(ctx context.Context) ([]db.ListUsersForCheckinReminderRow, error)
	ListUsersForStreakAlert(ctx context.Context) ([]db.ListUsersForStreakAlertRow, error)
	ListUsersForMondayDebrief(ctx context.Context) ([]db.ListUsersForMondayDebriefRow, error)
	ListUsersForReengagement(ctx context.Context) ([]db.ListUsersForReengagementRow, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error)
	IsEmailAlreadySent(ctx context.Context, params db.IsEmailAlreadySentParams) (bool, error)
	CreateEmailLog(ctx context.Context, params db.CreateEmailLogParams) (db.EmailLog, error)
	MarkEmailFailed(ctx context.Context, params db.MarkEmailFailedParams) error
	GetCheckInStreak(ctx context.Context, userID uuid.UUID) (int32, error)
	GetConsecutiveDangerDays(ctx context.Context, userID uuid.UUID) (int32, error)
	ListRecentCheckIns(ctx context.Context, params db.ListRecentCheckInsParams) ([]db.ListRecentCheckInsRow, error)
	ListCheckInsInRange(ctx context.Context, params db.ListCheckInsInRangeParams) ([]db.CheckIn, error)
	ListCheckInsNeedingAIPlan(ctx context.Context) ([]db.CheckIn, error)
	SetAIRecoveryPlan(ctx context.Context, params db.SetAIRecoveryPlanParams) error
	ExpireStaleFollowUps(ctx context.Context) error
	ListExpiredSubscriptions(ctx context.Context) ([]db.ListExpiredSubscriptionsRow, error)
	CancelSubscription(ctx context.Context, paddleSubID string) error
	SetUserTier(ctx context.Context, params db.SetUserTierParams) error
	DeleteExpiredRefreshTokens(ctx context.Context) error
	DeleteExpiredPasswordResets(ctx context.Context) error
	DeleteOldDismissals(ctx context.Context) error
}

// Service owns all email dispatch and background maintenance tasks.
type Service struct {
	store notificationStore
	email *eml.Client
	ai    *ai.Client
	log   *slog.Logger
}

func New(store notificationStore, emailClient *eml.Client, aiClient *ai.Client, log *slog.Logger) *Service {
	return &Service{store: store, email: emailClient, ai: aiClient, log: log}
}

// RunMinutely evaluates all time-gated notification queries and sends emails as needed.
// Should be called every 60 seconds.
func (s *Service) RunMinutely(ctx context.Context) {
	if s.email == nil {
		return
	}
	s.sendCheckinReminders(ctx)
	s.sendStreakAlerts(ctx)
	s.sendMondayDebriefs(ctx)
	s.sendReEngagements(ctx)
}

// BackfillAIPlans generates recovery plans for high-stress check-ins that
// were saved without one (inline attempt timed out or AI was unavailable).
func (s *Service) BackfillAIPlans(ctx context.Context) {
	if s.ai == nil {
		return
	}
	checkins, err := s.store.ListCheckInsNeedingAIPlan(ctx)
	if err != nil {
		s.log.ErrorContext(ctx, "ai backfill: list check-ins failed", "request_id", reqid.FromCtx(ctx), "err", err)
		return
	}
	for _, ci := range checkins {
		note := ""
		if ci.Note.Valid {
			note = ci.Note.String
		}
		plan, err := s.ai.GenerateRecoveryPlan(ctx, int(ci.Stress), note, ci.RoleSnapshot)
		if err != nil {
			s.log.WarnContext(ctx, "ai backfill: generate plan failed", "request_id", reqid.FromCtx(ctx), "checkin_id", ci.ID, "err", err)
			continue
		}
		planJSON, err := json.Marshal(plan)
		if err != nil {
			continue
		}
		if err := s.store.SetAIRecoveryPlan(ctx, db.SetAIRecoveryPlanParams{
			ID:             ci.ID,
			UserID:         ci.UserID,
			AiRecoveryPlan: planJSON,
		}); err != nil {
			s.log.WarnContext(ctx, "ai backfill: store plan failed", "request_id", reqid.FromCtx(ctx), "checkin_id", ci.ID, "err", err)
		}
	}
}

// RunMaintenance handles subscription expiry, stale follow-up cleanup, token pruning,
// and old dismissal cleanup. Should be called every hour.
func (s *Service) RunMaintenance(ctx context.Context) {
	if err := s.store.ExpireStaleFollowUps(ctx); err != nil {
		s.log.ErrorContext(ctx, "maintenance: expire follow-ups failed", "request_id", reqid.FromCtx(ctx), "err", err)
	}

	expired, err := s.store.ListExpiredSubscriptions(ctx)
	if err != nil {
		s.log.ErrorContext(ctx, "maintenance: list expired subscriptions failed", "request_id", reqid.FromCtx(ctx), "err", err)
	}
	for _, sub := range expired {
		if err := s.store.CancelSubscription(ctx, sub.PaddleSubscriptionID); err != nil {
			s.log.ErrorContext(ctx, "maintenance: cancel subscription failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.PaddleSubscriptionID, "err", err)
			continue
		}
		if err := s.store.SetUserTier(ctx, db.SetUserTierParams{ID: sub.Uid, Tier: "free"}); err != nil {
			s.log.ErrorContext(ctx, "maintenance: downgrade user failed", "request_id", reqid.FromCtx(ctx), "user_id", sub.Uid, "err", err)
		}
	}

	if err := s.store.DeleteExpiredRefreshTokens(ctx); err != nil {
		s.log.WarnContext(ctx, "maintenance: delete expired refresh tokens failed", "request_id", reqid.FromCtx(ctx), "err", err)
	}
	if err := s.store.DeleteExpiredPasswordResets(ctx); err != nil {
		s.log.WarnContext(ctx, "maintenance: delete expired password resets failed", "request_id", reqid.FromCtx(ctx), "err", err)
	}
	if err := s.store.DeleteOldDismissals(ctx); err != nil {
		s.log.WarnContext(ctx, "maintenance: delete old dismissals failed", "request_id", reqid.FromCtx(ctx), "err", err)
	}
}

// ── individual email senders ──────────────────────────────────────────────────

func (s *Service) sendCheckinReminders(ctx context.Context) {
	users, err := s.store.ListUsersForCheckinReminder(ctx)
	if err != nil {
		s.log.ErrorContext(ctx, "reminder: list users failed", "request_id", reqid.FromCtx(ctx), "err", err)
		return
	}
	for _, u := range users {
		dedupKey := fmt.Sprintf("checkin-reminder-%s", localDate(u.Timezone))
		if already, _ := s.store.IsEmailAlreadySent(ctx, db.IsEmailAlreadySentParams{
			UserID:   pgtype.UUID{Bytes: u.ID, Valid: true},
			DedupKey: pgtype.Text{String: dedupKey, Valid: true},
		}); already {
			continue
		}

		streak, _ := s.store.GetCheckInStreak(ctx, u.ID)
		danger, _ := s.store.GetConsecutiveDangerDays(ctx, u.ID)
		title, body := score.BuildNotificationText(score.NotificationInput{
			Streak:                int(streak),
			ConsecutiveDangerDays: int(danger),
			Name:                  u.Name,
		})

		subject, html := eml.CheckinReminder(title, body)
		s.send(ctx, u.ID, u.Email, "checkin-reminder", dedupKey, subject, html)
	}
}

func (s *Service) sendStreakAlerts(ctx context.Context) {
	users, err := s.store.ListUsersForStreakAlert(ctx)
	if err != nil {
		s.log.ErrorContext(ctx, "streak alert: list users failed", "request_id", reqid.FromCtx(ctx), "err", err)
		return
	}
	for _, u := range users {
		dedupKey := fmt.Sprintf("streak-alert-%s", localDate(u.Timezone))
		if already, _ := s.store.IsEmailAlreadySent(ctx, db.IsEmailAlreadySentParams{
			UserID:   pgtype.UUID{Bytes: u.ID, Valid: true},
			DedupKey: pgtype.Text{String: dedupKey, Valid: true},
		}); already {
			continue
		}

		streak, _ := s.store.GetCheckInStreak(ctx, u.ID)
		if streak < 3 {
			continue
		}

		subject, html := eml.StreakAlert(u.Name, int(streak))
		s.send(ctx, u.ID, u.Email, "streak-alert", dedupKey, subject, html)
	}
}

func (s *Service) sendMondayDebriefs(ctx context.Context) {
	users, err := s.store.ListUsersForMondayDebrief(ctx)
	if err != nil {
		s.log.ErrorContext(ctx, "monday debrief: list users failed", "request_id", reqid.FromCtx(ctx), "err", err)
		return
	}
	for _, u := range users {
		yr, wk := time.Now().In(loc(u.Timezone)).ISOWeek()
		dedupKey := fmt.Sprintf("monday-debrief-%04d-W%02d", yr, wk)
		if already, _ := s.store.IsEmailAlreadySent(ctx, db.IsEmailAlreadySentParams{
			UserID:   pgtype.UUID{Bytes: u.ID, Valid: true},
			DedupKey: pgtype.Text{String: dedupKey, Valid: true},
		}); already {
			continue
		}

		recent, err := s.store.ListRecentCheckIns(ctx, db.ListRecentCheckInsParams{
			UserID:  u.ID,
			Column2: 7,
		})
		if err != nil || len(recent) < 3 {
			continue
		}

		now := time.Now().In(loc(u.Timezone))
		weekStart := time.Date(now.Year(), now.Month(), now.Day()-7, 0, 0, 0, 0, time.UTC)
		prevStart := weekStart.AddDate(0, 0, -7)
		prior, _ := s.store.ListCheckInsInRange(ctx, db.ListCheckInsInRangeParams{
			UserID:          u.ID,
			CheckedInDate:   pgtype.Date{Time: prevStart, Valid: true},
			CheckedInDate_2: pgtype.Date{Time: weekStart, Valid: true},
		})

		avgThis := avgRecentScore(recent)
		delta := 0
		if prevAvg := avgFullScore(prior); prevAvg > 0 {
			delta = avgThis - prevAvg
		}

		var topPattern string
		if hist := toHistoryEntries(recent); len(hist) >= 7 {
			if pr := score.DetectPatterns(hist); len(pr.Patterns) > 0 {
				topPattern = pr.Patterns[0]
			}
		}

		subject, html := eml.MondayDebrief(u.Name, avgThis, delta, topPattern)
		s.send(ctx, u.ID, u.Email, "monday-debrief", dedupKey, subject, html)
	}
}

func (s *Service) sendReEngagements(ctx context.Context) {
	users, err := s.store.ListUsersForReengagement(ctx)
	if err != nil {
		s.log.ErrorContext(ctx, "re-engage: list users failed", "request_id", reqid.FromCtx(ctx), "err", err)
		return
	}
	for _, u := range users {
		dedupKey := fmt.Sprintf("re-engage-%s", localDate("UTC"))
		if already, _ := s.store.IsEmailAlreadySent(ctx, db.IsEmailAlreadySentParams{
			UserID:   pgtype.UUID{Bytes: u.ID, Valid: true},
			DedupKey: pgtype.Text{String: dedupKey, Valid: true},
		}); already {
			continue
		}

		user, err := s.store.GetUserByID(ctx, u.ID)
		if err != nil {
			continue
		}
		subject, html := eml.ReEngage(user.Name)
		s.send(ctx, u.ID, u.Email, "re-engage", dedupKey, subject, html)
	}
}

// send delivers one email and records it in email_logs.
func (s *Service) send(ctx context.Context, userID uuid.UUID, to, template, dedupKey, subject, html string) {
	msgID, err := s.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html})

	status := "sent"
	if err != nil {
		status = "failed"
		s.log.WarnContext(ctx, "email send failed", "request_id", reqid.FromCtx(ctx), "template", template, "to", to, "err", err)
	}

	logEntry, logErr := s.store.CreateEmailLog(ctx, db.CreateEmailLogParams{
		UserID:          pgtype.UUID{Bytes: userID, Valid: true},
		Email:           to,
		Template:        template,
		DedupKey:        pgtype.Text{String: dedupKey, Valid: true},
		ResendMessageID: pgtype.Text{String: msgID, Valid: msgID != ""},
		Status:          status,
	})
	if logErr == nil && err != nil {
		_ = s.store.MarkEmailFailed(ctx, db.MarkEmailFailedParams{
			ID:           logEntry.ID,
			ErrorMessage: pgtype.Text{String: err.Error(), Valid: true},
		})
	}
}

// ── private helpers ───────────────────────────────────────────────────────────

func localDate(timezone string) string {
	return time.Now().In(loc(timezone)).Format("2006-01-02")
}

func loc(tz string) *time.Location {
	l, err := time.LoadLocation(tz)
	if err != nil {
		return time.UTC
	}
	return l
}

func avgRecentScore(rows []db.ListRecentCheckInsRow) int {
	if len(rows) == 0 {
		return 0
	}
	sum := 0
	for _, r := range rows {
		sum += int(r.Score)
	}
	return sum / len(rows)
}

func avgFullScore(rows []db.CheckIn) int {
	if len(rows) == 0 {
		return 0
	}
	sum := 0
	for _, r := range rows {
		sum += int(r.Score)
	}
	return sum / len(rows)
}

func toHistoryEntries(rows []db.ListRecentCheckInsRow) []score.HistoryEntry {
	out := make([]score.HistoryEntry, len(rows))
	for i, r := range rows {
		out[i] = score.HistoryEntry{Date: r.CheckedInDate.Time, Score: int(r.Score)}
	}
	return out
}
