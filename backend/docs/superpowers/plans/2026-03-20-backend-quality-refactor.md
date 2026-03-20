# Backend Quality Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 concrete backend quality gaps to bring the Go API to unambiguous senior level: structured logging, request IDs, duplicate score logic, coupled respond layer, rate limiter goroutine leak, validation duplication, missing Retry-After header, and stale dependencies.

**Architecture:** All changes are refactors within existing layers. No new features. slog is injected via constructors into each service. HTTPError decouples the respond layer from service packages. A new `requestid.go` middleware file handles request ID propagation. `NewServer` gains a `ctx` parameter to fix the rate limiter goroutine leak.

**Tech Stack:** Go 1.22, chi v5, pgx/v5, sqlc, JWT, slog (stdlib since Go 1.21)

**Spec:** `docs/superpowers/specs/2026-03-20-backend-quality-refactor-design.md`

---

## File Map

**New files:**
- `internal/reqid/reqid.go` — shared request ID context key + helpers (imported by middleware and services; avoids layer violation)
- `internal/reqid/reqid_test.go`
- `internal/api/middleware/requestid.go` — `RequestID()` middleware (imports `reqid`)
- `internal/api/middleware/requestid_test.go`
- `internal/api/middleware/ratelimit_test.go`
- `internal/api/respond/respond_test.go`

**Modified files:**
- `go.mod` / `go.sum` — dependency version bumps
- `cmd/server/config.go` — slog + `os.Exit(1)`, add `"os"` import, remove `"log"` import
- `cmd/server/main.go` — slog setup, logger injection, `NewServer(ctx, cfg)`
- `internal/api/server.go` — `NewServer(ctx, cfg)` signature, logger injection, `RateLimit(ctx, ...)`
- `internal/api/respond/respond.go` — `HTTPError` interface, `errors.As` in `ServiceError`, drop service imports
- `internal/api/middleware/ratelimit.go` — ctx param, `Retry-After` header, `strconv` import
- `internal/service/auth/errors.go` — `authError` typed struct with `HTTPStatus()`
- `internal/service/auth/service.go` — slog injection + `reqid` in log calls, replace manual password check
- `internal/service/checkin/errors.go` — `checkinError` typed struct with `HTTPStatus()`
- `internal/service/checkin/service.go` — slog injection + `reqid` in log calls, `BuildScoreInput` fix
- `internal/service/insight/errors.go` — `insightError` typed struct with `HTTPStatus()`
- `internal/service/notification/service.go` — slog injection + `reqid` in log calls
- `internal/service/billing/service.go` — slog injection + `reqid` in log calls

**Not modified:** `internal/service/insight/service.go` (no log calls — YAGNI), `internal/worker/scheduler.go` (no log calls)

---

## Task 1: Update Dependencies

**Files:**
- Modify: `go.mod`, `go.sum`

- [ ] **Step 1: Update each dependency to latest stable**

Run from `backend/`:
```bash
go get github.com/go-chi/chi/v5@v5.2.1
go get github.com/jackc/pgx/v5@v5.7.2
go get golang.org/x/crypto@v0.37.0
go get github.com/golang-jwt/jwt/v5@v5.2.2
go mod tidy
```

- [ ] **Step 2: Verify build and tests pass**

```bash
go build ./...
go test ./...
```
Expected: zero errors, all existing score engine tests pass.

- [ ] **Step 3: Commit**

```bash
git add go.mod go.sum
git commit -m "chore(deps): update chi, pgx, crypto, jwt to latest stable"
```

---

## Task 2: HTTPError Interface + Decouple `respond`

This task converts sentinel errors from opaque `errors.New` values to typed structs that carry their own HTTP status. After this task, `respond.ServiceError` imports zero service packages.

**Files:**
- Modify: `internal/api/respond/respond.go`
- Modify: `internal/service/auth/errors.go`
- Modify: `internal/service/checkin/errors.go`
- Modify: `internal/service/insight/errors.go`
- Create: `internal/api/respond/respond_test.go`

- [ ] **Step 1: Write failing tests for `ServiceError`**

Create `internal/api/respond/respond_test.go`:
```go
package respond_test

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
)

// testHTTPError implements respond.HTTPError without importing any service package.
type testHTTPError struct {
	msg    string
	status int
}

func (e testHTTPError) Error() string   { return e.msg }
func (e testHTTPError) HTTPStatus() int { return e.status }

func TestServiceError_KnownHTTPError(t *testing.T) {
	w := httptest.NewRecorder()
	respond.ServiceError(w, testHTTPError{"conflict", http.StatusConflict})
	if w.Code != http.StatusConflict {
		t.Errorf("expected 409, got %d", w.Code)
	}
}

func TestServiceError_WrappedHTTPError(t *testing.T) {
	w := httptest.NewRecorder()
	wrapped := fmt.Errorf("outer: %w", testHTTPError{"bad request", http.StatusBadRequest})
	respond.ServiceError(w, wrapped)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestServiceError_UnknownError_Returns500(t *testing.T) {
	w := httptest.NewRecorder()
	respond.ServiceError(w, errors.New("some unexpected internal error"))
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", w.Code)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/api/respond/...
```
Expected: compilation error — `respond.HTTPError` does not exist yet.

