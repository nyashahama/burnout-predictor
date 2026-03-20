package handler_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	insightsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/insight"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockInsightService struct {
	GetFn              func(context.Context, db.User) (insightsvc.InsightBundle, error)
	DismissComponentFn func(context.Context, uuid.UUID, insightsvc.DismissRequest) error
}

func (m *mockInsightService) Get(ctx context.Context, user db.User) (insightsvc.InsightBundle, error) {
	if m.GetFn != nil {
		return m.GetFn(ctx, user)
	}
	return insightsvc.InsightBundle{}, nil
}
func (m *mockInsightService) DismissComponent(ctx context.Context, userID uuid.UUID, req insightsvc.DismissRequest) error {
	if m.DismissComponentFn != nil {
		return m.DismissComponentFn(ctx, userID, req)
	}
	return nil
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestInsightHandler_Get_ServiceError(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{
		GetFn: func(_ context.Context, _ db.User) (insightsvc.InsightBundle, error) {
			return insightsvc.InsightBundle{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestInsightHandler_Get_Success(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── DismissComponent ──────────────────────────────────────────────────────────

func TestInsightHandler_DismissComponent_InvalidJSON(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{bad`))
	req = withUser(req, testUser)
	h.DismissComponent(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestInsightHandler_DismissComponent_InvalidComponent(t *testing.T) {
	// Must use the real sentinel so respond.ServiceError routes to 400 via HTTPStatus().
	h := handler.NewInsightHandler(&mockInsightService{
		DismissComponentFn: func(_ context.Context, _ uuid.UUID, _ insightsvc.DismissRequest) error {
			return insightsvc.ErrInvalidComponent
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"component_key":""}`))
	req = withUser(req, testUser)
	h.DismissComponent(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestInsightHandler_DismissComponent_ServiceError(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{
		DismissComponentFn: func(_ context.Context, _ uuid.UUID, _ insightsvc.DismissRequest) error {
			return errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"component_key":"momentum"}`))
	req = withUser(req, testUser)
	h.DismissComponent(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestInsightHandler_DismissComponent_Success(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"component_key":"momentum"}`))
	req = withUser(req, testUser)
	h.DismissComponent(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}
