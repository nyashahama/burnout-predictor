package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

type recommendationStore interface {
	UpsertRecommendationFeedback(ctx context.Context, params db.UpsertRecommendationFeedbackParams) (db.RecommendationFeedback, error)
	ListRecentFeedback(ctx context.Context, params db.ListRecentFeedbackParams) ([]db.RecommendationFeedback, error)
}

type RecommendationHandler struct {
	store recommendationStore
}

func NewRecommendationHandler(store recommendationStore) *RecommendationHandler {
	return &RecommendationHandler{store: store}
}

func (h *RecommendationHandler) UpsertFeedback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := middleware.UserFromCtx(ctx)

	var req struct {
		RecommendedActionKey string `json:"recommended_action_key"`
		Helpful              bool   `json:"helpful"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RecommendedActionKey == "" {
		respond.Error(w, http.StatusBadRequest, "recommended_action_key is required")
		return
	}

	_, err := h.store.UpsertRecommendationFeedback(ctx, db.UpsertRecommendationFeedbackParams{
		UserID:               user.ID,
		RecommendedActionKey: req.RecommendedActionKey,
		Helpful:              req.Helpful,
	})
	if err != nil {
		respond.ServiceError(w, err)
		return
	}

	respond.JSON(w, http.StatusOK, map[string]interface{}{
		"recommended_action_key": req.RecommendedActionKey,
		"helpful":                req.Helpful,
	})
}

func (h *RecommendationHandler) GetTodayFeedback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := middleware.UserFromCtx(ctx)

	rows, err := h.store.ListRecentFeedback(ctx, db.ListRecentFeedbackParams{
		UserID: user.ID,
		N:      10,
	})
	if err != nil {
		respond.ServiceError(w, err)
		return
	}

	feedback := make([]map[string]interface{}, len(rows))
	for i, row := range rows {
		feedback[i] = map[string]interface{}{
			"recommended_action_key": row.RecommendedActionKey,
			"helpful":                row.Helpful,
		}
	}

	respond.JSON(w, http.StatusOK, map[string]interface{}{
		"feedback": feedback,
	})
}
