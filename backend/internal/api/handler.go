package api

import (
	"encoding/json"
	"net/http"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// Handler holds shared dependencies for all API handlers.
type Handler struct {
	q      *db.Queries
	secret []byte // HS256 JWT signing secret
}

// NewHandler constructs the main API handler.
func NewHandler(q *db.Queries, jwtSecret string) *Handler {
	return &Handler{q: q, secret: []byte(jwtSecret)}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
