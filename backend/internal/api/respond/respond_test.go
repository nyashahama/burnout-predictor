package respond_test

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
)

// testHTTPError implements respond.HTTPError without importing any service package.
type testHTTPError struct {
	msg    string
	status int
}

func (e testHTTPError) Error() string   { return e.msg }
func (e testHTTPError) HTTPStatus() int { return e.status }

func TestServiceError_KnownHTTPError(t *testing.T) {
	w := httptest.NewRecorder()
	respond.ServiceError(w, testHTTPError{"conflict", http.StatusConflict})
	if w.Code != http.StatusConflict {
		t.Errorf("expected 409, got %d", w.Code)
	}
}

func TestServiceError_WrappedHTTPError(t *testing.T) {
	w := httptest.NewRecorder()
	wrapped := fmt.Errorf("outer: %w", testHTTPError{"bad request", http.StatusBadRequest})
	respond.ServiceError(w, wrapped)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestServiceError_UnknownError_Returns500(t *testing.T) {
	w := httptest.NewRecorder()
	respond.ServiceError(w, errors.New("some unexpected internal error"))
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", w.Code)
	}
}