- [ ] **Step 3: Define `HTTPError` interface and update `ServiceError` in `respond.go`**

Replace the entire contents of `internal/api/respond/respond.go`:
```go
// Package respond provides helpers for writing consistent JSON responses.
package respond

import (
	"encoding/json"
	"errors"
	"net/http"
)

// HTTPError is implemented by service sentinel errors to declare their own HTTP status.
// Services implement this on their error types; respond imports no service packages.
type HTTPError interface {
	error
	HTTPStatus() int
}

// JSON writes v as JSON with the given status code.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// Error writes a JSON error body.
func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, map[string]string{"error": msg})
}

// ServiceError maps service errors to HTTP responses.
// Errors implementing HTTPError declare their own status code.
// All other errors return 500.
func ServiceError(w http.ResponseWriter, err error) {
	var he HTTPError
	if errors.As(err, &he) {
		Error(w, he.HTTPStatus(), he.Error())
		return
	}
	Error(w, http.StatusInternalServerError, "internal server error")
}
```

- [ ] **Step 4: Run tests — expect them to fail at the compilation stage due to service imports still in old errors**

```bash
go build ./...
```
This will fail because the old service error types (`authsvc.ErrEmailInUse`, etc.) are no longer handled in `ServiceError`. That is expected — we now fix the error types.

- [ ] **Step 5: Convert `auth` sentinel errors to typed struct**

Replace the entire contents of `internal/service/auth/errors.go`:
```go
package auth

import "net/http"

type authError struct {
	msg    string
	status int
}

func (e authError) Error() string   { return e.msg }
func (e authError) HTTPStatus() int { return e.status }

var (
	ErrEmailInUse           = authError{"email already in use", http.StatusConflict}
	ErrInvalidCredentials   = authError{"invalid credentials", http.StatusUnauthorized}
	ErrInvalidToken         = authError{"invalid or expired token", http.StatusBadRequest}
	ErrEmailAlreadyVerified = authError{"email already verified", http.StatusConflict}
	ErrEmailServiceDisabled = authError{"email service unavailable", http.StatusServiceUnavailable}
)
```

- [ ] **Step 6: Convert `checkin` sentinel error to typed struct**

Replace the entire contents of `internal/service/checkin/errors.go`:
```go
package checkin

import "net/http"

type checkinError struct {
	msg    string
	status int
}

func (e checkinError) Error() string   { return e.msg }
func (e checkinError) HTTPStatus() int { return e.status }

var (
	ErrInvalidStress = checkinError{"stress must be 1-5", http.StatusBadRequest}
)
```

- [ ] **Step 7: Convert `insight` sentinel error to typed struct**

Replace the entire contents of `internal/service/insight/errors.go`:
```go
package insight

import "net/http"

type insightError struct {
	msg    string
	status int
}

func (e insightError) Error() string   { return e.msg }
func (e insightError) HTTPStatus() int { return e.status }

var (
	ErrInvalidComponent = insightError{"component_key is required", http.StatusBadRequest}
)
```

- [ ] **Step 8: Build and run all tests**

```bash
go build ./...
go test ./...
```
Expected: build passes, all tests pass. The `respond_test.go` tests should now pass.

- [ ] **Step 9: Commit**

```bash
git add internal/api/respond/ internal/service/auth/errors.go internal/service/checkin/errors.go internal/service/insight/errors.go
git commit -m "refactor(respond): decouple ServiceError via HTTPError interface"
```

---

## Task 3: Structured Logging with `slog`

Replace all `log.Printf` / `log.Fatal` / `log.Println` with `*slog.Logger`. The logger is created once in `main.go` and injected into each service constructor. `config.go` uses `slog.Default()`.

**Files:**
- Modify: `cmd/server/config.go`
- Modify: `cmd/server/main.go`
- Modify: `internal/api/server.go`
- Modify: `internal/service/auth/service.go`
- Modify: `internal/service/checkin/service.go`
- Modify: `internal/service/notification/service.go`
- Modify: `internal/service/billing/service.go`

Note: `internal/service/insight/service.go` has **no** log calls and receives no logger — YAGNI.

