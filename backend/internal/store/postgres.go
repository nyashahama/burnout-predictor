package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// Postgres wraps *db.Queries, satisfying all consumer-defined store interfaces
// via Go structural typing. One forwarding method per sqlc-generated query.
// No logic lives here.
type Postgres struct{ q *db.Queries }

func New(q *db.Queries) *Postgres { return &Postgres{q} }

// ── users ─────────────────────────────────────────────────────────────────────

func (p *Postgres) ClearCalendarToken(ctx context.Context, id uuid.UUID) error {
	return p.q.ClearCalendarToken(ctx, id)
}

func (p *Postgres) CreateUser(ctx context.Context, arg db.CreateUserParams) (db.User, error) {
	return p.q.CreateUser(ctx, arg)
}

func (p *Postgres) GetUserByEmail(ctx context.Context, email string) (db.User, error) {
	return p.q.GetUserByEmail(ctx, email)
}

func (p *Postgres) GetUserByGoogleID(ctx context.Context, googleID pgtype.Text) (db.User, error) {
	return p.q.GetUserByGoogleID(ctx, googleID)
}

func (p *Postgres) GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error) {
	return p.q.GetUserByID(ctx, id)
}

func (p *Postgres) GetUserByPaddleCustomerID(ctx context.Context, paddleCustomerID pgtype.Text) (db.User, error) {
	return p.q.GetUserByPaddleCustomerID(ctx, paddleCustomerID)
}

func (p *Postgres) ListUsersForCheckinReminder(ctx context.Context) ([]db.ListUsersForCheckinReminderRow, error) {
	return p.q.ListUsersForCheckinReminder(ctx)
}

func (p *Postgres) ListUsersForMondayDebrief(ctx context.Context) ([]db.ListUsersForMondayDebriefRow, error) {
	return p.q.ListUsersForMondayDebrief(ctx)
}

func (p *Postgres) ListUsersForReengagement(ctx context.Context) ([]db.ListUsersForReengagementRow, error) {
	return p.q.ListUsersForReengagement(ctx)
}

func (p *Postgres) ListUsersForStreakAlert(ctx context.Context) ([]db.ListUsersForStreakAlertRow, error) {
	return p.q.ListUsersForStreakAlert(ctx)
}

func (p *Postgres) SetCalendarToken(ctx context.Context, arg db.SetCalendarTokenParams) error {
	return p.q.SetCalendarToken(ctx, arg)
}

func (p *Postgres) SetEstimatedScore(ctx context.Context, arg db.SetEstimatedScoreParams) error {
	return p.q.SetEstimatedScore(ctx, arg)
}

func (p *Postgres) SetPaddleCustomerID(ctx context.Context, arg db.SetPaddleCustomerIDParams) error {
	return p.q.SetPaddleCustomerID(ctx, arg)
}

func (p *Postgres) SetUserGoogleID(ctx context.Context, arg db.SetUserGoogleIDParams) error {
	return p.q.SetUserGoogleID(ctx, arg)
}

func (p *Postgres) SetUserTier(ctx context.Context, arg db.SetUserTierParams) error {
	return p.q.SetUserTier(ctx, arg)
}

func (p *Postgres) SoftDeleteUser(ctx context.Context, id uuid.UUID) error {
	return p.q.SoftDeleteUser(ctx, id)
}

func (p *Postgres) UpdateCalendarSyncedAt(ctx context.Context, id uuid.UUID) error {
	return p.q.UpdateCalendarSyncedAt(ctx, id)
}

func (p *Postgres) UpdateUserEmail(ctx context.Context, arg db.UpdateUserEmailParams) (db.User, error) {
	return p.q.UpdateUserEmail(ctx, arg)
}

func (p *Postgres) UpdateUserPassword(ctx context.Context, arg db.UpdateUserPasswordParams) error {
	return p.q.UpdateUserPassword(ctx, arg)
}

func (p *Postgres) UpdateUserProfile(ctx context.Context, arg db.UpdateUserProfileParams) (db.User, error) {
	return p.q.UpdateUserProfile(ctx, arg)
}

func (p *Postgres) VerifyUserEmail(ctx context.Context, id uuid.UUID) error {
	return p.q.VerifyUserEmail(ctx, id)
}

