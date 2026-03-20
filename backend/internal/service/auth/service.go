package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"log/slog"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	eml "github.com/nyasha-hama/burnout-predictor-api/internal/email"
	"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"
)

// authStore is the data-access contract for the auth service.
// store.Postgres satisfies this implicitly.
type authStore interface {
	CreateUser(ctx context.Context, params db.CreateUserParams) (db.User, error)
	GetUserByEmail(ctx context.Context, email string) (db.User, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error)
	UpdateUserProfile(ctx context.Context, params db.UpdateUserProfileParams) (db.User, error)
	UpdateUserPassword(ctx context.Context, params db.UpdateUserPasswordParams) error
	UpdateUserEmail(ctx context.Context, params db.UpdateUserEmailParams) (db.User, error)
	SetEstimatedScore(ctx context.Context, params db.SetEstimatedScoreParams) error
	SoftDeleteUser(ctx context.Context, id uuid.UUID) error
	VerifyUserEmail(ctx context.Context, id uuid.UUID) error
	CreateRefreshToken(ctx context.Context, params db.CreateRefreshTokenParams) (db.RefreshToken, error)
	GetRefreshToken(ctx context.Context, tokenHash string) (db.RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, tokenHash string) error
	RevokeAllUserRefreshTokens(ctx context.Context, userID uuid.UUID) error
	CreateEmailVerification(ctx context.Context, params db.CreateEmailVerificationParams) (db.EmailVerification, error)
	GetEmailVerification(ctx context.Context, tokenHash string) (db.EmailVerification, error)
	MarkEmailVerificationUsed(ctx context.Context, tokenHash string) error
	CreatePasswordReset(ctx context.Context, params db.CreatePasswordResetParams) (db.PasswordReset, error)
	GetPasswordReset(ctx context.Context, tokenHash string) (db.PasswordReset, error)
	MarkPasswordResetUsed(ctx context.Context, tokenHash string) error
	CreateDefaultNotificationPrefs(ctx context.Context, userID uuid.UUID) (db.UserNotificationPref, error)
}

// Service owns all auth and user-profile business logic.
type Service struct {
	store  authStore
	secret []byte
	email  *eml.Client // nil = email disabled
	appURL string
	log    *slog.Logger
}

func New(store authStore, secret []byte, emailClient *eml.Client, appURL string, log *slog.Logger) *Service {
	return &Service{store: store, secret: secret, email: emailClient, appURL: appURL, log: log}
}

// ── Request / Response types ──────────────────────────────────────────────────

