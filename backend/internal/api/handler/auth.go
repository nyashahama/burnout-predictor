// Package handler contains thin HTTP handlers that delegate to service packages.
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

type authService interface {
	Register(ctx context.Context, req authsvc.RegisterRequest) (authsvc.RegisterResult, error)
	Login(ctx context.Context, req authsvc.LoginRequest) (authsvc.LoginResult, error)
	Refresh(ctx context.Context, req authsvc.RefreshRequest) (authsvc.RefreshResult, error)
	Logout(ctx context.Context, userID uuid.UUID) error
	VerifyEmail(ctx context.Context, req authsvc.VerifyEmailRequest) error
	ResendVerification(ctx context.Context, user db.User) error
	ForgotPassword(ctx context.Context, req authsvc.ForgotPasswordRequest) error
	ResetPassword(ctx context.Context, req authsvc.ResetPasswordRequest) error
}

// AuthHandler handles all auth endpoints.
type AuthHandler struct {
	svc authService
}

func NewAuthHandler(svc authService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req authsvc.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := h.svc.Register(r.Context(), req)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusCreated, result)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req authsvc.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := h.svc.Login(r.Context(), req)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, result)
}

func (h *AuthHandler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	var req authsvc.RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
		respond.Error(w, http.StatusBadRequest, "refresh_token is required")
		return
	}
	result, err := h.svc.Refresh(r.Context(), req)
	if err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, result)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	_ = h.svc.Logout(r.Context(), user.ID)
	respond.JSON(w, http.StatusOK, map[string]string{"status": "logged out"})
}

func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req authsvc.VerifyEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		respond.Error(w, http.StatusBadRequest, "token is required")
		return
	}
	if err := h.svc.VerifyEmail(r.Context(), req); err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "verified"})
}

func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	if err := h.svc.ResendVerification(r.Context(), user); err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req authsvc.ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		respond.Error(w, http.StatusBadRequest, "email is required")
		return
	}
	_ = h.svc.ForgotPassword(r.Context(), req)
	respond.JSON(w, http.StatusOK, map[string]string{"status": "if that email exists, a reset link has been sent"})
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req authsvc.ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" || req.Password == "" {
		respond.Error(w, http.StatusBadRequest, "token and password are required")
		return
	}
	if err := h.svc.ResetPassword(r.Context(), req); err != nil {
		respond.ServiceError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "password reset"})
}
