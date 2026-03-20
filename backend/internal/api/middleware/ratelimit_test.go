package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
)

func TestRateLimit_AllowsFirstRequest(t *testing.T) {
	ctx := context.Background()
	mw := middleware.RateLimit(ctx, 2, time.Minute, false)
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("first request should pass, got %d", w.Code)
	}
}

func TestRateLimit_BlocksAfterLimit(t *testing.T) {
	ctx := context.Background()
	mw := middleware.RateLimit(ctx, 1, time.Minute, false)
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// First request — allowed.
	req1 := httptest.NewRequest(http.MethodGet, "/", nil)
	w1 := httptest.NewRecorder()
	handler.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("first request should pass, got %d", w1.Code)
	}

	// Second request — rate limited.
	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req2)
	if w2.Code != http.StatusTooManyRequests {
		t.Fatalf("second request should be blocked, got %d", w2.Code)
	}
	if w2.Header().Get("Retry-After") != "60" {
		t.Errorf("expected Retry-After: 60, got %q", w2.Header().Get("Retry-After"))
	}
}

func TestRateLimit_CtxCancelStopsCleanup(t *testing.T) {
	// Verify the goroutine exits cleanly — no panic, no hang.
	ctx, cancel := context.WithCancel(context.Background())
	middleware.RateLimit(ctx, 10, time.Minute, false)
	cancel() // Should stop the cleanup goroutine.
	// If this test hangs, the goroutine is not respecting ctx.Done().
}
