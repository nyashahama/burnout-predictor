package handler

import (
	"context"
	"net/http"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	dashboardsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/dashboard"
)

type dashboardService interface {
	GetBootstrap(ctx context.Context, user db.User) (dashboardsvc.BootstrapResult, error)
}

type DashboardHandler struct {
	svc dashboardService
}

func NewDashboardHandler(svc dashboardService) *DashboardHandler {
	return &DashboardHandler{svc: svc}
}

func (h *DashboardHandler) GetBootstrap(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	result, err := h.svc.GetBootstrap(r.Context(), user)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, result)
}