**Request ID enrichment:** Every `s.log.ErrorContext` / `s.log.WarnContext` call in a service should include `"request_id", reqid.FromCtx(ctx)` as the first key-value attribute pair. This surfaces the trace ID in every log line. Add `"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"` to the import block of each service file you modify. The context passed to these helpers is the request context (from the method signature), so `reqid.FromCtx(ctx)` will return the ID when called from an HTTP request path, and an empty string for background goroutines (which is correct).

- [ ] **Step 1: Update `config.go`**

Replace the import block and fatal calls. Full new file:
```go
package main

import (
	"log/slog"
	"os"
)

// Config holds all configuration loaded from environment variables.
type Config struct {
	DatabaseURL  string
	JWTSecret    string
	Port         string
	ResendAPIKey string
	EmailFrom    string
	OpenAIAPIKey string
	PaddleSecret string
	AppURL       string
	CORSOrigin   string
}

// Load reads configuration from environment variables. Fatal if required vars are missing.
func Load() Config {
	cfg := Config{
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		JWTSecret:    os.Getenv("JWT_SECRET"),
		Port:         os.Getenv("PORT"),
		ResendAPIKey: os.Getenv("RESEND_API_KEY"),
		EmailFrom:    os.Getenv("EMAIL_FROM"),
		OpenAIAPIKey: os.Getenv("OPENAI_API_KEY"),
		PaddleSecret: os.Getenv("PADDLE_WEBHOOK_SECRET"),
		AppURL:       os.Getenv("APP_URL"),
		CORSOrigin:   os.Getenv("CORS_ORIGIN"),
	}
	if cfg.DatabaseURL == "" {
		slog.Default().Error("DATABASE_URL is required")
		os.Exit(1)
	}
	if cfg.JWTSecret == "" {
		slog.Default().Error("JWT_SECRET is required")
		os.Exit(1)
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	if cfg.EmailFrom == "" {
		cfg.EmailFrom = "Overload <noreply@overload.app>"
	}
	if cfg.AppURL == "" {
		cfg.AppURL = "https://overload.app"
	}
	return cfg
}
```

- [ ] **Step 2: Add `log *slog.Logger` to `auth.Service`**

In `internal/service/auth/service.go`:

Add `"log/slog"` to the imports.

Update the `Service` struct:
```go
type Service struct {
	store  authStore
	secret []byte
	email  *eml.Client
	appURL string
	log    *slog.Logger
}
```

Update the constructor:
```go
func New(store authStore, secret []byte, emailClient *eml.Client, appURL string, log *slog.Logger) *Service {
	return &Service{store: store, secret: secret, email: emailClient, appURL: appURL, log: log}
}
```

Replace all `log.Printf(...)` calls. There are 7 of them in the private helpers — exact replacements:

Add `"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"` to the imports.

In `sendWelcomeEmail`:
```go
// Before:
if _, err := s.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html}); err != nil {
    log.Printf("auth: welcome email to %s: %v", to, err)
}
// After:
if _, err := s.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html}); err != nil {
    s.log.WarnContext(ctx, "welcome email failed", "request_id", reqid.FromCtx(ctx), "to", to, "err", err)
}
```

In `sendVerificationEmail`:
```go
// Before (gen verify token):
log.Printf("auth: gen verify token: %v", err)
// After:
s.log.ErrorContext(ctx, "gen verify token", "request_id", reqid.FromCtx(ctx), "err", err)

// Before (store verify token):
log.Printf("auth: store verify token for %s: %v", to, err)
// After:
s.log.ErrorContext(ctx, "store verify token", "request_id", reqid.FromCtx(ctx), "to", to, "err", err)

// Before (send verify email):
if _, err := s.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html}); err != nil {
    log.Printf("auth: verify email to %s: %v", to, err)
}
// After:
if _, err := s.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html}); err != nil {
    s.log.WarnContext(ctx, "verify email failed", "request_id", reqid.FromCtx(ctx), "to", to, "err", err)
}
```

In `sendPasswordResetEmail`:
```go
// Before (gen reset token):
log.Printf("auth: gen reset token: %v", err)
// After:
s.log.ErrorContext(ctx, "gen reset token", "request_id", reqid.FromCtx(ctx), "err", err)

// Before (store reset token):
log.Printf("auth: store reset token for %s: %v", to, err)
// After:
s.log.ErrorContext(ctx, "store reset token", "request_id", reqid.FromCtx(ctx), "to", to, "err", err)

// Before (send reset email):
if _, err := s.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html}); err != nil {
    log.Printf("auth: reset email to %s: %v", to, err)
}
// After:
if _, err := s.email.Send(ctx, eml.Params{To: to, Subject: subject, HTML: html}); err != nil {
    s.log.WarnContext(ctx, "reset email failed", "request_id", reqid.FromCtx(ctx), "to", to, "err", err)
}
```

