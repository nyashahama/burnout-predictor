package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	eml "github.com/nyasha-hama/burnout-predictor-api/internal/email"
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

	// Seed default notification prefs so the user is opted in from day one.
	_, _ = h.q.CreateDefaultNotificationPrefs(r.Context(), user.ID)

	access, refresh, err := h.issueTokens(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to issue tokens")
		return
	}

	// Send welcome + verification emails asynchronously — don't block the response.
	if h.email != nil {
		go h.sendWelcomeEmail(user.Email, user.Name)
		go h.sendVerificationEmail(user.Email, user.Name, user.ID)
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

// VerifyEmail handles POST /api/auth/verify-email.
// Accepts a one-time token, marks it used, and sets email_verified = TRUE.
func (h *Handler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}

	hash := tokenHash(req.Token)
	ev, err := h.q.GetEmailVerification(r.Context(), hash)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid or expired token")
		return
	}

	if err := h.q.MarkEmailVerificationUsed(r.Context(), hash); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if err := h.q.VerifyUserEmail(r.Context(), ev.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "email verified"})
}

// ResendVerification handles POST /api/auth/resend-verification.
// Authenticated. Resends the verification email for unverified accounts.
func (h *Handler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r.Context())
	if user.EmailVerified {
		writeError(w, http.StatusBadRequest, "email is already verified")
		return
	}
	if h.email == nil {
		writeError(w, http.StatusServiceUnavailable, "email service unavailable")
		return
	}
	go h.sendVerificationEmail(user.Email, user.Name, user.ID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "verification email sent"})
}

// ForgotPassword handles POST /api/auth/forgot-password.
// Public. Sends a password reset email if the address exists.
// Always returns 200 to prevent email enumeration.
func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "if that address is registered you'll receive an email shortly"})

	// Do the DB lookup and email send asynchronously so timing doesn't leak existence.
	if h.email != nil {
		go func() {
			user, err := h.q.GetUserByEmail(context.Background(), req.Email)
			if err != nil {
				return // user not found — silently skip
			}
			h.sendPasswordResetEmail(user.Email, user.Name, user.ID)
		}()
	}
}

// ResetPassword handles POST /api/auth/reset-password.
// Public. Validates the token, updates the password, revokes all sessions.
func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Token == "" || len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "token and password (min 8 chars) are required")
		return
	}

	hash := tokenHash(req.Token)
	pr, err := h.q.GetPasswordReset(r.Context(), hash)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid or expired token")
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}

	if err := h.q.UpdateUserPassword(r.Context(), db.UpdateUserPasswordParams{
		ID:           pr.UserID,
		PasswordHash: pgtype.Text{String: string(newHash), Valid: true},
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	_ = h.q.MarkPasswordResetUsed(r.Context(), hash)
	_ = h.q.RevokeAllUserRefreshTokens(r.Context(), pr.UserID)

	writeJSON(w, http.StatusOK, map[string]string{"status": "password updated"})
}

// sendWelcomeEmail fires the welcome email. Called in a goroutine from Register.
func (h *Handler) sendWelcomeEmail(to, name string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	subject, html := eml.Welcome(name)
	if _, err := h.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html}); err != nil {
		log.Printf("api/auth: welcome email to %s: %v", to, err)
	}
}

// sendVerificationEmail creates a one-time token and sends the verify-email link.
func (h *Handler) sendVerificationEmail(to, name string, userID uuid.UUID) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		log.Printf("api/auth: gen verify token: %v", err)
		return
	}
	rawToken := fmt.Sprintf("%x", raw)
	hash := tokenHash(rawToken)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := h.q.CreateEmailVerification(ctx, db.CreateEmailVerificationParams{
		UserID:    userID,
		TokenHash: hash,
		Email:     to,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
	})
	if err != nil {
		log.Printf("api/auth: store verify token for %s: %v", to, err)
		return
	}

	verifyURL := h.appURL + "/verify-email?token=" + rawToken
	subject, html := eml.VerifyEmail(name, verifyURL)
	if _, err := h.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html}); err != nil {
		log.Printf("api/auth: verify email to %s: %v", to, err)
	}
}

// sendPasswordResetEmail creates a one-time token and sends the reset-password link.
func (h *Handler) sendPasswordResetEmail(to, name string, userID uuid.UUID) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		log.Printf("api/auth: gen reset token: %v", err)
		return
	}
	rawToken := fmt.Sprintf("%x", raw)
	hash := tokenHash(rawToken)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := h.q.CreatePasswordReset(ctx, db.CreatePasswordResetParams{
		UserID:    userID,
		TokenHash: hash,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true},
	})
	if err != nil {
		log.Printf("api/auth: store reset token for %s: %v", to, err)
		return
	}

	resetURL := h.appURL + "/reset-password?token=" + rawToken
	subject, html := eml.PasswordReset(name, resetURL)
	if _, err := h.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html}); err != nil {
		log.Printf("api/auth: reset email to %s: %v", to, err)
	}
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

// tokenHash returns the hex-encoded SHA-256 of a raw token string.
func tokenHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", sum)
}

// safeUserResp is the user shape sent to clients — no password hash, no tokens.
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
