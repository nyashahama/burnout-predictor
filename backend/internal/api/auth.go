package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// Register handles POST /api/auth/register.
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email         string `json:"email"`
		Password      string `json:"password"`
		Name          string `json:"name"`
		Role          string `json:"role"`
		SleepBaseline int16  `json:"sleep_baseline"`
		Timezone      string `json:"timezone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" || req.Name == "" {
		writeError(w, http.StatusBadRequest, "email, password, and name are required")
		return
	}
	if req.Role == "" {
		req.Role = "other"
	}
	if req.SleepBaseline == 0 {
		req.SleepBaseline = 8
	}
	if req.Timezone == "" {
		req.Timezone = "UTC"
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}

	user, err := h.q.CreateUser(r.Context(), db.CreateUserParams{
		Email:         req.Email,
		PasswordHash:  pgtype.Text{String: string(hash), Valid: true},
		Name:          req.Name,
		Role:          req.Role,
		SleepBaseline: req.SleepBaseline,
		Timezone:      req.Timezone,
	})
	if err != nil {
		writeError(w, http.StatusConflict, "email already in use")
		return
	}

	access, refresh, err := h.issueTokens(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to issue tokens")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"access_token":  access,
		"refresh_token": refresh,
		"user":          safeUser(user),
	})
}

// Login handles POST /api/auth/login.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := h.q.GetUserByEmail(r.Context(), req.Email)
	if err != nil || !user.PasswordHash.Valid {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash.String), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	access, refresh, err := h.issueTokens(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to issue tokens")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"access_token":  access,
		"refresh_token": refresh,
		"user":          safeUser(user),
	})
}

// RefreshToken handles POST /api/auth/refresh — rotates the refresh token.
func (h *Handler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	hash := tokenHash(req.RefreshToken)
	rt, err := h.q.GetRefreshToken(r.Context(), hash)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}

	// Rotate: revoke old token before issuing new ones.
	if err := h.q.RevokeRefreshToken(r.Context(), hash); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}

	user, err := h.q.GetUserByID(r.Context(), rt.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "user not found")
		return
	}

	access, refresh, err := h.issueTokens(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to issue tokens")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"access_token":  access,
		"refresh_token": refresh,
	})
}

// Logout handles POST /api/auth/logout — revokes all refresh tokens for the user.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r.Context())
	_ = h.q.RevokeAllUserRefreshTokens(r.Context(), user.ID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// issueTokens creates a signed JWT access token (15 min) and a stored refresh token (7 days).
func (h *Handler) issueTokens(ctx context.Context, userID uuid.UUID) (accessToken, refreshToken string, err error) {
	claims := jwt.RegisteredClaims{
		Subject:   userID.String(),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	accessToken, err = tok.SignedString(h.secret)
	if err != nil {
		return
	}

	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return
	}
	refreshToken = fmt.Sprintf("%x", raw)
	hash := tokenHash(refreshToken)

	_, err = h.q.CreateRefreshToken(ctx, db.CreateRefreshTokenParams{
		UserID:    userID,
		TokenHash: hash,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(7 * 24 * time.Hour), Valid: true},
	})
	return
}

// tokenHash returns the hex-encoded SHA-256 of a token string.
func tokenHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", sum)
}

// safeUserResp is the user shape returned to clients (no password hash, no tokens).
type safeUserResp struct {
	ID            uuid.UUID `json:"id"`
	Email         string    `json:"email"`
	Name          string    `json:"name"`
	Role          string    `json:"role"`
	SleepBaseline int16     `json:"sleep_baseline"`
	Timezone      string    `json:"timezone"`
	EmailVerified bool      `json:"email_verified"`
}

func safeUser(u db.User) safeUserResp {
	return safeUserResp{
		ID:            u.ID,
		Email:         u.Email,
		Name:          u.Name,
		Role:          u.Role,
		SleepBaseline: u.SleepBaseline,
		Timezone:      u.Timezone,
		EmailVerified: u.EmailVerified,
	}
}