Remove `"log"` from the imports block.

- [ ] **Step 3: Add `log *slog.Logger` to `checkin.Service`**

In `internal/service/checkin/service.go`:

Add `"log/slog"` to imports.

Update struct:
```go
type Service struct {
	store checkinStore
	ai    *ai.Client
	log   *slog.Logger
}
```

Update constructor:
```go
func New(store checkinStore, aiClient *ai.Client, log *slog.Logger) *Service {
	return &Service{store: store, ai: aiClient, log: log}
}
```

Add `"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"` to the imports.

Replace the one `log.Printf` in `scheduleFollowUps`:
```go
// Before:
if err != nil {
    log.Printf("checkin: create follow-up for %s: %v", userID, err)
}
// After:
if err != nil {
    s.log.ErrorContext(ctx, "create follow-up failed", "request_id", reqid.FromCtx(ctx), "user_id", userID, "err", err)
}
```

Remove `"log"` from imports.

- [ ] **Step 4: Add `log *slog.Logger` to `notification.Service`**

In `internal/service/notification/service.go`:

Add `"log/slog"` to imports.

Update struct:
```go
type Service struct {
	store notificationStore
	email *eml.Client
	ai    *ai.Client
	log   *slog.Logger
}
```

Update constructor:
```go
func New(store notificationStore, emailClient *eml.Client, aiClient *ai.Client, log *slog.Logger) *Service {
	return &Service{store: store, email: emailClient, ai: aiClient, log: log}
}
```

Add `"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"` to the imports.

Replace all `log.Printf(...)` calls. These are called from background worker contexts, so `reqid.FromCtx(ctx)` will be empty — that is correct. Full replacements:

In `BackfillAIPlans`:
```go
s.log.ErrorContext(ctx, "ai backfill: list check-ins failed", "request_id", reqid.FromCtx(ctx), "err", err)
s.log.WarnContext(ctx, "ai backfill: generate plan failed", "request_id", reqid.FromCtx(ctx), "checkin_id", ci.ID, "err", err)
s.log.WarnContext(ctx, "ai backfill: store plan failed", "request_id", reqid.FromCtx(ctx), "checkin_id", ci.ID, "err", err)
```

In `RunMaintenance`:
```go
s.log.ErrorContext(ctx, "maintenance: expire follow-ups failed", "request_id", reqid.FromCtx(ctx), "err", err)
s.log.ErrorContext(ctx, "maintenance: list expired subscriptions failed", "request_id", reqid.FromCtx(ctx), "err", err)
s.log.ErrorContext(ctx, "maintenance: cancel subscription failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.PaddleSubscriptionID, "err", err)
s.log.ErrorContext(ctx, "maintenance: downgrade user failed", "request_id", reqid.FromCtx(ctx), "user_id", sub.Uid, "err", err)
```

In `sendCheckinReminders`, `sendStreakAlerts`, `sendMondayDebriefs`, `sendReEngagements` (each has one list error):
```go
s.log.ErrorContext(ctx, "reminder: list users failed", "request_id", reqid.FromCtx(ctx), "err", err)
s.log.ErrorContext(ctx, "streak alert: list users failed", "request_id", reqid.FromCtx(ctx), "err", err)
s.log.ErrorContext(ctx, "monday debrief: list users failed", "request_id", reqid.FromCtx(ctx), "err", err)
s.log.ErrorContext(ctx, "re-engage: list users failed", "request_id", reqid.FromCtx(ctx), "err", err)
```

In `send`:
```go
s.log.WarnContext(ctx, "email send failed", "request_id", reqid.FromCtx(ctx), "template", template, "to", to, "err", err)
```

Remove `"log"` from imports.

- [ ] **Step 5: Add `log *slog.Logger` to `billing.Service`**

In `internal/service/billing/service.go`:

Add `"log/slog"` and `"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"` to imports.

Update struct:
```go
type Service struct {
	store billingStore
	log   *slog.Logger
}
```

Update constructor:
```go
func New(store billingStore, log *slog.Logger) *Service {
	return &Service{store: store, log: log}
}
```

