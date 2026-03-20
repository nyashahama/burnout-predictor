package middleware

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"
)

// RequestID returns a middleware that reads X-Request-ID from the incoming request
// (or generates one if absent), stores it via reqid.Set, and echoes it in the response.
func RequestID() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get("X-Request-ID")
			if id == "" {
				id = uuid.New().String()
			}
			w.Header().Set("X-Request-ID", id)
			next.ServeHTTP(w, r.WithContext(reqid.Set(r.Context(), id)))
		})
	}
}
