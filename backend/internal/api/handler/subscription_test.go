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

type mockSubscriptionStore struct {
	GetActiveSubscriptionByUserIDFn func(context.Context, uuid.UUID) (db.Subscription, error)
}

func (m *mockSubscriptionStore) GetActiveSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (db.Subscription, error) {
	if m.GetActiveSubscriptionByUserIDFn != nil {
		return m.GetActiveSubscriptionByUserIDFn(ctx, userID)
	}
	return db.Subscription{}, nil
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestSubscriptionHandler_Get_NoSubscription_ReturnsNull(t *testing.T) {
	// Store error → 200 {"subscription": null}, not a 5xx.
	h := handler.NewSubscriptionHandler(&mockSubscriptionStore{
		GetActiveSubscriptionByUserIDFn: func(_ context.Context, _ uuid.UUID) (db.Subscription, error) {
			return db.Subscription{}, errors.New("no rows")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	var resp map[string]any
	decodeJSON(t, rec, &resp)
	if resp["subscription"] != nil {
		t.Errorf("expected subscription to be null, got %v", resp["subscription"])
	}
}

func TestSubscriptionHandler_Get_Success(t *testing.T) {
	h := handler.NewSubscriptionHandler(&mockSubscriptionStore{
		GetActiveSubscriptionByUserIDFn: func(_ context.Context, _ uuid.UUID) (db.Subscription, error) {
			return db.Subscription{PlanName: "pro", Status: "active"}, nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	var resp map[string]any
	decodeJSON(t, rec, &resp)
	if resp["subscription"] == nil {
		t.Error("expected subscription to be non-null")
	}
}