Replace all 5 `log.Printf(...)` calls:
```go
// In handleSubscriptionUpsert — resolve user:
s.log.ErrorContext(ctx, "sub upsert: resolve user failed", "request_id", reqid.FromCtx(ctx), "customer_id", sub.CustomerID, "err", err)

// In handleSubscriptionUpsert — upsert subscription:
s.log.ErrorContext(ctx, "sub upsert: db failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.ID, "err", err)

// In handleSubscriptionCancelled:
s.log.ErrorContext(ctx, "sub cancel: db failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.ID, "err", err)

// In handleSubscriptionPaused:
s.log.ErrorContext(ctx, "sub pause: set past due failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.ID, "err", err)

// In handleTransactionCompleted:
s.log.ErrorContext(ctx, "txn: resolve user failed", "request_id", reqid.FromCtx(ctx), "customer_id", txn.CustomerID, "err", err)
```

Remove `"log"` from imports.

- [ ] **Step 6: Update `server.go` to inject logger into services**

In `internal/api/server.go`:

Add `"log/slog"` to imports.

Update `ServerConfig` to include the logger:
```go
type ServerConfig struct {
	Queries      *db.Queries
	Pool         *pgxpool.Pool
	JWTSecret    string
	EmailClient  *eml.Client
	AIClient     *ai.Client
	PaddleSecret string
	AppURL       string
	CORSOrigin   string
	StartTime    time.Time
	Logger       *slog.Logger
}
```

Update the service instantiation at the top of `NewServer`:
```go
log := cfg.Logger
if log == nil {
    log = slog.Default()
}

authService := authsvc.New(pg, []byte(cfg.JWTSecret), cfg.EmailClient, cfg.AppURL, log)
checkinService := checkinsvc.New(pg, cfg.AIClient, log)
insightService := insightsvc.New(pg)
billingService := billingsvc.New(pg, log)
```

- [ ] **Step 7: Update `main.go` — setup slog and inject logger**

In `cmd/server/main.go`:

Add `"log/slog"` and `"os"` to imports. Remove `"log"`.

At the very start of `main()`, before `cfg := Load()`:
```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
slog.SetDefault(logger)
```

Replace all `log.*` calls in `main.go`:
```go
// Before:
log.Fatalf("connect db: %v", err)
// After:
slog.Default().Error("connect db", "err", err)
os.Exit(1)

// Before:
log.Fatalf("ping db: %v", err)
// After:
slog.Default().Error("ping db", "err", err)
os.Exit(1)

// Before:
log.Println("email: Resend enabled")
// After:
slog.Default().Info("email enabled", "provider", "resend")

// Before:
log.Println("email: disabled")
// After:
slog.Default().Info("email disabled")

// Before:
log.Println("ai: OpenAI enabled")
// After:
slog.Default().Info("ai enabled", "provider", "openai")

// Before:
log.Println("ai: disabled")
// After:
slog.Default().Info("ai disabled")

// Before:
log.Println("paddle: webhook signature check disabled")
// After:
slog.Default().Warn("paddle webhook signature check disabled")

// Before:
log.Printf("listening on :%s", cfg.Port)
// After:
slog.Default().Info("listening", "port", cfg.Port)

// Before:
if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
    log.Fatalf("listen: %v", err)
}
// After:
if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
    slog.Default().Error("listen", "err", err)
    os.Exit(1)
}

// Before:
log.Println("shutting down")
// After:
slog.Default().Info("shutting down")

// Before:
log.Printf("shutdown: %v", err)
// After:
slog.Default().Error("shutdown", "err", err)

// Before:
log.Println("server stopped")
// After:
slog.Default().Info("server stopped")
```

Update the `notifSvc` construction to pass logger:
```go
notifSvc := notificationsvc.New(pg, emailClient, aiClient, logger)
```

Update `api.NewServer` call to include logger:
```go
srv := &http.Server{
    Addr: ":" + cfg.Port,
    Handler: api.NewServer(ctx, api.ServerConfig{
        Queries:      queries,
        Pool:         pool,
        JWTSecret:    cfg.JWTSecret,
        EmailClient:  emailClient,
        AIClient:     aiClient,
        PaddleSecret: cfg.PaddleSecret,
        AppURL:       cfg.AppURL,
        CORSOrigin:   cfg.CORSOrigin,
        StartTime:    startTime,
        Logger:       logger,
    }),
}
```

Note: `NewServer` signature change (`ctx` param) is in Task 6 — for now the build will fail at this call site. That's fine; Tasks 3 and 6 will be committed together after Task 6 is complete. Alternatively, do Task 6 Step 1 (signature change) before Step 7 here. **Recommended order: complete Task 6 Step 1 first, then come back to this step.**

- [ ] **Step 8: Verify build**

```bash
go build ./...
```
Expected: passes. If there are unused import errors, remove the stale `"log"` imports.

- [ ] **Step 9: Run full test suite**

