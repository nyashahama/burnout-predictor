package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
	insightsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/insight"
)

type insightService interface {
	Get(ctx context.Context, user db.User) (insightsvc.InsightBundle, error)
	DismissComponent(ctx context.Context, userID uuid.UUID, req insightsvc.DismissRequest) error
}

// InsightHandler handles insight endpoints.
type InsightHandler struct {
	svc insightService
}

func NewInsightHandler(svc insightService) *InsightHandler {
	return &InsightHandler{svc: svc}
}

func (h *InsightHandler) Get(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	bundle, err := h.svc.Get(r.Context(), user)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, bundle)
}

func (h *InsightHandler) DismissComponent(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	var req insightsvc.DismissRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.DismissComponent(r.Context(), user.ID, req); err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "dismissed"})
}
