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
	checkinsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockCheckinService struct {
	UpsertFn       func(context.Context, db.User, checkinsvc.UpsertRequest) (checkinsvc.UpsertResult, error)
	GetScoreCardFn func(context.Context, db.User) (checkinsvc.ScoreCardResult, error)
	ListFn         func(context.Context, uuid.UUID) ([]db.CheckIn, error)
}

func (m *mockCheckinService) Upsert(ctx context.Context, user db.User, req checkinsvc.UpsertRequest) (checkinsvc.UpsertResult, error) {
	if m.UpsertFn != nil {
		return m.UpsertFn(ctx, user, req)
	}
	return checkinsvc.UpsertResult{}, nil
}
func (m *mockCheckinService) GetScoreCard(ctx context.Context, user db.User) (checkinsvc.ScoreCardResult, error) {
	if m.GetScoreCardFn != nil {
		return m.GetScoreCardFn(ctx, user)
	}
	return checkinsvc.ScoreCardResult{}, nil
}
func (m *mockCheckinService) List(ctx context.Context, userID uuid.UUID) ([]db.CheckIn, error) {
	if m.ListFn != nil {
		return m.ListFn(ctx, userID)
	}
	return nil, nil
}

// ── Upsert ────────────────────────────────────────────────────────────────────

func TestCheckinHandler_Upsert_ValidationErrors(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{})
	// note of 281 runes (exceeds 280 limit)
	longNote := strings.Repeat("a", 281)
	tests := []struct{ name, body string }{
		{"invalid_json", `{bad`},
		{"note_too_long", `{"stress":3,"note":"` + longNote + `"}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			req = withUser(req, testUser)
			h.Upsert(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("got %d, want 400", rec.Code)
			}
		})
	}
}

func TestCheckinHandler_Upsert_InvalidStress(t *testing.T) {
	// Must use the real sentinel so respond.ServiceError routes to 400 via HTTPStatus().
	h := handler.NewCheckinHandler(&mockCheckinService{
		UpsertFn: func(_ context.Context, _ db.User, _ checkinsvc.UpsertRequest) (checkinsvc.UpsertResult, error) {
			return checkinsvc.UpsertResult{}, checkinsvc.ErrInvalidStress
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"stress":9}`))
	req = withUser(req, testUser)
	h.Upsert(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestCheckinHandler_Upsert_ServiceError(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{
		UpsertFn: func(_ context.Context, _ db.User, _ checkinsvc.UpsertRequest) (checkinsvc.UpsertResult, error) {
			return checkinsvc.UpsertResult{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"stress":3}`))
	req = withUser(req, testUser)
	h.Upsert(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestCheckinHandler_Upsert_Success(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{
		UpsertFn: func(_ context.Context, _ db.User, _ checkinsvc.UpsertRequest) (checkinsvc.UpsertResult, error) {
			return checkinsvc.UpsertResult{}, nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"stress":3}`))
	req = withUser(req, testUser)
	h.Upsert(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── GetScoreCard ──────────────────────────────────────────────────────────────

func TestCheckinHandler_GetScoreCard_ServiceError(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{
		GetScoreCardFn: func(_ context.Context, _ db.User) (checkinsvc.ScoreCardResult, error) {
			return checkinsvc.ScoreCardResult{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.GetScoreCard(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestCheckinHandler_GetScoreCard_Success(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.GetScoreCard(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── List ──────────────────────────────────────────────────────────────────────

func TestCheckinHandler_List_ServiceError(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{
		ListFn: func(_ context.Context, _ uuid.UUID) ([]db.CheckIn, error) {
			return nil, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.List(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestCheckinHandler_List_Success(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.List(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}