```bash
go test ./...
```
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add cmd/server/ internal/api/server.go internal/service/auth/service.go internal/service/checkin/service.go internal/service/notification/service.go internal/service/billing/service.go
git commit -m "feat(logging): replace log.Printf with structured slog throughout"
```

---

## Task 4: Request ID — `reqid` Package + Middleware

Two parts: (a) a shared `internal/reqid` package that holds the context key, importable by both middleware and service packages without a layer violation; (b) the middleware that sets it.

**Files:**
- Create: `internal/reqid/reqid.go`
- Create: `internal/reqid/reqid_test.go`
- Create: `internal/api/middleware/requestid.go`
- Create: `internal/api/middleware/requestid_test.go`
- Modify: `internal/api/server.go`

- [ ] **Step 1: Write tests for `reqid` package**

Create `internal/reqid/reqid_test.go`:
```go
package reqid_test

import (
	"context"
	"testing"

	"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"
)

func TestSetAndFromCtx(t *testing.T) {
	ctx := reqid.Set(context.Background(), "test-id-123")
	got := reqid.FromCtx(ctx)
	if got != "test-id-123" {
		t.Errorf("expected test-id-123, got %q", got)
	}
}

func TestFromCtx_EmptyWhenNotSet(t *testing.T) {
	got := reqid.FromCtx(context.Background())
	if got != "" {
		t.Errorf("expected empty, got %q", got)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/reqid/...
```
Expected: compilation error — package doesn't exist yet.

- [ ] **Step 3: Implement `reqid.go`**

Create `internal/reqid/reqid.go`:
```go
// Package reqid provides request ID storage and retrieval via context.
// Both HTTP middleware and service packages import this package to avoid
// a service→middleware layer violation.
package reqid

import "context"

type keyType struct{}

var key keyType

// Set returns a new context with the given request ID stored.
func Set(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, key, id)
}

// FromCtx returns the request ID stored in ctx, or an empty string if not set.
func FromCtx(ctx context.Context) string {
	id, _ := ctx.Value(key).(string)
	return id
}
```

- [ ] **Step 4: Run tests**

```bash
go test ./internal/reqid/...
```
Expected: PASS.

- [ ] **Step 5: Write failing tests for the middleware**

Create `internal/api/middleware/requestid_test.go`:
```go
package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"
)

func TestRequestID_GeneratesIDWhenAbsent(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()

	var capturedID string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedID = reqid.FromCtx(r.Context())
	})

	middleware.RequestID()(next).ServeHTTP(w, req)

	if capturedID == "" {
		t.Error("expected request ID to be set in context")
	}
	if w.Header().Get("X-Request-ID") == "" {
		t.Error("expected X-Request-ID response header to be set")
	}
	if w.Header().Get("X-Request-ID") != capturedID {
		t.Errorf("header %q != context value %q", w.Header().Get("X-Request-ID"), capturedID)
	}
}

func TestRequestID_PropagatesIncomingID(t *testing.T) {
	existing := "upstream-trace-abc123"
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Request-ID", existing)
	w := httptest.NewRecorder()

	var capturedID string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedID = reqid.FromCtx(r.Context())
	})

	middleware.RequestID()(next).ServeHTTP(w, req)

	if capturedID != existing {
		t.Errorf("expected %q, got %q", existing, capturedID)
	}
	if w.Header().Get("X-Request-ID") != existing {
		t.Errorf("expected response header %q, got %q", existing, w.Header().Get("X-Request-ID"))
	}
}
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
go test ./internal/api/middleware/...
```
Expected: compilation error — `middleware.RequestID` doesn't exist yet.

- [ ] **Step 7: Implement `requestid.go`**

Create `internal/api/middleware/requestid.go`:
```go
package middleware

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"
)

// RequestID returns a middleware that reads X-Request-ID from the incoming request
// (or generates one if absent), stores it via reqid.Set, and echoes it in the response.
func RequestID() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get("X-Request-ID")
			if id == "" {
				id = uuid.New().String()
			}
			w.Header().Set("X-Request-ID", id)
			next.ServeHTTP(w, r.WithContext(reqid.Set(r.Context(), id)))
		})
	}
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
go test ./internal/api/middleware/... ./internal/reqid/...
```
Expected: PASS.

- [ ] **Step 9: Register middleware in `server.go`**

In `internal/api/server.go`, update the middleware chain at the top of `NewServer` to register `RequestID()` first:
```go
r := chi.NewRouter()
r.Use(middleware.RequestID())  // ← add this as the first Use call
r.Use(chimw.Logger)
r.Use(chimw.Recoverer)
r.Use(chimw.Timeout(30 * time.Second))
r.Use(corsMiddleware(corsOrigin))
```

- [ ] **Step 10: Build and test**

```bash
go build ./...
go test ./...
```
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add internal/reqid/ internal/api/middleware/requestid.go internal/api/middleware/requestid_test.go internal/api/server.go
git commit -m "feat(middleware): add request ID propagation via X-Request-ID header"
```

