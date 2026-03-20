package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/validate"
)

type notifPrefsStore interface {
	GetNotificationPrefs(ctx context.Context, userID uuid.UUID) (db.UserNotificationPref, error)
	UpsertNotificationPrefs(ctx context.Context, params db.UpsertNotificationPrefsParams) (db.UserNotificationPref, error)
	CreateDefaultNotificationPrefs(ctx context.Context, userID uuid.UUID) (db.UserNotificationPref, error)
}

// NotifPrefsResponse is the API shape for notification preferences.
type NotifPrefsResponse struct {
	CheckinReminder    bool   `json:"checkin_reminder"`
	ReminderTime       string `json:"reminder_time"`
	MondayDebriefEmail bool   `json:"monday_debrief_email"`
	WeeklySummaryEmail bool   `json:"weekly_summary_email"`
	StreakAlertEmail   bool   `json:"streak_alert_email"`
	PatternEmail       bool   `json:"pattern_email"`
	ReEngageEmail      bool   `json:"re_engage_email"`
}

// NotifPrefsHandler handles GET and PATCH /api/notifications/prefs.
type NotifPrefsHandler struct {
	store notifPrefsStore
}

func NewNotifPrefsHandler(store notifPrefsStore) *NotifPrefsHandler {
	return &NotifPrefsHandler{store: store}
}

func (h *NotifPrefsHandler) Get(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	prefs, err := h.store.GetNotificationPrefs(r.Context(), user.ID)
	if err != nil {
		// No row yet — create defaults and return them.
		prefs, _ = h.store.CreateDefaultNotificationPrefs(r.Context(), user.ID)
	}
	respond.JSON(w, http.StatusOK, toPrefsResponse(prefs))
}

func (h *NotifPrefsHandler) Update(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	var body struct {
		CheckinReminder    bool   `json:"checkin_reminder"`
		ReminderTime       string `json:"reminder_time"`
		MondayDebriefEmail bool   `json:"monday_debrief_email"`
		WeeklySummaryEmail bool   `json:"weekly_summary_email"`
		StreakAlertEmail   bool   `json:"streak_alert_email"`
		PatternEmail       bool   `json:"pattern_email"`
		ReEngageEmail      bool   `json:"re_engage_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := validate.ReminderTime(body.ReminderTime); err != nil {
		respond.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	params := db.UpsertNotificationPrefsParams{
		UserID:             user.ID,
		CheckinReminder:    body.CheckinReminder,
		MondayDebriefEmail: body.MondayDebriefEmail,
		WeeklySummaryEmail: body.WeeklySummaryEmail,
		StreakAlertEmail:   body.StreakAlertEmail,
		PatternEmail:       body.PatternEmail,
		ReEngageEmail:      body.ReEngageEmail,
	}
	if body.ReminderTime != "" {
		params.ReminderTime = parseReminderTime(body.ReminderTime)
	}

	prefs, err := h.store.UpsertNotificationPrefs(r.Context(), params)
	if err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to save preferences")
		return
	}
	respond.JSON(w, http.StatusOK, toPrefsResponse(prefs))
}

// toPrefsResponse converts the DB type to the API response shape,
// formatting reminder_time as "HH:MM".
func toPrefsResponse(p db.UserNotificationPref) NotifPrefsResponse {
	rt := ""
	if p.ReminderTime.Valid {
		// pgtype.Time stores microseconds since midnight.
		us := p.ReminderTime.Microseconds
		h := us / (60 * 60 * 1_000_000)
		m := (us % (60 * 60 * 1_000_000)) / (60 * 1_000_000)
		rt = fmt.Sprintf("%02d:%02d", h, m)
	}
	return NotifPrefsResponse{
		CheckinReminder:    p.CheckinReminder,
		ReminderTime:       rt,
		MondayDebriefEmail: p.MondayDebriefEmail,
		WeeklySummaryEmail: p.WeeklySummaryEmail,
		StreakAlertEmail:   p.StreakAlertEmail,
		PatternEmail:       p.PatternEmail,
		ReEngageEmail:      p.ReEngageEmail,
	}
}

// parseReminderTime converts "HH:MM" to pgtype.Time (microseconds since midnight).
func parseReminderTime(s string) pgtype.Time {
	t, err := time.Parse("15:04", s)
	if err != nil {
		return pgtype.Time{}
	}
	us := int64(t.Hour())*60*60*1_000_000 + int64(t.Minute())*60*1_000_000
	return pgtype.Time{Microseconds: us, Valid: true}
}
