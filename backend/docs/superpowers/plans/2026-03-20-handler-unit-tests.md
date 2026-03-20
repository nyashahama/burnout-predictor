# Handler Unit Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add black-box unit tests for all 9 HTTP handler files, achieving full coverage of validation, service error mapping, and response shaping paths.

**Architecture:** Each test file lives in `package handler_test`, uses a hand-written function-field mock that nil-guards every method, and calls handlers directly via `httptest`. One production-code change: export `SetUserInCtx` from the auth middleware so tests can inject an authenticated user without running JWT validation.

**Tech Stack:** Go 1.23, `net/http/httptest`, `github.com/go-chi/chi/v5` (for path-param tests), `github.com/jackc/pgx/v5/pgtype` (for DB struct fields), standard library only.

---

## File Map

**Modified (production):**
- `internal/api/middleware/auth.go` — add `SetUserInCtx` exported helper

**New (test only):**
- `internal/api/handler/testhelpers_test.go` — `jsonBody`, `withUser`, `decodeJSON`
- `internal/api/handler/auth_test.go`
- `internal/api/handler/checkin_test.go`
- `internal/api/handler/insight_test.go`
- `internal/api/handler/user_test.go`
- `internal/api/handler/followup_test.go`
- `internal/api/handler/notifprefs_test.go`
- `internal/api/handler/subscription_test.go`
- `internal/api/handler/export_test.go`
- `internal/api/handler/webhook_test.go`

---

### Task 1: Export SetUserInCtx from auth middleware

**Files:**
- Modify: `internal/api/middleware/auth.go`

- [ ] **Step 1: Add `SetUserInCtx` to the bottom of `auth.go`**

The function must live in the same file as `userContextKey` so it can reference the unexported constant. Append after the `UserFromCtx` function (currently line 80):

```go
// SetUserInCtx stores a user in context — mirrors what the Auth middleware does.
// Used by handler tests to simulate an authenticated request without running JWT validation.
func SetUserInCtx(ctx context.Context, user db.User) context.Context {
	return context.WithValue(ctx, userContextKey, user)
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go build ./internal/api/middleware/...
```
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add internal/api/middleware/auth.go
git commit -m "feat(middleware): export SetUserInCtx for handler test injection"
```

---

### Task 2: Shared test helpers

**Files:**
- Create: `internal/api/handler/testhelpers_test.go`

- [ ] **Step 1: Write the file**

```go
package handler_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// jsonBody marshals v to JSON and returns it as an io.Reader for request bodies.
func jsonBody(t *testing.T, v any) io.Reader {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("jsonBody: %v", err)
	}
	return bytes.NewReader(b)
}

// withUser injects user into the request context, simulating the Auth middleware.
func withUser(r *http.Request, user db.User) *http.Request {
	return r.WithContext(middleware.SetUserInCtx(r.Context(), user))
}

