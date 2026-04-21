package handler_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	authsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/auth"
	dashboardsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/dashboard"
)

type stubDashboardService struct {
	getBootstrapFn func(context.Context, db.User) (dashboardsvc.BootstrapResult, error)
}

func (s *stubDashboardService) GetBootstrap(ctx context.Context, user db.User) (dashboardsvc.BootstrapResult, error) {
	return s.getBootstrapFn(ctx, user)
}

func TestDashboardBootstrap(t *testing.T) {
	svc := &stubDashboardService{
		getBootstrapFn: func(ctx context.Context, user db.User) (dashboardsvc.BootstrapResult, error) {
			return dashboardsvc.BootstrapResult{
				User: authsvc.UserResponse{
					ID:        user.ID,
					Email:     "user@example.com",
					Onboarded: true,
				},
			}, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/dashboard/bootstrap", nil)
	req = withUser(req, db.User{ID: uuid.New()})
	rec := httptest.NewRecorder()

	handler.NewDashboardHandler(svc).GetBootstrap(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}
