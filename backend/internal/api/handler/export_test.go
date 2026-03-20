package handler_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockExportStore struct {
	ExportUserCheckInsFn func(context.Context, uuid.UUID) ([]db.ExportUserCheckInsRow, error)
}

func (m *mockExportStore) ExportUserCheckIns(ctx context.Context, userID uuid.UUID) ([]db.ExportUserCheckInsRow, error) {
	if m.ExportUserCheckInsFn != nil {
		return m.ExportUserCheckInsFn(ctx, userID)
	}
	return nil, nil
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestExportHandler_Get_StoreError(t *testing.T) {
	// respond.Error directly — hardcoded 500.
	h := handler.NewExportHandler(&mockExportStore{
		ExportUserCheckInsFn: func(_ context.Context, _ uuid.UUID) ([]db.ExportUserCheckInsRow, error) {
			return nil, errors.New("db error")
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

func TestExportHandler_Get_Success(t *testing.T) {
	h := handler.NewExportHandler(&mockExportStore{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	cd := rec.Header().Get("Content-Disposition")
	if cd == "" {
		t.Error("expected Content-Disposition header to be set")
	}
}
