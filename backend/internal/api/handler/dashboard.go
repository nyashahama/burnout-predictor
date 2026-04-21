package handler

import (
	"context"
	"net/http"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	authsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/auth"
	checkinsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
	insightsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/insight"
)

type dashboardService interface {
	GetBootstrap(ctx context.Context, user db.User) (BootstrapResult, error)
}

type BootstrapResult struct {
	User         authsvc.UserResponse         `json:"user"`
	ScoreCard    checkinsvc.ScoreCardResult   `json:"score_card"`
	Checkins     []db.CheckIn                 `json:"checkins"`
	InsightBundle insightsvc.InsightBundle    `json:"insight_bundle"`
	FollowUp     *checkinsvc.FollowUpInfo     `json:"follow_up"`
}

type DashboardHandler struct{ svc dashboardService }

func NewDashboardHandler(svc dashboardService) *DashboardHandler { return &DashboardHandler{svc: svc} }

func (h *DashboardHandler) GetBootstrap(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	result, err := h.svc.GetBootstrap(r.Context(), user)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, result)
}