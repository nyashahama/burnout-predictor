package handler_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	authsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/auth"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockAuthService struct {
	RegisterFn           func(context.Context, authsvc.RegisterRequest) (authsvc.RegisterResult, error)
	LoginFn              func(context.Context, authsvc.LoginRequest) (authsvc.LoginResult, error)
	RefreshFn            func(context.Context, authsvc.RefreshRequest) (authsvc.RefreshResult, error)
	LogoutFn             func(context.Context, uuid.UUID) error
	VerifyEmailFn        func(context.Context, authsvc.VerifyEmailRequest) error
	ResendVerificationFn func(context.Context, db.User) error
	ForgotPasswordFn     func(context.Context, authsvc.ForgotPasswordRequest) error
	ResetPasswordFn      func(context.Context, authsvc.ResetPasswordRequest) error
	ChangePasswordFn     func(context.Context, db.User, authsvc.ChangePasswordRequest) error
	ChangeEmailFn        func(context.Context, db.User, authsvc.ChangeEmailRequest) (authsvc.UserResponse, error)
	DeleteAccountFn      func(context.Context, uuid.UUID) error
}

func (m *mockAuthService) Register(ctx context.Context, req authsvc.RegisterRequest) (authsvc.RegisterResult, error) {
	if m.RegisterFn != nil {
		return m.RegisterFn(ctx, req)
	}
	return authsvc.RegisterResult{}, nil
}
func (m *mockAuthService) Login(ctx context.Context, req authsvc.LoginRequest) (authsvc.LoginResult, error) {
	if m.LoginFn != nil {
		return m.LoginFn(ctx, req)
	}
	return authsvc.LoginResult{}, nil
}
func (m *mockAuthService) Refresh(ctx context.Context, req authsvc.RefreshRequest) (authsvc.RefreshResult, error) {
	if m.RefreshFn != nil {
		return m.RefreshFn(ctx, req)
	}
	return authsvc.RefreshResult{}, nil
}
func (m *mockAuthService) Logout(ctx context.Context, userID uuid.UUID) error {
	if m.LogoutFn != nil {
		return m.LogoutFn(ctx, userID)
	}
	return nil
}
func (m *mockAuthService) VerifyEmail(ctx context.Context, req authsvc.VerifyEmailRequest) error {
	if m.VerifyEmailFn != nil {
		return m.VerifyEmailFn(ctx, req)
	}
	return nil
}
func (m *mockAuthService) ResendVerification(ctx context.Context, user db.User) error {
	if m.ResendVerificationFn != nil {
		return m.ResendVerificationFn(ctx, user)
	}
	return nil
}
func (m *mockAuthService) ForgotPassword(ctx context.Context, req authsvc.ForgotPasswordRequest) error {
	if m.ForgotPasswordFn != nil {
		return m.ForgotPasswordFn(ctx, req)
	}
	return nil
}
func (m *mockAuthService) ResetPassword(ctx context.Context, req authsvc.ResetPasswordRequest) error {
	if m.ResetPasswordFn != nil {
		return m.ResetPasswordFn(ctx, req)
	}
	return nil
}
func (m *mockAuthService) ChangePassword(ctx context.Context, user db.User, req authsvc.ChangePasswordRequest) error {
	if m.ChangePasswordFn != nil {
		return m.ChangePasswordFn(ctx, user, req)
	}
	return nil
}
func (m *mockAuthService) ChangeEmail(ctx context.Context, user db.User, req authsvc.ChangeEmailRequest) (authsvc.UserResponse, error) {
	if m.ChangeEmailFn != nil {
		return m.ChangeEmailFn(ctx, user, req)
	}
	return authsvc.UserResponse{}, nil
}
func (m *mockAuthService) DeleteAccount(ctx context.Context, userID uuid.UUID) error {
	if m.DeleteAccountFn != nil {
		return m.DeleteAccountFn(ctx, userID)
	}
	return nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

var testUser = db.User{ID: uuid.New(), Email: "user@test.com"}

func validRegisterBody(t *testing.T) *strings.Reader {
	t.Helper()
	return strings.NewReader(`{"email":"a@b.com","password":"password123","role":"engineer","timezone":"UTC"}`)
}

// ── Register ──────────────────────────────────────────────────────────────────

func TestAuthHandler_Register_ValidationErrors(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	tests := []struct {
		name string
		body string
	}{
		{"invalid_json", `{bad`},
		{"bad_email", `{"email":"notanemail","password":"password123","role":"engineer","timezone":"UTC"}`},
		{"short_password", `{"email":"a@b.com","password":"short","role":"engineer","timezone":"UTC"}`},
		{"bad_role", `{"email":"a@b.com","password":"password123","role":"ceo","timezone":"UTC"}`},
		{"bad_sleep_baseline", `{"email":"a@b.com","password":"password123","role":"engineer","sleep_baseline":3,"timezone":"UTC"}`},
		{"bad_timezone", `{"email":"a@b.com","password":"password123","role":"engineer","timezone":"NotReal/Zone"}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			h.Register(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("got %d, want 400", rec.Code)
			}
		})
	}
}

func TestAuthHandler_Register_EmailInUse(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		RegisterFn: func(_ context.Context, _ authsvc.RegisterRequest) (authsvc.RegisterResult, error) {
			return authsvc.RegisterResult{}, authsvc.ErrEmailInUse
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", validRegisterBody(t))
	h.Register(rec, req)
	if rec.Code != http.StatusConflict {
		t.Errorf("got %d, want 409", rec.Code)
	}
}

func TestAuthHandler_Register_ServiceError(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		RegisterFn: func(_ context.Context, _ authsvc.RegisterRequest) (authsvc.RegisterResult, error) {
			return authsvc.RegisterResult{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", validRegisterBody(t))
	h.Register(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestAuthHandler_Register_Success(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		RegisterFn: func(_ context.Context, _ authsvc.RegisterRequest) (authsvc.RegisterResult, error) {
			return authsvc.RegisterResult{AccessToken: "tok"}, nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", validRegisterBody(t))
	h.Register(rec, req)
	if rec.Code != http.StatusCreated {
		t.Errorf("got %d, want 201", rec.Code)
	}
}

// ── Login ─────────────────────────────────────────────────────────────────────

func TestAuthHandler_Login_ValidationErrors(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{bad`))
	h.Login(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestAuthHandler_Login_InvalidCredentials(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		LoginFn: func(_ context.Context, _ authsvc.LoginRequest) (authsvc.LoginResult, error) {
			return authsvc.LoginResult{}, authsvc.ErrInvalidCredentials
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"email":"a@b.com","password":"pass"}`))
	h.Login(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}

func TestAuthHandler_Login_ServiceError(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		LoginFn: func(_ context.Context, _ authsvc.LoginRequest) (authsvc.LoginResult, error) {
			return authsvc.LoginResult{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"email":"a@b.com","password":"pass"}`))
	h.Login(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestAuthHandler_Login_Success(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		LoginFn: func(_ context.Context, _ authsvc.LoginRequest) (authsvc.LoginResult, error) {
			return authsvc.LoginResult{AccessToken: "tok"}, nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"email":"a@b.com","password":"pass"}`))
	h.Login(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── RefreshToken ──────────────────────────────────────────────────────────────

func TestAuthHandler_RefreshToken_ValidationErrors(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	tests := []struct{ name, body string }{
		{"missing_token", `{}`},
		{"invalid_json", `{bad`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			h.RefreshToken(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("got %d, want 400", rec.Code)
			}
		})
	}
}

func TestAuthHandler_RefreshToken_InvalidToken(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		RefreshFn: func(_ context.Context, _ authsvc.RefreshRequest) (authsvc.RefreshResult, error) {
			return authsvc.RefreshResult{}, authsvc.ErrInvalidToken
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"refresh_token":"expired"}`))
	h.RefreshToken(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestAuthHandler_RefreshToken_ServiceError(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		RefreshFn: func(_ context.Context, _ authsvc.RefreshRequest) (authsvc.RefreshResult, error) {
			return authsvc.RefreshResult{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"refresh_token":"tok"}`))
	h.RefreshToken(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestAuthHandler_RefreshToken_Success(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		RefreshFn: func(_ context.Context, _ authsvc.RefreshRequest) (authsvc.RefreshResult, error) {
			return authsvc.RefreshResult{AccessToken: "new"}, nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"refresh_token":"tok"}`))
	h.RefreshToken(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── Logout ────────────────────────────────────────────────────────────────────

func TestAuthHandler_Logout_Success(t *testing.T) {
	// Service error is intentionally ignored; Logout always returns 200.
	h := handler.NewAuthHandler(&mockAuthService{
		LogoutFn: func(_ context.Context, _ uuid.UUID) error {
			return errors.New("ignored")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req = withUser(req, testUser)
	h.Logout(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── VerifyEmail ───────────────────────────────────────────────────────────────

func TestAuthHandler_VerifyEmail_ValidationErrors(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	tests := []struct{ name, body string }{
		{"missing_token", `{}`},
		{"invalid_json", `{bad`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			h.VerifyEmail(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("got %d, want 400", rec.Code)
			}
		})
	}
}

func TestAuthHandler_VerifyEmail_InvalidToken(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		VerifyEmailFn: func(_ context.Context, _ authsvc.VerifyEmailRequest) error {
			return authsvc.ErrInvalidToken
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"token":"bad"}`))
	h.VerifyEmail(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestAuthHandler_VerifyEmail_ServiceError(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		VerifyEmailFn: func(_ context.Context, _ authsvc.VerifyEmailRequest) error {
			return errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"token":"tok"}`))
	h.VerifyEmail(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestAuthHandler_VerifyEmail_Success(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"token":"valid"}`))
	h.VerifyEmail(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── ResendVerification ────────────────────────────────────────────────────────

func TestAuthHandler_ResendVerification_EmailServiceDisabled(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		ResendVerificationFn: func(_ context.Context, _ db.User) error {
			return authsvc.ErrEmailServiceDisabled
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req = withUser(req, testUser)
	h.ResendVerification(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("got %d, want 503", rec.Code)
	}
}

func TestAuthHandler_ResendVerification_ServiceError(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		ResendVerificationFn: func(_ context.Context, _ db.User) error {
			return errors.New("smtp down")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req = withUser(req, testUser)
	h.ResendVerification(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestAuthHandler_ResendVerification_Success(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req = withUser(req, testUser)
	h.ResendVerification(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── ForgotPassword ────────────────────────────────────────────────────────────

func TestAuthHandler_ForgotPassword_MissingEmail(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	tests := []struct{ name, body string }{
		{"missing_email", `{}`},
		{"invalid_json", `{bad`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			h.ForgotPassword(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("got %d, want 400", rec.Code)
			}
		})
	}
}

func TestAuthHandler_ForgotPassword_ServiceErrorIgnored(t *testing.T) {
	// Anti-enumeration: service error is silently ignored; always returns 200.
	h := handler.NewAuthHandler(&mockAuthService{
		ForgotPasswordFn: func(_ context.Context, _ authsvc.ForgotPasswordRequest) error {
			return errors.New("no such user")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"email":"a@b.com"}`))
	h.ForgotPassword(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

func TestAuthHandler_ForgotPassword_Success(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"email":"a@b.com"}`))
	h.ForgotPassword(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── ResetPassword ─────────────────────────────────────────────────────────────

func TestAuthHandler_ResetPassword_ValidationErrors(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	tests := []struct{ name, body string }{
		{"missing_both", `{}`},
		{"missing_password", `{"token":"tok"}`},
		{"missing_token", `{"password":"password123"}`},
		{"invalid_json", `{bad`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			h.ResetPassword(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("got %d, want 400", rec.Code)
			}
		})
	}
}

func TestAuthHandler_ResetPassword_InvalidToken(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		ResetPasswordFn: func(_ context.Context, _ authsvc.ResetPasswordRequest) error {
			return authsvc.ErrInvalidToken
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"token":"bad","password":"password123"}`))
	h.ResetPassword(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestAuthHandler_ResetPassword_ServiceError(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		ResetPasswordFn: func(_ context.Context, _ authsvc.ResetPasswordRequest) error {
			return errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"token":"tok","password":"password123"}`))
	h.ResetPassword(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestAuthHandler_ResetPassword_Success(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"token":"tok","password":"password123"}`))
	h.ResetPassword(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── ChangePassword ────────────────────────────────────────────────────────────

func TestAuthHandler_ChangePassword_ValidationErrors(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	tests := []struct{ name, body string }{
		{"invalid_json", `{bad`},
		{"short_password", `{"current_password":"old","new_password":"short"}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			req = withUser(req, testUser)
			h.ChangePassword(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("got %d, want 400", rec.Code)
			}
		})
	}
}

func TestAuthHandler_ChangePassword_InvalidCredentials(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		ChangePasswordFn: func(_ context.Context, _ db.User, _ authsvc.ChangePasswordRequest) error {
			return authsvc.ErrInvalidCredentials
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"current_password":"wrong","new_password":"newpassword"}`))
	req = withUser(req, testUser)
	h.ChangePassword(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}

func TestAuthHandler_ChangePassword_ServiceError(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		ChangePasswordFn: func(_ context.Context, _ db.User, _ authsvc.ChangePasswordRequest) error {
			return errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"current_password":"old","new_password":"newpassword"}`))
	req = withUser(req, testUser)
	h.ChangePassword(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestAuthHandler_ChangePassword_Success(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"current_password":"old","new_password":"newpassword"}`))
	req = withUser(req, testUser)
	h.ChangePassword(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── ChangeEmail ───────────────────────────────────────────────────────────────

func TestAuthHandler_ChangeEmail_ValidationErrors(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	tests := []struct{ name, body string }{
		{"invalid_json", `{bad`},
		{"bad_email", `{"email":"notanemail","password":"pass"}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			req = withUser(req, testUser)
			h.ChangeEmail(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("got %d, want 400", rec.Code)
			}
		})
	}
}

func TestAuthHandler_ChangeEmail_EmailInUse(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		ChangeEmailFn: func(_ context.Context, _ db.User, _ authsvc.ChangeEmailRequest) (authsvc.UserResponse, error) {
			return authsvc.UserResponse{}, authsvc.ErrEmailInUse
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"email":"new@b.com","password":"pass"}`))
	req = withUser(req, testUser)
	h.ChangeEmail(rec, req)
	if rec.Code != http.StatusConflict {
		t.Errorf("got %d, want 409", rec.Code)
	}
}

func TestAuthHandler_ChangeEmail_ServiceError(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		ChangeEmailFn: func(_ context.Context, _ db.User, _ authsvc.ChangeEmailRequest) (authsvc.UserResponse, error) {
			return authsvc.UserResponse{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"email":"new@b.com","password":"pass"}`))
	req = withUser(req, testUser)
	h.ChangeEmail(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestAuthHandler_ChangeEmail_Success(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{
		ChangeEmailFn: func(_ context.Context, _ db.User, _ authsvc.ChangeEmailRequest) (authsvc.UserResponse, error) {
			return authsvc.UserResponse{Email: "new@b.com"}, nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"email":"new@b.com","password":"pass"}`))
	req = withUser(req, testUser)
	h.ChangeEmail(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── DeleteAccount ─────────────────────────────────────────────────────────────

func TestAuthHandler_DeleteAccount_ServiceError(t *testing.T) {
	// DeleteAccount uses respond.Error directly (hardcoded 500), not respond.ServiceError.
	h := handler.NewAuthHandler(&mockAuthService{
		DeleteAccountFn: func(_ context.Context, _ uuid.UUID) error {
			return errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/", nil)
	req = withUser(req, testUser)
	h.DeleteAccount(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestAuthHandler_DeleteAccount_Success(t *testing.T) {
	h := handler.NewAuthHandler(&mockAuthService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/", nil)
	req = withUser(req, testUser)
	h.DeleteAccount(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Errorf("got %d, want 204", rec.Code)
	}
}
