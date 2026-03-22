package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
)

type followUpStore interface {
	GetTodayFollowUp(ctx context.Context, params db.GetTodayFollowUpParams) (db.FollowUp, error)
	MarkFollowUpSurfaced(ctx context.Context, params db.MarkFollowUpSurfacedParams) error
	DismissFollowUp(ctx context.Context, params db.DismissFollowUpParams) error
}

// FollowUpHandler handles follow-up endpoints.
// Note: follow-up retrieval and dismissal are thin DB operations — no service layer needed.
type FollowUpHandler struct {
	store followUpStore
	log   *slog.Logger
}

func NewFollowUpHandler(store followUpStore, log *slog.Logger) *FollowUpHandler {
	if log == nil {
		log = slog.Default()
	}
	return &FollowUpHandler{store: store, log: log}
}

func localDate(timezone string) time.Time {
	loc := time.UTC
	if timezone != "" {
		if l, err := time.LoadLocation(timezone); err == nil {
			loc = l
		}
	}
	now := time.Now().In(loc)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

func (h *FollowUpHandler) GetToday(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	today := localDate(user.Timezone)

	fu, err := h.store.GetTodayFollowUp(r.Context(), db.GetTodayFollowUpParams{
		UserID:   user.ID,
		FireDate: pgtype.Date{Time: today, Valid: true},
	})
	if err != nil {
		respond.JSON(w, http.StatusOK, map[string]interface{}{"follow_up": nil})
		return
	}

	if !fu.SurfacedAt.Valid {
		if err := h.store.MarkFollowUpSurfaced(r.Context(), db.MarkFollowUpSurfacedParams{
			ID:     fu.ID,
			UserID: user.ID,
		}); err != nil {
			h.log.WarnContext(r.Context(), "follow-up: mark surfaced failed", "follow_up_id", fu.ID, "err", err)
		}
	}

	respond.JSON(w, http.StatusOK, map[string]interface{}{"follow_up": fu})
}

func (h *FollowUpHandler) Dismiss(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	fuID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid follow-up id")
		return
	}

	if err := h.store.DismissFollowUp(r.Context(), db.DismissFollowUpParams{
		ID:     fuID,
		UserID: user.ID,
	}); err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to dismiss follow-up")
		return
	}

	respond.JSON(w, http.StatusOK, map[string]string{"status": "dismissed"})
}
