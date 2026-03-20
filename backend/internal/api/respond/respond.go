// Package respond provides helpers for writing consistent JSON responses.
package respond

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
)

// HTTPError is implemented by service sentinel errors to declare their own HTTP status.
// Services implement this on their error types; respond imports no service packages.
type HTTPError interface {
	error
	HTTPStatus() int
}

// JSON writes v as JSON with the given status code.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Default().Error("respond: encode failed", "err", err)
	}
}

// Error writes a JSON error body.
func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, map[string]string{"error": msg})
}

// ServiceError maps service errors to HTTP responses.
// Errors implementing HTTPError declare their own status code.
// All other errors return 500.
func ServiceError(w http.ResponseWriter, err error) {
	var he HTTPError
	if errors.As(err, &he) {
		Error(w, he.HTTPStatus(), he.Error())
		return
	}
	Error(w, http.StatusInternalServerError, "internal server error")
}
