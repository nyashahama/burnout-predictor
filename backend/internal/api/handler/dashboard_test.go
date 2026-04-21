package handler_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	authsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/auth"
	checkinsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
)

type stubDashboardService struct {
	getBootstrapFn func(context.Context, db.User) (handler.BootstrapResult, error)
}

func (s *stubDashboardService) GetBootstrap(ctx context.Context, user db.User) (handler.BootstrapResult, error) {
	if s.getBootstrapFn != nil {
		return s.getBootstrapFn(ctx, user)
	}
	return handler.BootstrapResult{}, nil
}

func TestDashboardBootstrap(t *testing.T) {
	svc := &stubDashboardService{
		getBootstrapFn: func(ctx context.Context, user db.User) (handler.BootstrapResult, error) {
			return handler.BootstrapResult{
				User: authsvc.UserResponse{Email: "user@example.com", Onboarded: true},
			}, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/dashboard/bootstrap", nil)
	req = req.WithContext(middleware.SetUserInCtx(req.Context(), db.User{ID: uuid.New()}))
	rec := httptest.NewRecorder()

	handler.NewDashboardHandler(svc).GetBootstrap(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestDashboardBootstrap_ServiceError(t *testing.T) {
	svc := &stubDashboardService{
		getBootstrapFn: func(ctx context.Context, user db.User) (handler.BootstrapResult, error) {
			return handler.BootstrapResult{}, checkinsvc.ErrInvalidStress
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/dashboard/bootstrap", nil)
	req = req.WithContext(middleware.SetUserInCtx(req.Context(), db.User{ID: uuid.New()}))
	rec := httptest.NewRecorder()

	handler.NewDashboardHandler(svc).GetBootstrap(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}