// decodeJSON decodes the recorder body into v.
func decodeJSON(t *testing.T, w *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.NewDecoder(w.Body).Decode(v); err != nil {
		t.Fatalf("decodeJSON: %v", err)
	}
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go test ./internal/api/handler/...
```
Expected: `ok github.com/nyasha-hama/burnout-predictor-api/internal/api/handler [no test files]`
(The helpers compile; no test functions exist yet.)

- [ ] **Step 3: Commit**

```bash
git add internal/api/handler/testhelpers_test.go
git commit -m "test(handler): add shared test helpers (jsonBody, withUser, decodeJSON)"
```

---

### Task 3: auth_test.go

**Files:**
- Create: `internal/api/handler/auth_test.go`

The mock tracks the `authService` interface declared in `auth.go`. Field names follow the interface method name + `Fn` suffix (`Refresh` → `RefreshFn`, not `RefreshToken` → `RefreshTokenFn`).

- [ ] **Step 1: Write `internal/api/handler/auth_test.go`**

```go
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
```

- [ ] **Step 2: Run the tests**

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go test ./internal/api/handler/... -run TestAuthHandler -v 2>&1 | tail -20
```
Expected: all `TestAuthHandler_*` tests pass, `PASS`.

- [ ] **Step 3: Commit**

```bash
git add internal/api/handler/auth_test.go
git commit -m "test(handler): add auth handler unit tests"
```

---

### Task 4: checkin_test.go

**Files:**
- Create: `internal/api/handler/checkin_test.go`

`ErrInvalidStress` must be the real sentinel from `checkinsvc` — plain `errors.New` would produce 500 via the `respond.ServiceError` fallback path.

- [ ] **Step 1: Write `internal/api/handler/checkin_test.go`**

```go
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
	checkinsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockCheckinService struct {
	UpsertFn       func(context.Context, db.User, checkinsvc.UpsertRequest) (checkinsvc.UpsertResult, error)
	GetScoreCardFn func(context.Context, db.User) (checkinsvc.ScoreCardResult, error)
	ListFn         func(context.Context, uuid.UUID) ([]db.CheckIn, error)
}

func (m *mockCheckinService) Upsert(ctx context.Context, user db.User, req checkinsvc.UpsertRequest) (checkinsvc.UpsertResult, error) {
	if m.UpsertFn != nil {
		return m.UpsertFn(ctx, user, req)
	}
	return checkinsvc.UpsertResult{}, nil
}
func (m *mockCheckinService) GetScoreCard(ctx context.Context, user db.User) (checkinsvc.ScoreCardResult, error) {
	if m.GetScoreCardFn != nil {
		return m.GetScoreCardFn(ctx, user)
	}
	return checkinsvc.ScoreCardResult{}, nil
}
func (m *mockCheckinService) List(ctx context.Context, userID uuid.UUID) ([]db.CheckIn, error) {
	if m.ListFn != nil {
		return m.ListFn(ctx, userID)
	}
	return nil, nil
}

// ── Upsert ────────────────────────────────────────────────────────────────────

func TestCheckinHandler_Upsert_ValidationErrors(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{})
	// note of 281 runes (exceeds 280 limit)
	longNote := strings.Repeat("a", 281)
	tests := []struct{ name, body string }{
		{"invalid_json", `{bad`},
		{"note_too_long", `{"stress":3,"note":"` + longNote + `"}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			req = withUser(req, testUser)
			h.Upsert(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("got %d, want 400", rec.Code)
			}
		})
	}
}