// ── auth tokens ───────────────────────────────────────────────────────────────

func (p *Postgres) CreateEmailVerification(ctx context.Context, arg db.CreateEmailVerificationParams) (db.EmailVerification, error) {
	return p.q.CreateEmailVerification(ctx, arg)
}

func (p *Postgres) CreatePasswordReset(ctx context.Context, arg db.CreatePasswordResetParams) (db.PasswordReset, error) {
	return p.q.CreatePasswordReset(ctx, arg)
}

func (p *Postgres) CreateRefreshToken(ctx context.Context, arg db.CreateRefreshTokenParams) (db.RefreshToken, error) {
	return p.q.CreateRefreshToken(ctx, arg)
}

func (p *Postgres) DeleteExpiredPasswordResets(ctx context.Context) error {
	return p.q.DeleteExpiredPasswordResets(ctx)
}

func (p *Postgres) DeleteExpiredRefreshTokens(ctx context.Context) error {
	return p.q.DeleteExpiredRefreshTokens(ctx)
}

func (p *Postgres) GetEmailVerification(ctx context.Context, tokenHash string) (db.EmailVerification, error) {
	return p.q.GetEmailVerification(ctx, tokenHash)
}

func (p *Postgres) GetPasswordReset(ctx context.Context, tokenHash string) (db.PasswordReset, error) {
	return p.q.GetPasswordReset(ctx, tokenHash)
}

func (p *Postgres) GetRefreshToken(ctx context.Context, tokenHash string) (db.RefreshToken, error) {
	return p.q.GetRefreshToken(ctx, tokenHash)
}

func (p *Postgres) MarkEmailVerificationUsed(ctx context.Context, tokenHash string) error {
	return p.q.MarkEmailVerificationUsed(ctx, tokenHash)
}

func (p *Postgres) MarkPasswordResetUsed(ctx context.Context, tokenHash string) error {
	return p.q.MarkPasswordResetUsed(ctx, tokenHash)
}

func (p *Postgres) RevokeAllUserRefreshTokens(ctx context.Context, userID uuid.UUID) error {
	return p.q.RevokeAllUserRefreshTokens(ctx, userID)
}

func (p *Postgres) RevokeRefreshToken(ctx context.Context, tokenHash string) error {
	return p.q.RevokeRefreshToken(ctx, tokenHash)
}

// ── check-ins ─────────────────────────────────────────────────────────────────

func (p *Postgres) CountCheckIns(ctx context.Context, userID uuid.UUID) (int64, error) {
	return p.q.CountCheckIns(ctx, userID)
}

func (p *Postgres) CountCheckInsInRange(ctx context.Context, arg db.CountCheckInsInRangeParams) (int64, error) {
	return p.q.CountCheckInsInRange(ctx, arg)
}

func (p *Postgres) CreateCheckIn(ctx context.Context, arg db.CreateCheckInParams) (db.CheckIn, error) {
	return p.q.CreateCheckIn(ctx, arg)
}

func (p *Postgres) ExportUserCheckIns(ctx context.Context, userID uuid.UUID) ([]db.ExportUserCheckInsRow, error) {
	return p.q.ExportUserCheckIns(ctx, userID)
}

func (p *Postgres) GetCheckInByID(ctx context.Context, arg db.GetCheckInByIDParams) (db.CheckIn, error) {
	return p.q.GetCheckInByID(ctx, arg)
}

func (p *Postgres) GetCheckInStreak(ctx context.Context, userID uuid.UUID) (int32, error) {
	return p.q.GetCheckInStreak(ctx, userID)
}

func (p *Postgres) GetConsecutiveDangerDays(ctx context.Context, userID uuid.UUID) (int32, error) {
	return p.q.GetConsecutiveDangerDays(ctx, userID)
}

func (p *Postgres) GetMonthlyAverageScore(ctx context.Context, arg db.GetMonthlyAverageScoreParams) (db.GetMonthlyAverageScoreRow, error) {
	return p.q.GetMonthlyAverageScore(ctx, arg)
}

func (p *Postgres) GetScoreTrendVs7DaysAgo(ctx context.Context, arg db.GetScoreTrendVs7DaysAgoParams) (int32, error) {
	return p.q.GetScoreTrendVs7DaysAgo(ctx, arg)
}