---

## Task 5: Fix `BuildScoreInput` Duplication in `Upsert`

`checkin.Upsert` builds `score.Input` inline instead of calling `BuildScoreInput`, which already exists in the same file for this exact purpose.

**Files:**
- Modify: `internal/service/checkin/service.go`

- [ ] **Step 1: Run existing tests before the change (baseline)**

```bash
go test ./internal/score/... ./internal/service/checkin/...
```
Expected: PASS. Confirm baseline is green.

- [ ] **Step 2: Replace the inline block in `Upsert`**

In `internal/service/checkin/service.go`, in the `Upsert` method, find and replace the inline block that builds `recentStresses` and `in`. It currently looks like this:

```go
// Exclude today from recent — it's being replaced now.
recentStresses := make([]int, 0, len(recent))
for _, c := range recent {
    if c.CheckedInDate.Time.Equal(today) {
        continue
    }
    recentStresses = append(recentStresses, int(c.Stress))
}

var estScore *int
if user.EstimatedScore.Valid {
    v := int(user.EstimatedScore.Int16)
    estScore = &v
}

in := score.Input{
    TodayStress:    &req.Stress,
    Role:           score.Role(user.Role),
    SleepBaseline:  score.SleepBaseline(user.SleepBaseline),
    RecentStresses: recentStresses,
    EstimatedScore: estScore,
    MeetingCount:   -1,
}
```

Replace it with:
```go
in := BuildScoreInput(user, recent, &req.Stress, today)
```

Then find the `BuildScoreExplanation` call further down in `Upsert` — it references `recentStresses` which no longer exists:
```go
// Before:
Explanation: score.BuildScoreExplanation(score.ExplanationInput{
    Score:                 out.Score,
    TodayStress:           &req.Stress,
    ConsecutiveDangerDays: int(danger),
    RecentStresses:        recentStresses,
}),

// After:
Explanation: score.BuildScoreExplanation(score.ExplanationInput{
    Score:                 out.Score,
    TodayStress:           &req.Stress,
    ConsecutiveDangerDays: int(danger),
    RecentStresses:        in.RecentStresses,
}),
```

- [ ] **Step 3: Build and run tests**

```bash
go build ./...
go test ./...
```
Expected: PASS. If there's a "declared and not used" error for `recentStresses`, you missed replacing one reference — check the `BuildScoreExplanation` call.

- [ ] **Step 4: Commit**

```bash
git add internal/service/checkin/service.go
git commit -m "refactor(checkin): use BuildScoreInput in Upsert, remove inline duplicate"
```

---

## Task 6: Rate Limiter Goroutine Leak Fix + `NewServer` Context + `Retry-After` Header

Three changes in one task because they all touch the rate limiter and `NewServer` signature together.

**Files:**
- Modify: `internal/api/middleware/ratelimit.go`
- Modify: `internal/api/server.go`
- Modify: `cmd/server/main.go`
- Create: `internal/api/middleware/ratelimit_test.go`

- [ ] **Step 1: Write failing test for `Retry-After` header**

Create `internal/api/middleware/ratelimit_test.go`:
```go
package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
)

func TestRateLimit_AllowsFirstRequest(t *testing.T) {
	ctx := context.Background()
	mw := middleware.RateLimit(ctx, 2, time.Minute)
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("first request should pass, got %d", w.Code)
	}
}

func TestRateLimit_BlocksAfterLimit(t *testing.T) {
	ctx := context.Background()
	mw := middleware.RateLimit(ctx, 1, time.Minute)
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// First request — allowed.
	req1 := httptest.NewRequest(http.MethodGet, "/", nil)
	w1 := httptest.NewRecorder()
	handler.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("first request should pass, got %d", w1.Code)
	}

	// Second request — rate limited.
	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req2)
	if w2.Code != http.StatusTooManyRequests {
		t.Fatalf("second request should be blocked, got %d", w2.Code)
	}
	if w2.Header().Get("Retry-After") != "60" {
		t.Errorf("expected Retry-After: 60, got %q", w2.Header().Get("Retry-After"))
	}
}

func TestRateLimit_CtxCancelStopsCleanup(t *testing.T) {
	// Verify the goroutine exits cleanly — no panic, no hang.
	ctx, cancel := context.WithCancel(context.Background())
	middleware.RateLimit(ctx, 10, time.Minute)
	cancel() // Should stop the cleanup goroutine.
	// If this test hangs, the goroutine is not respecting ctx.Done().
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/api/middleware/...
```
Expected: compilation error — `RateLimit` doesn't accept a `ctx` parameter yet.