func TestCheckinHandler_Upsert_InvalidStress(t *testing.T) {
	// Must use the real sentinel so respond.ServiceError routes to 400 via HTTPStatus().
	h := handler.NewCheckinHandler(&mockCheckinService{
		UpsertFn: func(_ context.Context, _ db.User, _ checkinsvc.UpsertRequest) (checkinsvc.UpsertResult, error) {
			return checkinsvc.UpsertResult{}, checkinsvc.ErrInvalidStress
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"stress":9}`))
	req = withUser(req, testUser)
	h.Upsert(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestCheckinHandler_Upsert_ServiceError(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{
		UpsertFn: func(_ context.Context, _ db.User, _ checkinsvc.UpsertRequest) (checkinsvc.UpsertResult, error) {
			return checkinsvc.UpsertResult{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"stress":3}`))
	req = withUser(req, testUser)
	h.Upsert(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestCheckinHandler_Upsert_Success(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{
		UpsertFn: func(_ context.Context, _ db.User, _ checkinsvc.UpsertRequest) (checkinsvc.UpsertResult, error) {
			return checkinsvc.UpsertResult{}, nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"stress":3}`))
	req = withUser(req, testUser)
	h.Upsert(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── GetScoreCard ──────────────────────────────────────────────────────────────

func TestCheckinHandler_GetScoreCard_ServiceError(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{
		GetScoreCardFn: func(_ context.Context, _ db.User) (checkinsvc.ScoreCardResult, error) {
			return checkinsvc.ScoreCardResult{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.GetScoreCard(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestCheckinHandler_GetScoreCard_Success(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.GetScoreCard(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── List ──────────────────────────────────────────────────────────────────────

func TestCheckinHandler_List_ServiceError(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{
		ListFn: func(_ context.Context, _ uuid.UUID) ([]db.CheckIn, error) {
			return nil, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.List(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestCheckinHandler_List_Success(t *testing.T) {
	h := handler.NewCheckinHandler(&mockCheckinService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.List(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}
```

- [ ] **Step 2: Run the tests**

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go test ./internal/api/handler/... -run TestCheckinHandler -v 2>&1 | tail -20
```
Expected: all pass, `PASS`.

- [ ] **Step 3: Commit**

```bash
git add internal/api/handler/checkin_test.go
git commit -m "test(handler): add checkin handler unit tests"
```

---

### Task 5: insight_test.go

**Files:**
- Create: `internal/api/handler/insight_test.go`

`ErrInvalidComponent` must be the real sentinel from `insightsvc`.

- [ ] **Step 1: Write `internal/api/handler/insight_test.go`**

```go
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
	insightsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/insight"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockInsightService struct {
	GetFn              func(context.Context, db.User) (insightsvc.InsightBundle, error)
	DismissComponentFn func(context.Context, uuid.UUID, insightsvc.DismissRequest) error
}

func (m *mockInsightService) Get(ctx context.Context, user db.User) (insightsvc.InsightBundle, error) {
	if m.GetFn != nil {
		return m.GetFn(ctx, user)
	}
	return insightsvc.InsightBundle{}, nil
}
func (m *mockInsightService) DismissComponent(ctx context.Context, userID uuid.UUID, req insightsvc.DismissRequest) error {
	if m.DismissComponentFn != nil {
		return m.DismissComponentFn(ctx, userID, req)
	}
	return nil
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestInsightHandler_Get_ServiceError(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{
		GetFn: func(_ context.Context, _ db.User) (insightsvc.InsightBundle, error) {
			return insightsvc.InsightBundle{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestInsightHandler_Get_Success(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── DismissComponent ──────────────────────────────────────────────────────────

func TestInsightHandler_DismissComponent_InvalidJSON(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{bad`))
	req = withUser(req, testUser)
	h.DismissComponent(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestInsightHandler_DismissComponent_InvalidComponent(t *testing.T) {
	// Must use the real sentinel so respond.ServiceError routes to 400 via HTTPStatus().
	h := handler.NewInsightHandler(&mockInsightService{
		DismissComponentFn: func(_ context.Context, _ uuid.UUID, _ insightsvc.DismissRequest) error {
			return insightsvc.ErrInvalidComponent
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"component_key":""}`))
	req = withUser(req, testUser)
	h.DismissComponent(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestInsightHandler_DismissComponent_ServiceError(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{
		DismissComponentFn: func(_ context.Context, _ uuid.UUID, _ insightsvc.DismissRequest) error {
			return errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"component_key":"momentum"}`))
	req = withUser(req, testUser)
	h.DismissComponent(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestInsightHandler_DismissComponent_Success(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"component_key":"momentum"}`))
	req = withUser(req, testUser)
	h.DismissComponent(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}
```

- [ ] **Step 2: Run the tests**

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go test ./internal/api/handler/... -run TestInsightHandler -v 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add internal/api/handler/insight_test.go
git commit -m "test(handler): add insight handler unit tests"
```

---

### Task 6: user_test.go

**Files:**
- Create: `internal/api/handler/user_test.go`

`GetProfile` calls a method with no error return. `UpdateProfile` uses `respond.ServiceError` on failure.

- [ ] **Step 1: Write `internal/api/handler/user_test.go`**

```go
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

type mockUserService struct {
	GetProfileFn    func(context.Context, db.User) authsvc.UserResponse
	UpdateProfileFn func(context.Context, uuid.UUID, authsvc.UpdateProfileRequest) (authsvc.UserResponse, error)
}

func (m *mockUserService) GetProfile(ctx context.Context, user db.User) authsvc.UserResponse {
	if m.GetProfileFn != nil {
		return m.GetProfileFn(ctx, user)
	}
	return authsvc.UserResponse{}
}
func (m *mockUserService) UpdateProfile(ctx context.Context, userID uuid.UUID, req authsvc.UpdateProfileRequest) (authsvc.UserResponse, error) {
	if m.UpdateProfileFn != nil {
		return m.UpdateProfileFn(ctx, userID, req)
	}
	return authsvc.UserResponse{}, nil
}

// ── GetProfile ────────────────────────────────────────────────────────────────

func TestUserHandler_GetProfile_Success(t *testing.T) {
	h := handler.NewUserHandler(&mockUserService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.GetProfile(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── UpdateProfile ─────────────────────────────────────────────────────────────

func TestUserHandler_UpdateProfile_ValidationErrors(t *testing.T) {
	h := handler.NewUserHandler(&mockUserService{})
	badRole := "ceo"
	var badSleep int16 = 3 // below 4 minimum
	badTZ := "NotReal/Zone"
	tests := []struct {
		name string
		body any
	}{
		{"invalid_json", `{bad`},
		{"bad_role", map[string]any{"role": badRole}},
		{"bad_sleep_baseline", map[string]any{"sleep_baseline": badSleep}},
		{"bad_timezone", map[string]any{"timezone": badTZ}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var body interface{ Read([]byte) (int, error) }
			if s, ok := tc.body.(string); ok {
				body = strings.NewReader(s)
			} else {
				body = jsonBody(t, tc.body).(interface{ Read([]byte) (int, error) })
			}
			_ = body
			rec := httptest.NewRecorder()
			var req *http.Request
			if s, ok := tc.body.(string); ok {
				req = httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(s))
			} else {
				req = httptest.NewRequest(http.MethodPatch, "/", jsonBody(t, tc.body))
			}
			req = withUser(req, testUser)
			h.UpdateProfile(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("%s: got %d, want 400", tc.name, rec.Code)
			}
		})
	}
}

func TestUserHandler_UpdateProfile_ServiceError(t *testing.T) {
	h := handler.NewUserHandler(&mockUserService{
		UpdateProfileFn: func(_ context.Context, _ uuid.UUID, _ authsvc.UpdateProfileRequest) (authsvc.UserResponse, error) {
			return authsvc.UserResponse{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"name":"new name"}`))
	req = withUser(req, testUser)
	h.UpdateProfile(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestUserHandler_UpdateProfile_Success(t *testing.T) {
	h := handler.NewUserHandler(&mockUserService{
		UpdateProfileFn: func(_ context.Context, _ uuid.UUID, _ authsvc.UpdateProfileRequest) (authsvc.UserResponse, error) {
			return authsvc.UserResponse{Name: "updated"}, nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"name":"updated"}`))
	req = withUser(req, testUser)
	h.UpdateProfile(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}
```

- [ ] **Step 2: Run the tests**

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go test ./internal/api/handler/... -run TestUserHandler -v 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add internal/api/handler/user_test.go
git commit -m "test(handler): add user handler unit tests"
```

---

### Task 7: followup_test.go

**Files:**
- Create: `internal/api/handler/followup_test.go`

`Dismiss` reads a chi `{id}` URL param — route it through `chi.NewRouter` for that test. `GetToday` does NOT need chi routing. `DismissFollowUp` errors go through `respond.Error` directly (hardcoded 500); any `error` value suffices.

- [ ] **Step 1: Write `internal/api/handler/followup_test.go`**

```go
package handler_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	chi "github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockFollowUpStore struct {
	GetTodayFollowUpFn     func(context.Context, db.GetTodayFollowUpParams) (db.FollowUp, error)
	MarkFollowUpSurfacedFn func(context.Context, db.MarkFollowUpSurfacedParams) error
	DismissFollowUpFn      func(context.Context, db.DismissFollowUpParams) error
}

func (m *mockFollowUpStore) GetTodayFollowUp(ctx context.Context, params db.GetTodayFollowUpParams) (db.FollowUp, error) {
	if m.GetTodayFollowUpFn != nil {
		return m.GetTodayFollowUpFn(ctx, params)
	}
	return db.FollowUp{}, nil
}
func (m *mockFollowUpStore) MarkFollowUpSurfaced(ctx context.Context, params db.MarkFollowUpSurfacedParams) error {
	if m.MarkFollowUpSurfacedFn != nil {
		return m.MarkFollowUpSurfacedFn(ctx, params)
	}
	return nil
}
func (m *mockFollowUpStore) DismissFollowUp(ctx context.Context, params db.DismissFollowUpParams) error {
	if m.DismissFollowUpFn != nil {
		return m.DismissFollowUpFn(ctx, params)
	}
	return nil
}

// ── GetToday ──────────────────────────────────────────────────────────────────

func TestFollowUpHandler_GetToday_StoreError_ReturnsNull(t *testing.T) {
	// Any store error → 200 {"follow_up": null}, not a 5xx.
	h := handler.NewFollowUpHandler(&mockFollowUpStore{
		GetTodayFollowUpFn: func(_ context.Context, _ db.GetTodayFollowUpParams) (db.FollowUp, error) {
			return db.FollowUp{}, errors.New("no rows")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.GetToday(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	var resp map[string]any
	decodeJSON(t, rec, &resp)
	if _, ok := resp["follow_up"]; !ok {
		t.Error("response missing follow_up key")
	}
	if resp["follow_up"] != nil {
		t.Errorf("expected follow_up to be null, got %v", resp["follow_up"])
	}
}

func TestFollowUpHandler_GetToday_Success_Unsurfaced_CallsMarkSurfaced(t *testing.T) {
	// follow_up with SurfacedAt.Valid = false → MarkFollowUpSurfaced must be called.
	surfacedCalled := false
	fu := db.FollowUp{
		ID:         uuid.New(),
		UserID:     testUser.ID,
		SurfacedAt: pgtype.Timestamptz{Valid: false},
	}
	h := handler.NewFollowUpHandler(&mockFollowUpStore{
		GetTodayFollowUpFn: func(_ context.Context, _ db.GetTodayFollowUpParams) (db.FollowUp, error) {
			return fu, nil
		},
		MarkFollowUpSurfacedFn: func(_ context.Context, _ db.MarkFollowUpSurfacedParams) error {
			surfacedCalled = true
			return nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.GetToday(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	if !surfacedCalled {
		t.Error("expected MarkFollowUpSurfaced to be called for unsurfaced follow-up")
	}
}

func TestFollowUpHandler_GetToday_Success_AlreadySurfaced_NoMarkCall(t *testing.T) {
	// follow_up with SurfacedAt.Valid = true → MarkFollowUpSurfaced must NOT be called.
	surfacedCalled := false
	fu := db.FollowUp{
		ID:         uuid.New(),
		UserID:     testUser.ID,
		SurfacedAt: pgtype.Timestamptz{Valid: true},
	}
	h := handler.NewFollowUpHandler(&mockFollowUpStore{
		GetTodayFollowUpFn: func(_ context.Context, _ db.GetTodayFollowUpParams) (db.FollowUp, error) {
			return fu, nil
		},
		MarkFollowUpSurfacedFn: func(_ context.Context, _ db.MarkFollowUpSurfacedParams) error {
			surfacedCalled = true
			return nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.GetToday(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	if surfacedCalled {
		t.Error("expected MarkFollowUpSurfaced NOT to be called for already-surfaced follow-up")
	}
}

// ── Dismiss ───────────────────────────────────────────────────────────────────

// dismissRequest routes through chi so the {id} URL param is populated.
func dismissRequest(t *testing.T, h *handler.FollowUpHandler, id string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	r.Delete("/followup/{id}", h.Dismiss)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/followup/"+id, nil)
	req = withUser(req, testUser)
	r.ServeHTTP(rec, req)
	return rec
}

func TestFollowUpHandler_Dismiss_MalformedUUID(t *testing.T) {
	h := handler.NewFollowUpHandler(&mockFollowUpStore{})
	rec := dismissRequest(t, h, "not-a-uuid")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestFollowUpHandler_Dismiss_StoreError(t *testing.T) {
	// respond.Error directly — hardcoded 500; any error value suffices.
	h := handler.NewFollowUpHandler(&mockFollowUpStore{
		DismissFollowUpFn: func(_ context.Context, _ db.DismissFollowUpParams) error {
			return errors.New("db error")
		},
	})
	rec := dismissRequest(t, h, uuid.New().String())
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestFollowUpHandler_Dismiss_Success(t *testing.T) {
	h := handler.NewFollowUpHandler(&mockFollowUpStore{})
	rec := dismissRequest(t, h, uuid.New().String())
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}
```

- [ ] **Step 2: Run the tests**

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go test ./internal/api/handler/... -run TestFollowUpHandler -v 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add internal/api/handler/followup_test.go
git commit -m "test(handler): add follow-up handler unit tests"
```

---

### Task 8: notifprefs_test.go

**Files:**
- Create: `internal/api/handler/notifprefs_test.go`

`Get` calls `CreateDefaultNotificationPrefs` on any `GetNotificationPrefs` error (error silently discarded). `Update` uses `respond.Error` directly (hardcoded 500) on `UpsertNotificationPrefs` failure.

- [ ] **Step 1: Write `internal/api/handler/notifprefs_test.go`**

```go
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
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockNotifPrefsStore struct {
	GetNotificationPrefsFn          func(context.Context, uuid.UUID) (db.UserNotificationPref, error)
	UpsertNotificationPrefsFn       func(context.Context, db.UpsertNotificationPrefsParams) (db.UserNotificationPref, error)
	CreateDefaultNotificationPrefsFn func(context.Context, uuid.UUID) (db.UserNotificationPref, error)
}

func (m *mockNotifPrefsStore) GetNotificationPrefs(ctx context.Context, userID uuid.UUID) (db.UserNotificationPref, error) {
	if m.GetNotificationPrefsFn != nil {
		return m.GetNotificationPrefsFn(ctx, userID)
	}
	return db.UserNotificationPref{}, nil
}
func (m *mockNotifPrefsStore) UpsertNotificationPrefs(ctx context.Context, params db.UpsertNotificationPrefsParams) (db.UserNotificationPref, error) {
	if m.UpsertNotificationPrefsFn != nil {
		return m.UpsertNotificationPrefsFn(ctx, params)
	}
	return db.UserNotificationPref{}, nil
}
func (m *mockNotifPrefsStore) CreateDefaultNotificationPrefs(ctx context.Context, userID uuid.UUID) (db.UserNotificationPref, error) {
	if m.CreateDefaultNotificationPrefsFn != nil {
		return m.CreateDefaultNotificationPrefsFn(ctx, userID)
	}
	return db.UserNotificationPref{}, nil
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestNotifPrefsHandler_Get_NoPrefs_CreatesDefaults(t *testing.T) {
	// GetNotificationPrefs error → CreateDefaultNotificationPrefs called → 200.
	defaultsCalled := false
	h := handler.NewNotifPrefsHandler(&mockNotifPrefsStore{
		GetNotificationPrefsFn: func(_ context.Context, _ uuid.UUID) (db.UserNotificationPref, error) {
			return db.UserNotificationPref{}, errors.New("no rows")
		},
		CreateDefaultNotificationPrefsFn: func(_ context.Context, _ uuid.UUID) (db.UserNotificationPref, error) {
			defaultsCalled = true
			return db.UserNotificationPref{}, nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	if !defaultsCalled {
		t.Error("expected CreateDefaultNotificationPrefs to be called")
	}
}

func TestNotifPrefsHandler_Get_Success(t *testing.T) {
	// Prefs exist — CreateDefaultNotificationPrefs is never reached.
	h := handler.NewNotifPrefsHandler(&mockNotifPrefsStore{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

// ── Update ────────────────────────────────────────────────────────────────────

func TestNotifPrefsHandler_Update_ValidationErrors(t *testing.T) {
	h := handler.NewNotifPrefsHandler(&mockNotifPrefsStore{})
	tests := []struct{ name, body string }{
		{"invalid_json", `{bad`},
		{"bad_reminder_time", `{"reminder_time":"25:00"}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(tc.body))
			req = withUser(req, testUser)
			h.Update(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("got %d, want 400", rec.Code)
			}
		})
	}
}

func TestNotifPrefsHandler_Update_StoreError(t *testing.T) {
	// respond.Error directly — hardcoded 500.
	h := handler.NewNotifPrefsHandler(&mockNotifPrefsStore{
		UpsertNotificationPrefsFn: func(_ context.Context, _ db.UpsertNotificationPrefsParams) (db.UserNotificationPref, error) {
			return db.UserNotificationPref{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"checkin_reminder":true}`))
	req = withUser(req, testUser)
	h.Update(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestNotifPrefsHandler_Update_Success(t *testing.T) {
	h := handler.NewNotifPrefsHandler(&mockNotifPrefsStore{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"checkin_reminder":true,"reminder_time":"09:00"}`))
	req = withUser(req, testUser)
	h.Update(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}
```

- [ ] **Step 2: Run the tests**

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go test ./internal/api/handler/... -run TestNotifPrefsHandler -v 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add internal/api/handler/notifprefs_test.go
git commit -m "test(handler): add notification prefs handler unit tests"
```

---

### Task 9: subscription_test.go

**Files:**
- Create: `internal/api/handler/subscription_test.go`

Any store error returns 200 with `{"subscription": null}` — not a 5xx.

- [ ] **Step 1: Write `internal/api/handler/subscription_test.go`**

```go
package handler_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockSubscriptionStore struct {
	GetActiveSubscriptionByUserIDFn func(context.Context, uuid.UUID) (db.Subscription, error)
}

func (m *mockSubscriptionStore) GetActiveSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (db.Subscription, error) {
	if m.GetActiveSubscriptionByUserIDFn != nil {
		return m.GetActiveSubscriptionByUserIDFn(ctx, userID)
	}
	return db.Subscription{}, nil
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestSubscriptionHandler_Get_NoSubscription_ReturnsNull(t *testing.T) {
	// Store error → 200 {"subscription": null}, not a 5xx.
	h := handler.NewSubscriptionHandler(&mockSubscriptionStore{
		GetActiveSubscriptionByUserIDFn: func(_ context.Context, _ uuid.UUID) (db.Subscription, error) {
			return db.Subscription{}, errors.New("no rows")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	var resp map[string]any
	decodeJSON(t, rec, &resp)
	if resp["subscription"] != nil {
		t.Errorf("expected subscription to be null, got %v", resp["subscription"])
	}
}

func TestSubscriptionHandler_Get_Success(t *testing.T) {
	h := handler.NewSubscriptionHandler(&mockSubscriptionStore{
		GetActiveSubscriptionByUserIDFn: func(_ context.Context, _ uuid.UUID) (db.Subscription, error) {
			return db.Subscription{PlanName: "pro", Status: "active"}, nil
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	var resp map[string]any
	decodeJSON(t, rec, &resp)
	if resp["subscription"] == nil {
		t.Error("expected subscription to be non-null")
	}
}
```

- [ ] **Step 2: Run the tests**

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go test ./internal/api/handler/... -run TestSubscriptionHandler -v 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add internal/api/handler/subscription_test.go
git commit -m "test(handler): add subscription handler unit tests"
```

---

### Task 10: export_test.go

**Files:**
- Create: `internal/api/handler/export_test.go`

The handler uses `json.NewEncoder(w).Encode(payload)` directly (not `respond.JSON`) and sets `Content-Disposition` on success. The success test asserts the header is present.

- [ ] **Step 1: Write `internal/api/handler/export_test.go`**

```go
package handler_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockExportStore struct {
	ExportUserCheckInsFn func(context.Context, uuid.UUID) ([]db.ExportUserCheckInsRow, error)
}

func (m *mockExportStore) ExportUserCheckIns(ctx context.Context, userID uuid.UUID) ([]db.ExportUserCheckInsRow, error) {
	if m.ExportUserCheckInsFn != nil {
		return m.ExportUserCheckInsFn(ctx, userID)
	}
	return nil, nil
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestExportHandler_Get_StoreError(t *testing.T) {
	// respond.Error directly — hardcoded 500.
	h := handler.NewExportHandler(&mockExportStore{
		ExportUserCheckInsFn: func(_ context.Context, _ uuid.UUID) ([]db.ExportUserCheckInsRow, error) {
			return nil, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestExportHandler_Get_Success(t *testing.T) {
	h := handler.NewExportHandler(&mockExportStore{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, db.User{
		ID:    uuid.New(),
		Email: "user@test.com",
		Name:  "Test User",
		Role:  "engineer",
	})
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	cd := rec.Header().Get("Content-Disposition")
	if cd == "" {
		t.Error("expected Content-Disposition header to be set")
	}
}
```

- [ ] **Step 2: Run the tests**

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go test ./internal/api/handler/... -run TestExportHandler -v 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add internal/api/handler/export_test.go
git commit -m "test(handler): add export handler unit tests"
```

---

### Task 11: webhook_test.go

**Files:**
- Create: `internal/api/handler/webhook_test.go`

Includes a local `paddleSignatureHeader` helper. HMAC message is `ts + ":" + string(body)`. `ProcessEvent` mock field named `ProcessEventFn` (tracks interface method name).

- [ ] **Step 1: Write `internal/api/handler/webhook_test.go`**

```go
package handler_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	billingsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/billing"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockBillingService struct {
	ProcessEventFn func(context.Context, billingsvc.PaddleEvent, []byte) (bool, error)
}

func (m *mockBillingService) ProcessEvent(ctx context.Context, event billingsvc.PaddleEvent, rawBody []byte) (bool, error) {
	if m.ProcessEventFn != nil {
		return m.ProcessEventFn(ctx, event, rawBody)
	}
	return false, nil
}

// paddleSignatureHeader returns a valid Paddle-Signature header value.
// HMAC message: ts + ":" + string(body).
func paddleSignatureHeader(secret []byte, body []byte, ts string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(ts + ":" + string(body)))
	sig := fmt.Sprintf("%x", mac.Sum(nil))
	return "ts=" + ts + ";h1=" + sig
}

// ── valid event body ──────────────────────────────────────────────────────────

const validEventBody = `{"event_id":"evt_001","event_type":"subscription.created","data":{}}`

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestWebhookHandler_Paddle_NoSecret_SkipsSignatureCheck(t *testing.T) {
	// nil paddleSecret → signature check skipped entirely → 200.
	h := handler.NewWebhookHandler(&mockBillingService{}, nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(validEventBody))
	h.Paddle(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

func TestWebhookHandler_Paddle_ValidSignature(t *testing.T) {
	secret := []byte("webhook-secret")
	ts := "1700000000"
	body := []byte(validEventBody)
	h := handler.NewWebhookHandler(&mockBillingService{}, secret)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(string(body)))
	req.Header.Set("Paddle-Signature", paddleSignatureHeader(secret, body, ts))
	h.Paddle(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

func TestWebhookHandler_Paddle_InvalidSignature(t *testing.T) {
	secret := []byte("webhook-secret")
	h := handler.NewWebhookHandler(&mockBillingService{}, secret)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(validEventBody))
	req.Header.Set("Paddle-Signature", "ts=1700000000;h1=badhash")
	h.Paddle(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}

func TestWebhookHandler_Paddle_MalformedJSON(t *testing.T) {
	h := handler.NewWebhookHandler(&mockBillingService{}, nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{bad`))
	h.Paddle(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestWebhookHandler_Paddle_ValidJSONEmptyEventID(t *testing.T) {
	// Handler checks event.EventID == "" after unmarshal → 400.
	h := handler.NewWebhookHandler(&mockBillingService{}, nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"event_id":"","event_type":"foo","data":{}}`))
	h.Paddle(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestWebhookHandler_Paddle_AlreadyProcessed(t *testing.T) {
	h := handler.NewWebhookHandler(&mockBillingService{
		ProcessEventFn: func(_ context.Context, _ billingsvc.PaddleEvent, _ []byte) (bool, error) {
			return true, nil // alreadyProcessed = true
		},
	}, nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(validEventBody))
	h.Paddle(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	var resp map[string]string
	decodeJSON(t, rec, &resp)
	if resp["status"] != "already processed" {
		t.Errorf("got status %q, want %q", resp["status"], "already processed")
	}
}

func TestWebhookHandler_Paddle_ServiceError(t *testing.T) {
	h := handler.NewWebhookHandler(&mockBillingService{
		ProcessEventFn: func(_ context.Context, _ billingsvc.PaddleEvent, _ []byte) (bool, error) {
			return false, errors.New("db error")
		},
	}, nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(validEventBody))
	h.Paddle(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}
```

- [ ] **Step 2: Run the tests**

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go test ./internal/api/handler/... -run TestWebhookHandler -v 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 3: Run the full suite**

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go test ./internal/api/handler/...
```
Expected: `ok github.com/nyasha-hama/burnout-predictor-api/internal/api/handler`

- [ ] **Step 4: Commit**

```bash
git add internal/api/handler/webhook_test.go
git commit -m "test(handler): add webhook handler unit tests"
```

---

## Final verification

After all 11 tasks:

```bash
cd /home/nyasha-hama/projects/burnout-predictor/backend && go test ./...
```
Expected: all packages pass, zero failures.
