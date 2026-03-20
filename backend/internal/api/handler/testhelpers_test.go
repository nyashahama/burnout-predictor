package handler_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// jsonBody marshals v to JSON and returns it as an io.Reader for request bodies.
func jsonBody(t *testing.T, v any) io.Reader {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("jsonBody: %v", err)
	}
	return bytes.NewReader(b)
}

// withUser injects user into the request context, simulating the Auth middleware.
func withUser(r *http.Request, user db.User) *http.Request {
	return r.WithContext(middleware.SetUserInCtx(r.Context(), user))
}

// decodeJSON decodes the recorder body into v.
func decodeJSON(t *testing.T, w *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.NewDecoder(w.Body).Decode(v); err != nil {
		t.Fatalf("decodeJSON: %v", err)
	}
}
