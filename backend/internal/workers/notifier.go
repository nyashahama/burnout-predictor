// Package workers contains background jobs that run on a schedule.
package workers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/nyasha-hama/burnout-predictor-api/internal/ai"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	eml "github.com/nyasha-hama/burnout-predictor-api/internal/email"
	"github.com/nyasha-hama/burnout-predictor-api/internal/score"
)

// Notifier holds dependencies for all background notification and AI jobs.
type Notifier struct {
	q     *db.Queries
	email *eml.Client
	ai    *ai.Client
}

// New creates a Notifier. email and ai may be nil (jobs requiring them are skipped).
func New(q *db.Queries, emailClient *eml.Client, aiClient *ai.Client) *Notifier {
	return &Notifier{q: q, email: emailClient, ai: aiClient}
}

// RunMinutely should be called every 60 seconds.
// It evaluates all time-gated notification queries and sends emails as needed.
// The underlying SQL already handles timezone and dedup logic; this just triggers them.
func (n *Notifier) RunMinutely(ctx context.Context) {
	if n.email == nil {
		return
	}
	n.sendCheckinReminders(ctx)
	n.sendStreakAlerts(ctx)
	n.sendMondayDebriefs(ctx)
	n.sendReEngagements(ctx)
}

// RunHourly should be called every hour.
// Handles subscription expiry downgrades, stale follow-up cleanup, token pruning,
// and old dismissal cleanup.
func (n *Notifier) RunHourly(ctx context.Context) {
	// Expire stale follow-ups (fire_date > 7 days ago, never surfaced).
	if err := n.q.ExpireStaleFollowUps(ctx); err != nil {
		log.Printf("workers/hourly: expire follow-ups: %v", err)
	}

	// Downgrade users whose cancel-at-period-end subscription has now expired.
	expired, err := n.q.ListExpiredSubscriptions(ctx)
	if err != nil {
		log.Printf("workers/hourly: list expired subscriptions: %v", err)
	}
	for _, sub := range expired {
		if err := n.q.CancelSubscription(ctx, sub.PaddleSubscriptionID); err != nil {
			log.Printf("workers/hourly: cancel sub %s: %v", sub.PaddleSubscriptionID, err)
			continue
		}
		if err := n.q.SetUserTier(ctx, db.SetUserTierParams{ID: sub.Uid, Tier: "free"}); err != nil {
			log.Printf("workers/hourly: downgrade user %s: %v", sub.Uid, err)
		}
	}

	// Prune expired tokens and old dismissals (maintenance).
	_ = n.q.DeleteExpiredRefreshTokens(ctx)
	_ = n.q.DeleteExpiredPasswordResets(ctx)
	_ = n.q.DeleteOldDismissals(ctx)
}

// RunAIPlans generates recovery plans for high-stress check-ins that were
// saved without one (inline attempt timed out or AI was unavailable at the time).
func (n *Notifier) RunAIPlans(ctx context.Context) {
	if n.ai == nil {
		return
	}
	checkins, err := n.q.ListCheckInsNeedingAIPlan(ctx)
	if err != nil {
		log.Printf("workers/ai: list: %v", err)
		return
	}
	for _, ci := range checkins {
		note := ""
		if ci.Note.Valid {
			note = ci.Note.String
		}
		plan, err := n.ai.GenerateRecoveryPlan(ctx, int(ci.Stress), note, ci.RoleSnapshot)
		if err != nil {
			log.Printf("workers/ai: generate for %s: %v", ci.ID, err)
			continue
		}
		planJSON, err := json.Marshal(plan)
		if err != nil {
			continue
		}
		if err := n.q.SetAIRecoveryPlan(ctx, db.SetAIRecoveryPlanParams{
			ID:             ci.ID,
			UserID:         ci.UserID,
			AiRecoveryPlan: planJSON,
		}); err != nil {
			log.Printf("workers/ai: store for %s: %v", ci.ID, err)
		}
	}
}

// ── individual email senders ──────────────────────────────────────────────────

func (n *Notifier) sendCheckinReminders(ctx context.Context) {
	users, err := n.q.ListUsersForCheckinReminder(ctx)
	if err != nil {
		log.Printf("workers/reminder: list: %v", err)
		return
	}
	for _, u := range users {
		dedupKey := fmt.Sprintf("checkin-reminder-%s", localDate(u.Timezone))
		if already, _ := n.q.IsEmailAlreadySent(ctx, db.IsEmailAlreadySentParams{
			UserID:   pgtype.UUID{Bytes: u.ID, Valid: true},
			DedupKey: pgtype.Text{String: dedupKey, Valid: true},
		}); already {
			continue
		}

		// score.BuildNotificationText picks context-aware copy based on real data.
		streak, _ := n.q.GetCheckInStreak(ctx, u.ID)
		danger, _ := n.q.GetConsecutiveDangerDays(ctx, u.ID)
		title, body := score.BuildNotificationText(score.NotificationInput{
			Streak:                int(streak),
			ConsecutiveDangerDays: int(danger),
			Name:                  u.Name,
		})

		subject, html := eml.CheckinReminder(title, body)
		n.send(ctx, u.ID, u.Email, "checkin-reminder", dedupKey, subject, html)
	}
}

