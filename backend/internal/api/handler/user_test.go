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
	authsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/auth"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockUserService struct {
	GetProfileFn    func(context.Context, db.User) authsvc.UserResponse
	UpdateProfileFn func(context.Context, uuid.UUID, authsvc.UpdateProfileRequest) (authsvc.UserResponse, error)
}

func (m *mockUserService) GetProfile(ctx context.Context, user db.User) authsvc.UserResponse {
	if m.GetProfileFn != nil {
		return m.GetProfileFn(ctx, user)
	}
	return authsvc.UserResponse{}
}
func (m *mockUserService) UpdateProfile(ctx context.Context, userID uuid.UUID, req authsvc.UpdateProfileRequest) (authsvc.UserResponse, error) {
	if m.UpdateProfileFn != nil {
		return m.UpdateProfileFn(ctx, userID, req)
	}
	return authsvc.UserResponse{}, nil
}

// ── GetProfile ────────────────────────────────────────────────────────────────

func TestUserHandler_GetProfile_Success(t *testing.T) {
	h := handler.NewUserHandler(&mockUserService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.GetProfile(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── UpdateProfile ─────────────────────────────────────────────────────────────

func TestUserHandler_UpdateProfile_ValidationErrors(t *testing.T) {
	h := handler.NewUserHandler(&mockUserService{})
	tests := []struct {
		name string
		body string
	}{
		{"invalid_json", `{bad`},
		{"bad_role", `{"role":"ceo"}`},
		{"bad_sleep_baseline", `{"sleep_baseline":3}`},
		{"bad_timezone", `{"timezone":"NotReal/Zone"}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(tc.body))
			req = withUser(req, testUser)
			h.UpdateProfile(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("%s: got %d, want 400", tc.name, rec.Code)
			}
		})
	}
}

func TestUserHandler_UpdateProfile_ServiceError(t *testing.T) {
	h := handler.NewUserHandler(&mockUserService{
		UpdateProfileFn: func(_ context.Context, _ uuid.UUID, _ authsvc.UpdateProfileRequest) (authsvc.UserResponse, error) {
			return authsvc.UserResponse{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"name":"new name"}`))
	req = withUser(req, testUser)
	h.UpdateProfile(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestUserHandler_UpdateProfile_Success(t *testing.T) {
	h := handler.NewUserHandler(&mockUserService{
		UpdateProfileFn: func(_ context.Context, _ uuid.UUID, _ authsvc.UpdateProfileRequest) (authsvc.UserResponse, error) {
			return authsvc.UserResponse{}, nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"name":"updated"}`))
	req = withUser(req, testUser)
	h.UpdateProfile(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}
