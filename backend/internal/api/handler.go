package api

import (
	"encoding/json"
	"net/http"

	"github.com/nyasha-hama/burnout-predictor-api/internal/ai"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/email"
)

// Handler holds shared dependencies for all API handlers.
type Handler struct {
	q             *db.Queries
	secret        []byte        // HS256 JWT signing secret
	email         *email.Client // nil = email sending disabled
	ai            *ai.Client    // nil = AI recovery plans disabled
	paddleSecret  []byte        // Paddle webhook HMAC-SHA256 secret; nil = signature check skipped
	appURL        string        // Base URL for email links (e.g. https://overload.app)
}

// NewHandler constructs the main API handler.
func NewHandler(q *db.Queries, jwtSecret string, emailClient *email.Client, aiClient *ai.Client, paddleSecret, appURL string) *Handler {
	return &Handler{
		q:            q,
		secret:       []byte(jwtSecret),
		email:        emailClient,
		ai:           aiClient,
		paddleSecret: []byte(paddleSecret),
		appURL:       appURL,
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
