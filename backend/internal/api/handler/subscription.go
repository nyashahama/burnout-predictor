package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
)

type subscriptionStore interface {
	GetActiveSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (db.Subscription, error)
}

type subscriptionResponse struct {
	PlanName          string    `json:"plan_name"`
	Status            string    `json:"status"`
	CurrentPeriodEnd  time.Time `json:"current_period_end"`
	CancelAtPeriodEnd bool      `json:"cancel_at_period_end"`
	SeatCount         int16     `json:"seat_count"`
}

// SubscriptionHandler handles GET /api/user/subscription.
type SubscriptionHandler struct {
	store subscriptionStore
}

func NewSubscriptionHandler(store subscriptionStore) *SubscriptionHandler {
	return &SubscriptionHandler{store: store}
}

func (h *SubscriptionHandler) Get(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	sub, err := h.store.GetActiveSubscriptionByUserID(r.Context(), user.ID)
	if err != nil {
		respond.JSON(w, http.StatusOK, map[string]any{"subscription": nil})
		return
	}
	resp := subscriptionResponse{
		PlanName:          sub.PlanName,
		Status:            sub.Status,
		CancelAtPeriodEnd: sub.CancelAtPeriodEnd,
		SeatCount:         sub.SeatCount,
	}
	if sub.CurrentPeriodEnd.Valid {
		resp.CurrentPeriodEnd = sub.CurrentPeriodEnd.Time
	}
	respond.JSON(w, http.StatusOK, map[string]any{"subscription": resp})
}
