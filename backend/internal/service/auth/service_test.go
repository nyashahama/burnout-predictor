package auth_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/service/auth"
)

// ── Mock store ────────────────────────────────────────────────────────────────

type mockAuthStore struct {
	createUser                  func(ctx context.Context, params db.CreateUserParams) (db.User, error)
	getUserByEmail              func(ctx context.Context, email string) (db.User, error)
	getUserByID                 func(ctx context.Context, id uuid.UUID) (db.User, error)
	updateUserProfile           func(ctx context.Context, params db.UpdateUserProfileParams) (db.User, error)
	updateUserPassword          func(ctx context.Context, params db.UpdateUserPasswordParams) error
	updateUserEmail             func(ctx context.Context, params db.UpdateUserEmailParams) (db.User, error)
	setEstimatedScore           func(ctx context.Context, params db.SetEstimatedScoreParams) error
	softDeleteUser              func(ctx context.Context, id uuid.UUID) error
	verifyUserEmail             func(ctx context.Context, id uuid.UUID) error
	createRefreshToken          func(ctx context.Context, params db.CreateRefreshTokenParams) (db.RefreshToken, error)
	getRefreshToken             func(ctx context.Context, tokenHash string) (db.RefreshToken, error)
	revokeRefreshToken          func(ctx context.Context, tokenHash string) error
	revokeAllUserRefreshTokens  func(ctx context.Context, userID uuid.UUID) error
	createEmailVerification     func(ctx context.Context, params db.CreateEmailVerificationParams) (db.EmailVerification, error)
	getEmailVerification        func(ctx context.Context, tokenHash string) (db.EmailVerification, error)
	markEmailVerificationUsed   func(ctx context.Context, tokenHash string) error
	createPasswordReset         func(ctx context.Context, params db.CreatePasswordResetParams) (db.PasswordReset, error)
	getPasswordReset            func(ctx context.Context, tokenHash string) (db.PasswordReset, error)
	markPasswordResetUsed       func(ctx context.Context, tokenHash string) error
	createDefaultNotifPrefs     func(ctx context.Context, userID uuid.UUID) (db.UserNotificationPref, error)
}

func (m *mockAuthStore) CreateUser(ctx context.Context, p db.CreateUserParams) (db.User, error) {
	return m.createUser(ctx, p)
}
func (m *mockAuthStore) GetUserByEmail(ctx context.Context, e string) (db.User, error) {
	return m.getUserByEmail(ctx, e)
}
func (m *mockAuthStore) GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error) {
	return m.getUserByID(ctx, id)
}
func (m *mockAuthStore) UpdateUserProfile(ctx context.Context, p db.UpdateUserProfileParams) (db.User, error) {
	return m.updateUserProfile(ctx, p)
}
func (m *mockAuthStore) UpdateUserPassword(ctx context.Context, p db.UpdateUserPasswordParams) error {
	return m.updateUserPassword(ctx, p)
}
func (m *mockAuthStore) UpdateUserEmail(ctx context.Context, p db.UpdateUserEmailParams) (db.User, error) {
	return m.updateUserEmail(ctx, p)
}
func (m *mockAuthStore) SetEstimatedScore(ctx context.Context, p db.SetEstimatedScoreParams) error {
	if m.setEstimatedScore != nil {
		return m.setEstimatedScore(ctx, p)
	}
	return nil
}
func (m *mockAuthStore) SoftDeleteUser(ctx context.Context, id uuid.UUID) error {
	return m.softDeleteUser(ctx, id)
}
func (m *mockAuthStore) VerifyUserEmail(ctx context.Context, id uuid.UUID) error {
	return m.verifyUserEmail(ctx, id)
}
func (m *mockAuthStore) CreateRefreshToken(ctx context.Context, p db.CreateRefreshTokenParams) (db.RefreshToken, error) {
	return m.createRefreshToken(ctx, p)
}
func (m *mockAuthStore) GetRefreshToken(ctx context.Context, h string) (db.RefreshToken, error) {
	return m.getRefreshToken(ctx, h)
}
func (m *mockAuthStore) RevokeRefreshToken(ctx context.Context, h string) error {
	return m.revokeRefreshToken(ctx, h)
}
func (m *mockAuthStore) RevokeAllUserRefreshTokens(ctx context.Context, id uuid.UUID) error {
	if m.revokeAllUserRefreshTokens != nil {
		return m.revokeAllUserRefreshTokens(ctx, id)
	}
	return nil
}
func (m *mockAuthStore) CreateEmailVerification(ctx context.Context, p db.CreateEmailVerificationParams) (db.EmailVerification, error) {
	if m.createEmailVerification != nil {
		return m.createEmailVerification(ctx, p)
	}
	return db.EmailVerification{}, nil
}
func (m *mockAuthStore) GetEmailVerification(ctx context.Context, h string) (db.EmailVerification, error) {
	return m.getEmailVerification(ctx, h)
}
func (m *mockAuthStore) MarkEmailVerificationUsed(ctx context.Context, h string) error {
	return m.markEmailVerificationUsed(ctx, h)
}
func (m *mockAuthStore) CreatePasswordReset(ctx context.Context, p db.CreatePasswordResetParams) (db.PasswordReset, error) {
	if m.createPasswordReset != nil {
		return m.createPasswordReset(ctx, p)
	}
	return db.PasswordReset{}, nil
}
func (m *mockAuthStore) GetPasswordReset(ctx context.Context, h string) (db.PasswordReset, error) {
	return m.getPasswordReset(ctx, h)
}
func (m *mockAuthStore) MarkPasswordResetUsed(ctx context.Context, h string) error {
	if m.markPasswordResetUsed != nil {
		return m.markPasswordResetUsed(ctx, h)
	}
	return nil
}
func (m *mockAuthStore) CreateDefaultNotificationPrefs(ctx context.Context, id uuid.UUID) (db.UserNotificationPref, error) {
	if m.createDefaultNotifPrefs != nil {
		return m.createDefaultNotifPrefs(ctx, id)
	}
	return db.UserNotificationPref{}, nil
}

