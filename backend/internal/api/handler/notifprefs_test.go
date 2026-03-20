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
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockNotifPrefsStore struct {
	GetNotificationPrefsFn           func(context.Context, uuid.UUID) (db.UserNotificationPref, error)
	UpsertNotificationPrefsFn        func(context.Context, db.UpsertNotificationPrefsParams) (db.UserNotificationPref, error)
	CreateDefaultNotificationPrefsFn func(context.Context, uuid.UUID) (db.UserNotificationPref, error)
}

func (m *mockNotifPrefsStore) GetNotificationPrefs(ctx context.Context, userID uuid.UUID) (db.UserNotificationPref, error) {
	if m.GetNotificationPrefsFn != nil {
		return m.GetNotificationPrefsFn(ctx, userID)
	}
	return db.UserNotificationPref{}, nil
}
func (m *mockNotifPrefsStore) UpsertNotificationPrefs(ctx context.Context, params db.UpsertNotificationPrefsParams) (db.UserNotificationPref, error) {
	if m.UpsertNotificationPrefsFn != nil {
		return m.UpsertNotificationPrefsFn(ctx, params)
	}
	return db.UserNotificationPref{}, nil
}
func (m *mockNotifPrefsStore) CreateDefaultNotificationPrefs(ctx context.Context, userID uuid.UUID) (db.UserNotificationPref, error) {
	if m.CreateDefaultNotificationPrefsFn != nil {
		return m.CreateDefaultNotificationPrefsFn(ctx, userID)
	}
	return db.UserNotificationPref{}, nil
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestNotifPrefsHandler_Get_NoPrefs_CreatesDefaults(t *testing.T) {
	// GetNotificationPrefs error → CreateDefaultNotificationPrefs called → 200.
	defaultsCalled := false
	h := handler.NewNotifPrefsHandler(&mockNotifPrefsStore{
		GetNotificationPrefsFn: func(_ context.Context, _ uuid.UUID) (db.UserNotificationPref, error) {
			return db.UserNotificationPref{}, errors.New("no rows")
		},
		CreateDefaultNotificationPrefsFn: func(_ context.Context, _ uuid.UUID) (db.UserNotificationPref, error) {
			defaultsCalled = true
			return db.UserNotificationPref{}, nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	if !defaultsCalled {
		t.Error("expected CreateDefaultNotificationPrefs to be called")
	}
}

func TestNotifPrefsHandler_Get_Success(t *testing.T) {
	// Prefs exist — CreateDefaultNotificationPrefs is never reached.
	h := handler.NewNotifPrefsHandler(&mockNotifPrefsStore{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── Update ────────────────────────────────────────────────────────────────────

func TestNotifPrefsHandler_Update_ValidationErrors(t *testing.T) {
	h := handler.NewNotifPrefsHandler(&mockNotifPrefsStore{})
	tests := []struct{ name, body string }{
		{"invalid_json", `{bad`},
		{"bad_reminder_time", `{"reminder_time":"25:00"}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(tc.body))
			req = withUser(req, testUser)
			h.Update(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("got %d, want 400", rec.Code)
			}
		})
	}
}

func TestNotifPrefsHandler_Update_StoreError(t *testing.T) {
	// respond.Error directly — hardcoded 500.
	h := handler.NewNotifPrefsHandler(&mockNotifPrefsStore{
		UpsertNotificationPrefsFn: func(_ context.Context, _ db.UpsertNotificationPrefsParams) (db.UserNotificationPref, error) {
			return db.UserNotificationPref{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"checkin_reminder":true}`))
	req = withUser(req, testUser)
	h.Update(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestNotifPrefsHandler_Update_Success(t *testing.T) {
	h := handler.NewNotifPrefsHandler(&mockNotifPrefsStore{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"checkin_reminder":true,"reminder_time":"09:00"}`))
	req = withUser(req, testUser)
	h.Update(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}
