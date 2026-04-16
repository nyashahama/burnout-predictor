package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	insightsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/insight"
)

type recommendationService interface {
	CommitCurrentRecommendation(ctx context.Context, user db.User) (*insightsvc.RecommendationCommitment, error)
	CompleteCommitment(ctx context.Context, userID uuid.UUID, commitmentID uuid.UUID) (*insightsvc.RecommendationCommitment, error)
	SkipCommitment(ctx context.Context, userID uuid.UUID, commitmentID uuid.UUID) (*insightsvc.RecommendationCommitment, error)
	RecordOutcome(ctx context.Context, userID uuid.UUID, commitmentID uuid.UUID, helpfulness insightsvc.OutcomeHelpfulness) (*insightsvc.RecommendationCommitment, error)
}

type recommendationStore interface {
	UpsertRecommendationFeedback(ctx context.Context, params db.UpsertRecommendationFeedbackParams) (db.RecommendationFeedback, error)
	ListRecentFeedback(ctx context.Context, params db.ListRecentFeedbackParams) ([]db.RecommendationFeedback, error)
}

type RecommendationHandler struct {
	svc   recommendationService
	store recommendationStore
}

func NewRecommendationHandlerFromService(svc recommendationService) *RecommendationHandler {
	return &RecommendationHandler{svc: svc, store: nil}
}

func NewRecommendationHandler(store recommendationStore) *RecommendationHandler {
	return &RecommendationHandler{svc: nil, store: store}
}

func NewRecommendationHandlerBoth(svc recommendationService, store recommendationStore) *RecommendationHandler {
	return &RecommendationHandler{svc: svc, store: store}
}

func (h *RecommendationHandler) Commit(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		respond.Error(w, http.StatusNotImplemented, "commit not available")
		return
	}
	user := middleware.UserFromCtx(r.Context())
	commitment, err := h.svc.CommitCurrentRecommendation(r.Context(), user)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusCreated, commitment)
}

func (h *RecommendationHandler) Complete(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		respond.Error(w, http.StatusNotImplemented, "complete not available")
		return
	}
	user := middleware.UserFromCtx(r.Context())
	commitmentID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid recommendation commitment id")
		return
	}
	commitment, err := h.svc.CompleteCommitment(r.Context(), user.ID, commitmentID)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, commitment)
}

func (h *RecommendationHandler) Skip(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		respond.Error(w, http.StatusNotImplemented, "skip not available")
		return
	}
	user := middleware.UserFromCtx(r.Context())
	commitmentID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid recommendation commitment id")
		return
	}
	commitment, err := h.svc.SkipCommitment(r.Context(), user.ID, commitmentID)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, commitment)
}

func (h *RecommendationHandler) RecordOutcome(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		respond.Error(w, http.StatusNotImplemented, "record outcome not available")
		return
	}
	user := middleware.UserFromCtx(r.Context())
	commitmentID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid recommendation commitment id")
		return
	}
	var body struct {
		Helpfulness insightsvc.OutcomeHelpfulness `json:"helpfulness"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	commitment, err := h.svc.RecordOutcome(r.Context(), user.ID, commitmentID, body.Helpfulness)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, commitment)
}

func (h *RecommendationHandler) UpsertFeedback(w http.ResponseWriter, r *http.Request) {
	if h.store == nil {
		respond.Error(w, http.StatusNotImplemented, "feedback not available")
		return
	}
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
	if h.store == nil {
		respond.Error(w, http.StatusNotImplemented, "feedback not available")
		return
	}
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