// ── Test helpers ──────────────────────────────────────────────────────────────

// newService returns an auth.Service with no email client (email disabled).
func newService(store *mockAuthStore) *auth.Service {
	return auth.New(store, []byte("thisisasecretkeythatis32byteslong!!"), nil, "https://overload.app", slog.Default())
}

func okRefreshToken(userID uuid.UUID) func(ctx context.Context, p db.CreateRefreshTokenParams) (db.RefreshToken, error) {
	return func(ctx context.Context, p db.CreateRefreshTokenParams) (db.RefreshToken, error) {
		return db.RefreshToken{
			UserID:    userID,
			TokenHash: p.TokenHash,
			ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(7 * 24 * time.Hour), Valid: true},
		}, nil
	}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestRegister_Success(t *testing.T) {
	userID := uuid.New()
	store := &mockAuthStore{
		createUser: func(_ context.Context, p db.CreateUserParams) (db.User, error) {
			return db.User{ID: userID, Email: p.Email, Name: p.Name, Role: p.Role, Tier: "free"}, nil
		},
		createRefreshToken: okRefreshToken(userID),
	}
	svc := newService(store)

	res, err := svc.Register(context.Background(), auth.RegisterRequest{
		Email:    "alice@example.com",
		Password: "password123",
		Name:     "Alice",
	})

	if err != nil {
		t.Fatalf("Register() error = %v, want nil", err)
	}
	if res.User.Email != "alice@example.com" {
		t.Errorf("User.Email = %q, want alice@example.com", res.User.Email)
	}
	if res.AccessToken == "" {
		t.Error("AccessToken is empty")
	}
	if res.RefreshToken == "" {
		t.Error("RefreshToken is empty")
	}
}

func TestRegister_DuplicateEmail(t *testing.T) {
	// Must return a *pgconn.PgError with code 23505 to trigger the ErrEmailInUse branch.
	// The service checks errors.As(err, &pgErr) && pgErr.Code == "23505".
	store := &mockAuthStore{
		createUser: func(_ context.Context, _ db.CreateUserParams) (db.User, error) {
			return db.User{}, &pgconn.PgError{Code: "23505"}
		},
	}
	svc := newService(store)

	_, err := svc.Register(context.Background(), auth.RegisterRequest{
		Email:    "taken@example.com",
		Password: "password123",
		Name:     "Bob",
	})

	if !errors.Is(err, auth.ErrEmailInUse) {
		t.Errorf("Register() error = %v, want ErrEmailInUse", err)
	}
}

func TestLogin_InvalidPassword(t *testing.T) {
	store := &mockAuthStore{
		getUserByEmail: func(_ context.Context, _ string) (db.User, error) {
			// Return a user with a bcrypt hash for "correct-password"
			// Using a known bcrypt hash to avoid bcrypt cost in tests.
			// $2a$10$ prefix + hash of "correct-password"
			return db.User{
				ID:           uuid.New(),
				Email:        "alice@example.com",
				PasswordHash: pgtype.Text{String: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy", Valid: true},
			}, nil
		},
	}
	svc := newService(store)

	_, err := svc.Login(context.Background(), auth.LoginRequest{
		Email:    "alice@example.com",
		Password: "wrong-password",
	})

	if !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Errorf("Login() error = %v, want ErrInvalidCredentials", err)
	}
}

func TestLogin_UserNotFound(t *testing.T) {
	store := &mockAuthStore{
		getUserByEmail: func(_ context.Context, _ string) (db.User, error) {
			return db.User{}, pgx.ErrNoRows
		},
	}
	svc := newService(store)

	_, err := svc.Login(context.Background(), auth.LoginRequest{
		Email:    "nobody@example.com",
		Password: "anything",
	})

	if !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Errorf("Login() error = %v, want ErrInvalidCredentials", err)
	}
}

func TestRefresh_InvalidToken(t *testing.T) {
	store := &mockAuthStore{
		getRefreshToken: func(_ context.Context, _ string) (db.RefreshToken, error) {
			return db.RefreshToken{}, errors.New("not found")
		},
	}
	svc := newService(store)

	_, err := svc.Refresh(context.Background(), auth.RefreshRequest{RefreshToken: "bogus-token"})

	if !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("Refresh() error = %v, want ErrInvalidToken", err)
	}
}

func TestForgotPassword_AlwaysSucceeds(t *testing.T) {
	// ForgotPassword must always return nil to prevent email enumeration.
	store := &mockAuthStore{
		getUserByEmail: func(_ context.Context, _ string) (db.User, error) {
			return db.User{}, errors.New("not found")
		},
	}
	svc := newService(store)

	err := svc.ForgotPassword(context.Background(), auth.ForgotPasswordRequest{
		Email: "anyone@example.com",
	})

	if err != nil {
		t.Errorf("ForgotPassword() error = %v, want nil (must never leak user existence)", err)
	}
}

func TestVerifyEmail_InvalidToken(t *testing.T) {
	store := &mockAuthStore{
		getEmailVerification: func(_ context.Context, _ string) (db.EmailVerification, error) {
			return db.EmailVerification{}, errors.New("not found")
		},
	}
	svc := newService(store)

	err := svc.VerifyEmail(context.Background(), auth.VerifyEmailRequest{Token: "bad-token"})

	if !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("VerifyEmail() error = %v, want ErrInvalidToken", err)
	}
}
