package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/google/uuid"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/validate"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	checkinsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
)

type checkinService interface {
	Upsert(ctx context.Context, user db.User, req checkinsvc.UpsertRequest) (checkinsvc.UpsertResult, error)
	GetScoreCard(ctx context.Context, user db.User) (checkinsvc.ScoreCardResult, error)
	List(ctx context.Context, userID uuid.UUID, limit, offset int32) ([]db.CheckIn, error)
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
	if err := validate.NoteLength(req.Note); err != nil {
		respond.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validate.CheckinSignals(req.EnergyLevel, req.FocusQuality, req.HoursWorked, req.PhysicalSymptoms); err != nil {
		respond.Error(w, http.StatusBadRequest, err.Error())
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
	limit := int32(30)
	offset := int32(0)
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.ParseInt(l, 10, 32); err == nil {
			limit = int32(parsed)
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.ParseInt(o, 10, 32); err == nil {
			offset = int32(parsed)
		}
	}
	checkins, err := h.svc.List(r.Context(), user.ID, limit, offset)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, checkins)
}