func (n *Notifier) sendStreakAlerts(ctx context.Context) {
	users, err := n.q.ListUsersForStreakAlert(ctx)
	if err != nil {
		log.Printf("workers/streak: list: %v", err)
		return
	}
	for _, u := range users {
		dedupKey := fmt.Sprintf("streak-alert-%s", localDate(u.Timezone))
		if already, _ := n.q.IsEmailAlreadySent(ctx, db.IsEmailAlreadySentParams{
			UserID:   pgtype.UUID{Bytes: u.ID, Valid: true},
			DedupKey: pgtype.Text{String: dedupKey, Valid: true},
		}); already {
			continue
		}

		streak, _ := n.q.GetCheckInStreak(ctx, u.ID)
		if streak < 3 {
			continue
		}

		subject, html := eml.StreakAlert(u.Name, int(streak))
		n.send(ctx, u.ID, u.Email, "streak-alert", dedupKey, subject, html)
	}
}

func (n *Notifier) sendMondayDebriefs(ctx context.Context) {
	users, err := n.q.ListUsersForMondayDebrief(ctx)
	if err != nil {
		log.Printf("workers/debrief: list: %v", err)
		return
	}
	for _, u := range users {
		yr, wk := time.Now().In(loc(u.Timezone)).ISOWeek()
		dedupKey := fmt.Sprintf("monday-debrief-%04d-W%02d", yr, wk)
		if already, _ := n.q.IsEmailAlreadySent(ctx, db.IsEmailAlreadySentParams{
			UserID:   pgtype.UUID{Bytes: u.ID, Valid: true},
			DedupKey: pgtype.Text{String: dedupKey, Valid: true},
		}); already {
			continue
		}

		recent, err := n.q.ListRecentCheckIns(ctx, db.ListRecentCheckInsParams{
			UserID:  u.ID,
			Column2: 7,
		})
		if err != nil || len(recent) < 3 {
			continue
		}

		// Last-week average vs prior week average for trend delta.
		now := time.Now().In(loc(u.Timezone))
		weekStart := time.Date(now.Year(), now.Month(), now.Day()-7, 0, 0, 0, 0, time.UTC)
		prevStart := weekStart.AddDate(0, 0, -7)
		prior, _ := n.q.ListCheckInsInRange(ctx, db.ListCheckInsInRangeParams{
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
		n.send(ctx, u.ID, u.Email, "monday-debrief", dedupKey, subject, html)
	}
}

func (n *Notifier) sendReEngagements(ctx context.Context) {
	users, err := n.q.ListUsersForReengagement(ctx)
	if err != nil {
		log.Printf("workers/reengage: list: %v", err)
		return
	}
	for _, u := range users {
		dedupKey := fmt.Sprintf("re-engage-%s", localDate("UTC"))
		if already, _ := n.q.IsEmailAlreadySent(ctx, db.IsEmailAlreadySentParams{
			UserID:   pgtype.UUID{Bytes: u.ID, Valid: true},
			DedupKey: pgtype.Text{String: dedupKey, Valid: true},
		}); already {
			continue
		}

		user, err := n.q.GetUserByID(ctx, u.ID)
		if err != nil {
			continue
		}
		subject, html := eml.ReEngage(user.Name)
		n.send(ctx, u.ID, u.Email, "re-engage", dedupKey, subject, html)
	}
}

// send delivers one email and records it in email_logs.
func (n *Notifier) send(ctx context.Context, userID uuid.UUID, to, template, dedupKey, subject, html string) {
	msgID, err := n.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html})

	status := "sent"
	if err != nil {
		status = "failed"
		log.Printf("workers/email: %s → %s: %v", template, to, err)
	}

	logEntry, logErr := n.q.CreateEmailLog(ctx, db.CreateEmailLogParams{
		UserID:          pgtype.UUID{Bytes: userID, Valid: true},
		Email:           to,
		Template:        template,
		DedupKey:        pgtype.Text{String: dedupKey, Valid: true},
		ResendMessageID: pgtype.Text{String: msgID, Valid: msgID != ""},
		Status:          status,
	})
	if logErr == nil && err != nil {
		_ = n.q.MarkEmailFailed(ctx, db.MarkEmailFailedParams{
			ID:           logEntry.ID,
			ErrorMessage: pgtype.Text{String: err.Error(), Valid: true},
		})
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

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