type RegisterRequest struct {
	Email         string `json:"email"`
	Password      string `json:"password"`
	Name          string `json:"name"`
	Role          string `json:"role"`
	SleepBaseline int16  `json:"sleep_baseline"`
	Timezone      string `json:"timezone"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type VerifyEmailRequest struct {
	Token string `json:"token"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

type ResetPasswordRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

type UpdateProfileRequest struct {
	Name           *string `json:"name"`
	Role           *string `json:"role"`
	SleepBaseline  *int16  `json:"sleep_baseline"`
	Timezone       *string `json:"timezone"`
	EstimatedScore *int16  `json:"estimated_score"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type ChangeEmailRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// UserResponse is the safe user shape sent to clients — no password hash.
type UserResponse struct {
	ID                uuid.UUID `json:"id"`
	Email             string    `json:"email"`
	Name              string    `json:"name"`
	Role              string    `json:"role"`
	SleepBaseline     int16     `json:"sleep_baseline"`
	Timezone          string    `json:"timezone"`
	EmailVerified     bool      `json:"email_verified"`
	Tier              string    `json:"tier"`
	CalendarConnected bool      `json:"calendar_connected"`
}

// RegisterResult is returned by Register and Login.
type RegisterResult struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	User         UserResponse `json:"user"`
}

// LoginResult is an alias for RegisterResult (same JSON shape).
type LoginResult = RegisterResult

// RefreshResult is returned by Refresh.
type RefreshResult struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// ── Public methods ────────────────────────────────────────────────────────────

func (s *Service) Register(ctx context.Context, req RegisterRequest) (RegisterResult, error) {
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
		return RegisterResult{}, fmt.Errorf("hash password: %w", err)
	}

	user, err := s.store.CreateUser(ctx, db.CreateUserParams{
		Email:         req.Email,
		PasswordHash:  pgtype.Text{String: string(hash), Valid: true},
		Name:          req.Name,
		Role:          req.Role,
		SleepBaseline: req.SleepBaseline,
		Timezone:      req.Timezone,
	})
	if err != nil {
		return RegisterResult{}, ErrEmailInUse
	}

	_, _ = s.store.CreateDefaultNotificationPrefs(ctx, user.ID)

	access, refresh, err := s.issueTokens(ctx, user.ID)
	if err != nil {
		return RegisterResult{}, fmt.Errorf("issue tokens: %w", err)
	}

	if s.email != nil {
		go s.sendWelcomeEmail(user.Email, user.Name)
		go s.sendVerificationEmail(user.Email, user.Name, user.ID)
	}

	return RegisterResult{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         s.safeUser(user),
	}, nil
}

func (s *Service) Login(ctx context.Context, req LoginRequest) (LoginResult, error) {
	user, err := s.store.GetUserByEmail(ctx, req.Email)
	if err != nil || !user.PasswordHash.Valid {
		return LoginResult{}, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash.String), []byte(req.Password)); err != nil {
		return LoginResult{}, ErrInvalidCredentials
	}

	access, refresh, err := s.issueTokens(ctx, user.ID)
	if err != nil {
		return LoginResult{}, fmt.Errorf("issue tokens: %w", err)
	}

	return LoginResult{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         s.safeUser(user),
	}, nil
}

func (s *Service) Refresh(ctx context.Context, req RefreshRequest) (RefreshResult, error) {
	hash := s.tokenHash(req.RefreshToken)
	rt, err := s.store.GetRefreshToken(ctx, hash)
	if err != nil {
		return RefreshResult{}, ErrInvalidToken
	}

	if err := s.store.RevokeRefreshToken(ctx, hash); err != nil {
		return RefreshResult{}, fmt.Errorf("revoke token: %w", err)
	}

	user, err := s.store.GetUserByID(ctx, rt.UserID)
	if err != nil {
		return RefreshResult{}, ErrInvalidToken
	}

	access, refresh, err := s.issueTokens(ctx, user.ID)
	if err != nil {
		return RefreshResult{}, fmt.Errorf("issue tokens: %w", err)
	}

	return RefreshResult{AccessToken: access, RefreshToken: refresh}, nil
}

func (s *Service) Logout(ctx context.Context, userID uuid.UUID) error {
	_ = s.store.RevokeAllUserRefreshTokens(ctx, userID)
	return nil
}

func (s *Service) VerifyEmail(ctx context.Context, req VerifyEmailRequest) error {
	hash := s.tokenHash(req.Token)
	ev, err := s.store.GetEmailVerification(ctx, hash)
	if err != nil {
		return ErrInvalidToken
	}

	if err := s.store.MarkEmailVerificationUsed(ctx, hash); err != nil {
		return fmt.Errorf("mark used: %w", err)
	}
	if err := s.store.VerifyUserEmail(ctx, ev.UserID); err != nil {
		return fmt.Errorf("verify user: %w", err)
	}
	return nil
}

// ResendVerification resends the verification email. user is pre-loaded from context.
func (s *Service) ResendVerification(ctx context.Context, user db.User) error {
	if user.EmailVerified {
		return ErrEmailAlreadyVerified
	}
	if s.email == nil {
		return ErrEmailServiceDisabled
	}
	go s.sendVerificationEmail(user.Email, user.Name, user.ID)
	return nil
}

// ForgotPassword always returns nil to prevent email enumeration.
// The lookup and email send happen asynchronously.
func (s *Service) ForgotPassword(ctx context.Context, req ForgotPasswordRequest) error {
	if s.email != nil {
		go func() {
			user, err := s.store.GetUserByEmail(context.Background(), req.Email)
			if err != nil {
				return
			}
			s.sendPasswordResetEmail(user.Email, user.Name, user.ID)
		}()
	}
	return nil
}

func (s *Service) ResetPassword(ctx context.Context, req ResetPasswordRequest) error {
	if len(req.Password) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}

	hash := s.tokenHash(req.Token)
	pr, err := s.store.GetPasswordReset(ctx, hash)
	if err != nil {
		return ErrInvalidToken
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if err := s.store.UpdateUserPassword(ctx, db.UpdateUserPasswordParams{
		ID:           pr.UserID,
		PasswordHash: pgtype.Text{String: string(newHash), Valid: true},
	}); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	_ = s.store.MarkPasswordResetUsed(ctx, hash)
	_ = s.store.RevokeAllUserRefreshTokens(ctx, pr.UserID)
	return nil
}

// GetProfile converts db.User to UserResponse — pure, no store call needed.
func (s *Service) GetProfile(_ context.Context, user db.User) UserResponse {
	return s.safeUser(user)
}

func (s *Service) UpdateProfile(ctx context.Context, userID uuid.UUID, req UpdateProfileRequest) (UserResponse, error) {
	params := db.UpdateUserProfileParams{ID: userID}
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

	updated, err := s.store.UpdateUserProfile(ctx, params)
	if err != nil {
		return UserResponse{}, fmt.Errorf("update profile: %w", err)
	}

	if req.EstimatedScore != nil {
		_ = s.store.SetEstimatedScore(ctx, db.SetEstimatedScoreParams{
			ID:             userID,
			EstimatedScore: pgtype.Int2{Int16: *req.EstimatedScore, Valid: true},
		})
	}

	return s.safeUser(updated), nil
}

func (s *Service) ChangePassword(ctx context.Context, user db.User, req ChangePasswordRequest) error {
	if !user.PasswordHash.Valid {
		return ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash.String), []byte(req.CurrentPassword)); err != nil {
		return ErrInvalidCredentials
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if err := s.store.UpdateUserPassword(ctx, db.UpdateUserPasswordParams{
		ID:           user.ID,
		PasswordHash: pgtype.Text{String: string(newHash), Valid: true},
	}); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	_ = s.store.RevokeAllUserRefreshTokens(ctx, user.ID)
	return nil
}

func (s *Service) ChangeEmail(ctx context.Context, user db.User, req ChangeEmailRequest) (UserResponse, error) {
	if !user.PasswordHash.Valid {
		return UserResponse{}, ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash.String), []byte(req.Password)); err != nil {
		return UserResponse{}, ErrInvalidCredentials
	}
	updated, err := s.store.UpdateUserEmail(ctx, db.UpdateUserEmailParams{
		ID:    user.ID,
		Email: req.Email,
	})
	if err != nil {
		return UserResponse{}, ErrEmailInUse
	}
	if s.email != nil {
		go s.sendVerificationEmail(updated.Email, updated.Name, updated.ID)
	}
	return s.safeUser(updated), nil
}

func (s *Service) DeleteAccount(ctx context.Context, userID uuid.UUID) error {
	_ = s.store.RevokeAllUserRefreshTokens(ctx, userID)
	return s.store.SoftDeleteUser(ctx, userID)
}

// GetUserByID exposes a single-user lookup for the auth middleware.
func (s *Service) GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error) {
	return s.store.GetUserByID(ctx, id)
}

// JWTSecret exposes the signing secret for the auth middleware.
func (s *Service) JWTSecret() []byte { return s.secret }

// ── Private helpers ───────────────────────────────────────────────────────────

func (s *Service) issueTokens(ctx context.Context, userID uuid.UUID) (accessToken, refreshToken string, err error) {
	claims := jwt.RegisteredClaims{
		Subject:   userID.String(),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	accessToken, err = tok.SignedString(s.secret)
	if err != nil {
		return
	}

	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return
	}
	refreshToken = fmt.Sprintf("%x", raw)
	hash := s.tokenHash(refreshToken)

	_, err = s.store.CreateRefreshToken(ctx, db.CreateRefreshTokenParams{
		UserID:    userID,
		TokenHash: hash,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(7 * 24 * time.Hour), Valid: true},
	})
	return
}

func (s *Service) tokenHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", sum)
}

func (s *Service) sendWelcomeEmail(to, name string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	subject, html := eml.Welcome(name)
	if _, err := s.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html}); err != nil {
		s.log.WarnContext(ctx, "welcome email failed", "request_id", reqid.FromCtx(ctx), "to", to, "err", err)
	}
}

func (s *Service) sendVerificationEmail(to, name string, userID uuid.UUID) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		ctx := context.Background()
		s.log.ErrorContext(ctx, "gen verify token", "request_id", reqid.FromCtx(ctx), "err", err)
		return
	}
	rawToken := fmt.Sprintf("%x", raw)
	hash := s.tokenHash(rawToken)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.store.CreateEmailVerification(ctx, db.CreateEmailVerificationParams{
		UserID:    userID,
		TokenHash: hash,
		Email:     to,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
	})
	if err != nil {
		s.log.ErrorContext(ctx, "store verify token", "request_id", reqid.FromCtx(ctx), "to", to, "err", err)
		return
	}

	verifyURL := s.appURL + "/verify-email?token=" + rawToken
	subject, html := eml.VerifyEmail(name, verifyURL)
	if _, err := s.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html}); err != nil {
		s.log.WarnContext(ctx, "verify email failed", "request_id", reqid.FromCtx(ctx), "to", to, "err", err)
	}
}

func (s *Service) sendPasswordResetEmail(to, name string, userID uuid.UUID) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		ctx := context.Background()
		s.log.ErrorContext(ctx, "gen reset token", "request_id", reqid.FromCtx(ctx), "err", err)
		return
	}
	rawToken := fmt.Sprintf("%x", raw)
	hash := s.tokenHash(rawToken)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.store.CreatePasswordReset(ctx, db.CreatePasswordResetParams{
		UserID:    userID,
		TokenHash: hash,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true},
	})
	if err != nil {
		s.log.ErrorContext(ctx, "store reset token", "request_id", reqid.FromCtx(ctx), "to", to, "err", err)
		return
	}

	resetURL := s.appURL + "/reset-password?token=" + rawToken
	subject, html := eml.PasswordReset(name, resetURL)
	if _, err := s.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html}); err != nil {
		s.log.WarnContext(ctx, "reset email failed", "request_id", reqid.FromCtx(ctx), "to", to, "err", err)
	}
}

func (s *Service) safeUser(u db.User) UserResponse {
	return UserResponse{
		ID:                u.ID,
		Email:             u.Email,
		Name:              u.Name,
		Role:              u.Role,
		SleepBaseline:     u.SleepBaseline,
		Timezone:          u.Timezone,
		EmailVerified:     u.EmailVerified,
		Tier:              u.Tier,
		CalendarConnected: u.CalendarConnected,
	}
}
