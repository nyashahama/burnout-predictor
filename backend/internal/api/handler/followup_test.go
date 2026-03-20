package handler_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	chi "github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockFollowUpStore struct {
	GetTodayFollowUpFn     func(context.Context, db.GetTodayFollowUpParams) (db.FollowUp, error)
	MarkFollowUpSurfacedFn func(context.Context, db.MarkFollowUpSurfacedParams) error
	DismissFollowUpFn      func(context.Context, db.DismissFollowUpParams) error
}

func (m *mockFollowUpStore) GetTodayFollowUp(ctx context.Context, params db.GetTodayFollowUpParams) (db.FollowUp, error) {
	if m.GetTodayFollowUpFn != nil {
		return m.GetTodayFollowUpFn(ctx, params)
	}
	return db.FollowUp{}, nil
}
func (m *mockFollowUpStore) MarkFollowUpSurfaced(ctx context.Context, params db.MarkFollowUpSurfacedParams) error {
	if m.MarkFollowUpSurfacedFn != nil {
		return m.MarkFollowUpSurfacedFn(ctx, params)
	}
	return nil
}
func (m *mockFollowUpStore) DismissFollowUp(ctx context.Context, params db.DismissFollowUpParams) error {
	if m.DismissFollowUpFn != nil {
		return m.DismissFollowUpFn(ctx, params)
	}
	return nil
}

// ── GetToday ──────────────────────────────────────────────────────────────────

func TestFollowUpHandler_GetToday_StoreError_ReturnsNull(t *testing.T) {
	// Any store error → 200 {"follow_up": null}, not a 5xx.
	h := handler.NewFollowUpHandler(&mockFollowUpStore{
		GetTodayFollowUpFn: func(_ context.Context, _ db.GetTodayFollowUpParams) (db.FollowUp, error) {
			return db.FollowUp{}, errors.New("no rows")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.GetToday(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	var resp map[string]any
	decodeJSON(t, rec, &resp)
	if _, ok := resp["follow_up"]; !ok {
		t.Error("response missing follow_up key")
	}
	if resp["follow_up"] != nil {
		t.Errorf("expected follow_up to be null, got %v", resp["follow_up"])
	}
}

func TestFollowUpHandler_GetToday_Success_Unsurfaced_CallsMarkSurfaced(t *testing.T) {
	// follow_up with SurfacedAt.Valid = false → MarkFollowUpSurfaced must be called.
	surfacedCalled := false
	fu := db.FollowUp{
		ID:         uuid.New(),
		UserID:     testUser.ID,
		SurfacedAt: pgtype.Timestamptz{Valid: false},
	}
	h := handler.NewFollowUpHandler(&mockFollowUpStore{
		GetTodayFollowUpFn: func(_ context.Context, _ db.GetTodayFollowUpParams) (db.FollowUp, error) {
			return fu, nil
		},
		MarkFollowUpSurfacedFn: func(_ context.Context, _ db.MarkFollowUpSurfacedParams) error {
			surfacedCalled = true
			return nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.GetToday(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	if !surfacedCalled {
		t.Error("expected MarkFollowUpSurfaced to be called for unsurfaced follow-up")
	}
}

func TestFollowUpHandler_GetToday_Success_AlreadySurfaced_NoMarkCall(t *testing.T) {
	// follow_up with SurfacedAt.Valid = true → MarkFollowUpSurfaced must NOT be called.
	surfacedCalled := false
	fu := db.FollowUp{
		ID:         uuid.New(),
		UserID:     testUser.ID,
		SurfacedAt: pgtype.Timestamptz{Valid: true},
	}
	h := handler.NewFollowUpHandler(&mockFollowUpStore{
		GetTodayFollowUpFn: func(_ context.Context, _ db.GetTodayFollowUpParams) (db.FollowUp, error) {
			return fu, nil
		},
		MarkFollowUpSurfacedFn: func(_ context.Context, _ db.MarkFollowUpSurfacedParams) error {
			surfacedCalled = true
			return nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.GetToday(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	if surfacedCalled {
		t.Error("expected MarkFollowUpSurfaced NOT to be called for already-surfaced follow-up")
	}
}

// ── Dismiss ───────────────────────────────────────────────────────────────────

// dismissRequest routes through chi so the {id} URL param is populated.
func dismissRequest(t *testing.T, h *handler.FollowUpHandler, id string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	r.Delete("/followup/{id}", h.Dismiss)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/followup/"+id, nil)
	req = withUser(req, testUser)
	r.ServeHTTP(rec, req)
	return rec
}

func TestFollowUpHandler_Dismiss_MalformedUUID(t *testing.T) {
	h := handler.NewFollowUpHandler(&mockFollowUpStore{})
	rec := dismissRequest(t, h, "not-a-uuid")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestFollowUpHandler_Dismiss_StoreError(t *testing.T) {
	// respond.Error directly — hardcoded 500; any error value suffices.
	h := handler.NewFollowUpHandler(&mockFollowUpStore{
		DismissFollowUpFn: func(_ context.Context, _ db.DismissFollowUpParams) error {
			return errors.New("db error")
		},
	})
	rec := dismissRequest(t, h, uuid.New().String())
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestFollowUpHandler_Dismiss_Success(t *testing.T) {
	h := handler.NewFollowUpHandler(&mockFollowUpStore{})
	rec := dismissRequest(t, h, uuid.New().String())
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}