func (p *Postgres) GetTodayCheckIn(ctx context.Context, arg db.GetTodayCheckInParams) (db.CheckIn, error) {
	return p.q.GetTodayCheckIn(ctx, arg)
}

func (p *Postgres) GetYesterdayCheckIn(ctx context.Context, arg db.GetYesterdayCheckInParams) (db.CheckIn, error) {
	return p.q.GetYesterdayCheckIn(ctx, arg)
}

func (p *Postgres) ListCheckIns(ctx context.Context, arg db.ListCheckInsParams) ([]db.CheckIn, error) {
	return p.q.ListCheckIns(ctx, arg)
}

func (p *Postgres) ListCheckInsForDayOfWeek(ctx context.Context, arg db.ListCheckInsForDayOfWeekParams) ([]db.ListCheckInsForDayOfWeekRow, error) {
	return p.q.ListCheckInsForDayOfWeek(ctx, arg)
}

func (p *Postgres) ListCheckInsInRange(ctx context.Context, arg db.ListCheckInsInRangeParams) ([]db.CheckIn, error) {
	return p.q.ListCheckInsInRange(ctx, arg)
}

func (p *Postgres) ListCheckInsNeedingAIPlan(ctx context.Context) ([]db.CheckIn, error) {
	return p.q.ListCheckInsNeedingAIPlan(ctx)
}

func (p *Postgres) ListRecentCheckIns(ctx context.Context, arg db.ListRecentCheckInsParams) ([]db.ListRecentCheckInsRow, error) {
	return p.q.ListRecentCheckIns(ctx, arg)
}

func (p *Postgres) SetAIRecoveryPlan(ctx context.Context, arg db.SetAIRecoveryPlanParams) error {
	return p.q.SetAIRecoveryPlan(ctx, arg)
}

func (p *Postgres) UpsertCheckIn(ctx context.Context, arg db.UpsertCheckInParams) (db.CheckIn, error) {
	return p.q.UpsertCheckIn(ctx, arg)
}

// ── follow-ups ────────────────────────────────────────────────────────────────

func (p *Postgres) CreateFollowUp(ctx context.Context, arg db.CreateFollowUpParams) (db.FollowUp, error) {
	return p.q.CreateFollowUp(ctx, arg)
}

func (p *Postgres) DismissFollowUp(ctx context.Context, arg db.DismissFollowUpParams) error {
	return p.q.DismissFollowUp(ctx, arg)
}

func (p *Postgres) ExpireStaleFollowUps(ctx context.Context) error {
	return p.q.ExpireStaleFollowUps(ctx)
}

func (p *Postgres) GetTodayFollowUp(ctx context.Context, arg db.GetTodayFollowUpParams) (db.FollowUp, error) {
	return p.q.GetTodayFollowUp(ctx, arg)
}

func (p *Postgres) ListFollowUpsForUser(ctx context.Context, arg db.ListFollowUpsForUserParams) ([]db.FollowUp, error) {
	return p.q.ListFollowUpsForUser(ctx, arg)
}

func (p *Postgres) MarkFollowUpSurfaced(ctx context.Context, arg db.MarkFollowUpSurfacedParams) error {
	return p.q.MarkFollowUpSurfaced(ctx, arg)
}

// ── insight metadata ──────────────────────────────────────────────────────────

func (p *Postgres) DeleteInsightMetadata(ctx context.Context, arg db.DeleteInsightMetadataParams) error {
	return p.q.DeleteInsightMetadata(ctx, arg)
}

func (p *Postgres) DeleteOldDismissals(ctx context.Context) error {
	return p.q.DeleteOldDismissals(ctx)
}

func (p *Postgres) DismissComponent(ctx context.Context, arg db.DismissComponentParams) error {
	return p.q.DismissComponent(ctx, arg)
}

func (p *Postgres) GetAllInsightMetadata(ctx context.Context, userID uuid.UUID) ([]db.InsightMetadatum, error) {
	return p.q.GetAllInsightMetadata(ctx, userID)
}

