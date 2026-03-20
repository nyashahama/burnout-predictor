package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
	checkinsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
)

type checkinService interface {
	Upsert(ctx context.Context, user db.User, req checkinsvc.UpsertRequest) (checkinsvc.UpsertResult, error)
	GetScoreCard(ctx context.Context, user db.User) (checkinsvc.ScoreCardResult, error)
	List(ctx context.Context, userID uuid.UUID) ([]db.CheckIn, error)
}

// CheckinHandler handles check-in endpoints.
type CheckinHandler struct {
	svc checkinService
}

func NewCheckinHandler(svc checkinService) *CheckinHandler {
	return &CheckinHandler{svc: svc}
}

func (h *CheckinHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	var req checkinsvc.UpsertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := h.svc.Upsert(r.Context(), user, req)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, result)
}

func (h *CheckinHandler) GetScoreCard(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	result, err := h.svc.GetScoreCard(r.Context(), user)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, result)
}

func (h *CheckinHandler) List(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	checkins, err := h.svc.List(r.Context(), user.ID)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, checkins)
}
