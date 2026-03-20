package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"
)

func TestRequestID_GeneratesIDWhenAbsent(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()

	var capturedID string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedID = reqid.FromCtx(r.Context())
	})

	middleware.RequestID()(next).ServeHTTP(w, req)

	if capturedID == "" {
		t.Error("expected request ID to be set in context")
	}
	if w.Header().Get("X-Request-ID") == "" {
		t.Error("expected X-Request-ID response header to be set")
	}
	if w.Header().Get("X-Request-ID") != capturedID {
		t.Errorf("header %q != context value %q", w.Header().Get("X-Request-ID"), capturedID)
	}
}

func TestRequestID_PropagatesIncomingID(t *testing.T) {
	existing := "upstream-trace-abc123"
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Request-ID", existing)
	w := httptest.NewRecorder()

	var capturedID string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedID = reqid.FromCtx(r.Context())
	})

	middleware.RequestID()(next).ServeHTTP(w, req)

	if capturedID != existing {
		t.Errorf("expected %q, got %q", existing, capturedID)
	}
	if w.Header().Get("X-Request-ID") != existing {
		t.Errorf("expected response header %q, got %q", existing, w.Header().Get("X-Request-ID"))
	}
}