func (p *Postgres) GetInsightMetadata(ctx context.Context, arg db.GetInsightMetadataParams) (db.InsightMetadatum, error) {
	return p.q.GetInsightMetadata(ctx, arg)
}

func (p *Postgres) IsComponentDismissed(ctx context.Context, arg db.IsComponentDismissedParams) (bool, error) {
	return p.q.IsComponentDismissed(ctx, arg)
}

func (p *Postgres) ListDismissedComponents(ctx context.Context, arg db.ListDismissedComponentsParams) ([]string, error) {
	return p.q.ListDismissedComponents(ctx, arg)
}

func (p *Postgres) ListInsightMetadataByPrefix(ctx context.Context, arg db.ListInsightMetadataByPrefixParams) ([]db.InsightMetadatum, error) {
	return p.q.ListInsightMetadataByPrefix(ctx, arg)
}

func (p *Postgres) SetInsightMetadata(ctx context.Context, arg db.SetInsightMetadataParams) (db.InsightMetadatum, error) {
	return p.q.SetInsightMetadata(ctx, arg)
}

// ── notifications ─────────────────────────────────────────────────────────────

func (p *Postgres) CreateDefaultNotificationPrefs(ctx context.Context, userID uuid.UUID) (db.UserNotificationPref, error) {
	return p.q.CreateDefaultNotificationPrefs(ctx, userID)
}

func (p *Postgres) CreateEmailLog(ctx context.Context, arg db.CreateEmailLogParams) (db.EmailLog, error) {
	return p.q.CreateEmailLog(ctx, arg)
}

func (p *Postgres) GetNotificationPrefs(ctx context.Context, userID uuid.UUID) (db.UserNotificationPref, error) {
	return p.q.GetNotificationPrefs(ctx, userID)
}

func (p *Postgres) IsEmailAlreadySent(ctx context.Context, arg db.IsEmailAlreadySentParams) (bool, error) {
	return p.q.IsEmailAlreadySent(ctx, arg)
}

func (p *Postgres) ListRecentEmailsForUser(ctx context.Context, arg db.ListRecentEmailsForUserParams) ([]db.ListRecentEmailsForUserRow, error) {
	return p.q.ListRecentEmailsForUser(ctx, arg)
}

func (p *Postgres) MarkEmailFailed(ctx context.Context, arg db.MarkEmailFailedParams) error {
	return p.q.MarkEmailFailed(ctx, arg)
}

func (p *Postgres) UpsertNotificationPrefs(ctx context.Context, arg db.UpsertNotificationPrefsParams) (db.UserNotificationPref, error) {
	return p.q.UpsertNotificationPrefs(ctx, arg)
}

// ── subscriptions ─────────────────────────────────────────────────────────────

func (p *Postgres) CancelSubscription(ctx context.Context, paddleSubscriptionID string) error {
	return p.q.CancelSubscription(ctx, paddleSubscriptionID)
}

func (p *Postgres) CreatePaddleEvent(ctx context.Context, arg db.CreatePaddleEventParams) (db.PaddleEvent, error) {
	return p.q.CreatePaddleEvent(ctx, arg)
}

func (p *Postgres) GetActiveSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (db.Subscription, error) {
	return p.q.GetActiveSubscriptionByUserID(ctx, userID)
}

func (p *Postgres) GetSubscriptionByPaddleID(ctx context.Context, paddleSubscriptionID string) (db.Subscription, error) {
	return p.q.GetSubscriptionByPaddleID(ctx, paddleSubscriptionID)
}

func (p *Postgres) ListExpiredSubscriptions(ctx context.Context) ([]db.ListExpiredSubscriptionsRow, error) {
	return p.q.ListExpiredSubscriptions(ctx)
}

func (p *Postgres) PaddleEventExists(ctx context.Context, eventID string) (bool, error) {
	return p.q.PaddleEventExists(ctx, eventID)
}

func (p *Postgres) SetSubscriptionPastDue(ctx context.Context, paddleSubscriptionID string) error {
	return p.q.SetSubscriptionPastDue(ctx, paddleSubscriptionID)
}

func (p *Postgres) UpsertSubscription(ctx context.Context, arg db.UpsertSubscriptionParams) (db.Subscription, error) {
	return p.q.UpsertSubscription(ctx, arg)
}

