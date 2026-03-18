package api

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// GetProfile handles GET /api/user.
func (h *Handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, safeUser(userFromCtx(r.Context())))
}

// UpdateProfile handles PATCH /api/user.
func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name          *string `json:"name"`
		Role          *string `json:"role"`
		SleepBaseline *int16  `json:"sleep_baseline"`
		Timezone      *string `json:"timezone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user := userFromCtx(r.Context())
	params := db.UpdateUserProfileParams{ID: user.ID}
	if req.Name != nil {
		params.Name = pgtype.Text{String: *req.Name, Valid: true}
	}
	if req.Role != nil {
		params.Role = pgtype.Text{String: *req.Role, Valid: true}
	}
	if req.SleepBaseline != nil {
		params.SleepBaseline = pgtype.Int2{Int16: *req.SleepBaseline, Valid: true}
	}
	if req.Timezone != nil {
		params.Timezone = pgtype.Text{String: *req.Timezone, Valid: true}
	}

	updated, err := h.q.UpdateUserProfile(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}
	writeJSON(w, http.StatusOK, safeUser(updated))
}
