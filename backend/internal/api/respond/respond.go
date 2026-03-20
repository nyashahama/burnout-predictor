// Package respond provides helpers for writing consistent JSON responses.
package respond

import (
	"encoding/json"
	"errors"
	"net/http"

	authsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/auth"
	checkinsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
	insightsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/insight"
)

// JSON writes v as JSON with the given status code.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// Error writes a JSON error body.
func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, map[string]string{"error": msg})
}

// ServiceError maps well-known service sentinel errors to HTTP status codes.
// Falls back to 500 for unrecognised errors.
func ServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, authsvc.ErrEmailInUse):
		Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, authsvc.ErrInvalidCredentials):
		Error(w, http.StatusUnauthorized, err.Error())
	case errors.Is(err, authsvc.ErrInvalidToken):
		Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, authsvc.ErrEmailAlreadyVerified):
		Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, authsvc.ErrEmailServiceDisabled):
		Error(w, http.StatusServiceUnavailable, err.Error())
	case errors.Is(err, checkinsvc.ErrInvalidStress):
		Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, insightsvc.ErrInvalidComponent):
		Error(w, http.StatusBadRequest, err.Error())
	default:
		Error(w, http.StatusInternalServerError, "internal server error")
	}
}