- [ ] **Step 3: Update `ratelimit.go`**

Replace the entire `internal/api/middleware/ratelimit.go`:
```go
package middleware

import (
	"context"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
)

type rateLimiter struct {
	mu      sync.Mutex
	windows map[string]*rlWindow
	max     int
	period  time.Duration
}

type rlWindow struct {
	count   int
	resetAt time.Time
}

func newRateLimiter(ctx context.Context, max int, period time.Duration) *rateLimiter {
	rl := &rateLimiter{
		windows: make(map[string]*rlWindow),
		max:     max,
		period:  period,
	}
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				rl.cleanup()
			case <-ctx.Done():
				return
			}
		}
	}()
	return rl
}

func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	w, ok := rl.windows[ip]
	if !ok || now.After(w.resetAt) {
		rl.windows[ip] = &rlWindow{count: 1, resetAt: now.Add(rl.period)}
		return true
	}
	if w.count >= rl.max {
		return false
	}
	w.count++
	return true
}

func (rl *rateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	for k, w := range rl.windows {
		if now.After(w.resetAt) {
			delete(rl.windows, k)
		}
	}
}

// RateLimit returns a Chi middleware that limits requests per IP.
// The cleanup goroutine exits when ctx is cancelled.
func RateLimit(ctx context.Context, max int, window time.Duration) func(http.Handler) http.Handler {
	rl := newRateLimiter(ctx, max, window)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !rl.allow(realIP(r)) {
				w.Header().Set("Retry-After", strconv.Itoa(int(window.Seconds())))
				respond.Error(w, http.StatusTooManyRequests, "too many requests — try again in a minute")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func realIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		for i := 0; i < len(xff); i++ {
			if xff[i] == ',' {
				return xff[:i]
			}
		}
		return xff
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	addr := r.RemoteAddr
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[:i]
		}
	}
	return addr
}
```

- [ ] **Step 4: Update `NewServer` signature in `server.go`**

In `internal/api/server.go`:

Add `"context"` to the imports.

Change the function signature:
```go
// Before:
func NewServer(cfg ServerConfig) http.Handler {

// After:
func NewServer(ctx context.Context, cfg ServerConfig) http.Handler {
```

Update the `RateLimit` call inside `NewServer`:
```go
// Before:
r.Use(middleware.RateLimit(20, time.Minute))

// After:
r.Use(middleware.RateLimit(ctx, 20, time.Minute))
```

- [ ] **Step 5: Update `main.go` call site**

In `cmd/server/main.go`, update the `api.NewServer` call (the `ctx` is already in scope from the signal context):
```go
// Before:
Handler: api.NewServer(api.ServerConfig{

// After:
Handler: api.NewServer(ctx, api.ServerConfig{
```

- [ ] **Step 6: Run tests**

```bash
go test ./internal/api/middleware/...
```
Expected: all three new rate limiter tests PASS.

- [ ] **Step 7: Full build and test**

```bash
go build ./...
go test ./...
```
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add internal/api/middleware/ratelimit.go internal/api/middleware/ratelimit_test.go internal/api/server.go cmd/server/main.go
git commit -m "fix(ratelimit): fix goroutine leak, add Retry-After header, pass ctx to NewServer"
```

---

## Task 7: Remove Password Validation Duplication

`auth.Service.ResetPassword` manually checks `len(req.Password) < 8` instead of calling the existing `validate.Password` function.

**Files:**
- Modify: `internal/service/auth/service.go`

- [ ] **Step 1: Add `validate` import and replace the manual check**

In `internal/service/auth/service.go`:

Add `"github.com/nyasha-hama/burnout-predictor-api/internal/api/validate"` to the imports.

Find in `ResetPassword`:
```go
if len(req.Password) < 8 {
    return fmt.Errorf("password must be at least 8 characters")
}
```

Replace with:
```go
if err := validate.Password(req.Password); err != nil {
    return err
}
```

- [ ] **Step 2: Build and test**

```bash
go build ./...
go test ./...
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add internal/service/auth/service.go
git commit -m "refactor(auth): use validate.Password in ResetPassword, remove duplicate check"
```

---

## Final Verification

- [ ] **Run the full suite one last time**

```bash
cd backend && go build ./... && go test ./... -v 2>&1 | tail -20
```
Expected: all tests pass, zero build errors.

- [ ] **Confirm no stale `"log"` imports remain**

```bash
grep -r '"log"' --include="*.go" internal/ cmd/
```
Expected: zero matches (the `"log"` stdlib package should be gone everywhere).

- [ ] **Confirm `respond.go` imports no service packages**

```bash
grep -n 'service/' internal/api/respond/respond.go
```
Expected: zero matches.
