package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
	authsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/auth"
)

type userService interface {
	GetProfile(ctx context.Context, user db.User) authsvc.UserResponse
	UpdateProfile(ctx context.Context, userID uuid.UUID, req authsvc.UpdateProfileRequest) (authsvc.UserResponse, error)
}

// UserHandler handles user profile endpoints.
type UserHandler struct {
	svc userService
}

func NewUserHandler(svc userService) *UserHandler {
	return &UserHandler{svc: svc}
}

func (h *UserHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	respond.JSON(w, http.StatusOK, h.svc.GetProfile(r.Context(), user))
}

func (h *UserHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	var req authsvc.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := h.svc.UpdateProfile(r.Context(), user.ID, req)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, result)
}
