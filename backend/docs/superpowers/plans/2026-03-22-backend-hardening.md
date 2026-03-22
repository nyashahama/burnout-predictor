# Backend Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Go backend to senior-engineer production quality — worker resilience, security hardening, data integrity, and service-layer test coverage.

**Architecture:** Nine focused tasks, each independently committable. Tasks 1–5 are pure code changes. Task 6 adds transaction support to billing. Tasks 7–9 add unit tests for the three untested service packages.

**Tech Stack:** Go 1.23, Chi v5, pgx/v5, sqlc, `net/http`, stdlib `testing` (no external test framework).

---

## Files touched

| File | Change |
|------|--------|
| `internal/worker/scheduler.go` | Add logger param, panic recovery, task timing |
| `internal/api/server.go` | Body size limit middleware + CORS warning |
| `internal/api/validate/validate.go` | Replace Email() with net/mail |
| `internal/api/validate/validate_test.go` | New email validation test cases |
| `internal/api/handler/followup.go` | Add logger, log MarkFollowUpSurfaced error |
| `internal/service/billing/service.go` | Add pool field, `withTx` helper, atomic handlers |
| `internal/service/billing/service_test.go` | New — unit tests with mocked store |
| `internal/service/auth/service_test.go` | New — unit tests with mocked store |
| `internal/service/checkin/service_test.go` | New — unit tests with mocked store |
| `cmd/server/main.go` | Pass logger to worker.Run; pass pool to billing.New |

---

## Task 1: Worker resilience — panic recovery and structured task logging

**Files:**
- Modify: `internal/worker/scheduler.go`
- Modify: `cmd/server/main.go` (pass logger)

**Context:** `worker.Run` calls `notif.RunMinutely`, `notif.BackfillAIPlans`, and `notif.RunMaintenance` synchronously. If any panics, the goroutine — and the entire notification system — dies silently forever. There is also no log to confirm tasks are running or measure duration.

- [ ] **Step 1: Update `worker.Run` signature and add the `runTask` helper**

Replace the entire content of `internal/worker/scheduler.go` with:

```go
// Package worker manages background task scheduling.
package worker

import (
	"context"
	"log/slog"
	"runtime/debug"
	"time"

	notificationsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/notification"
)

// Run starts the background worker loops and blocks until ctx is cancelled.
func Run(ctx context.Context, log *slog.Logger, notif *notificationsvc.Service) {
	minuteTicker := time.NewTicker(60 * time.Second)
	aiTicker := time.NewTicker(5 * time.Minute)
	hourlyTicker := time.NewTicker(time.Hour)
	defer minuteTicker.Stop()
	defer aiTicker.Stop()
	defer hourlyTicker.Stop()

	for {
		select {
		case <-minuteTicker.C:
			runTask(log, "minutely", func() { notif.RunMinutely(context.WithoutCancel(ctx)) })
		case <-aiTicker.C:
			runTask(log, "ai-backfill", func() { notif.BackfillAIPlans(context.WithoutCancel(ctx)) })
		case <-hourlyTicker.C:
			runTask(log, "maintenance", func() { notif.RunMaintenance(context.WithoutCancel(ctx)) })
		case <-ctx.Done():
			return
		}
	}
}

// runTask executes fn with panic recovery and start/end/duration logging.
// A panic does not kill the worker loop — it is logged and the loop continues.
func runTask(log *slog.Logger, name string, fn func()) {
	defer func() {
		if r := recover(); r != nil {
			log.Error("worker: task panicked", "task", name, "panic", r, "stack", string(debug.Stack()))
		}
	}()
	start := time.Now()
	log.Info("worker: task start", "task", name)
	fn()
	log.Info("worker: task done", "task", name, "duration_ms", time.Since(start).Milliseconds())
}
```

- [ ] **Step 2: Update `cmd/server/main.go` to pass the logger to `worker.Run`**

Find this line in `cmd/server/main.go`:
```go
go worker.Run(ctx, notifSvc)
```
Replace with:
```go
go worker.Run(ctx, logger, notifSvc)
```

- [ ] **Step 3: Build to confirm no compile errors**

```bash
go build ./...
```
Expected: no output (clean build).

- [ ] **Step 4: Commit**

```bash
git add internal/worker/scheduler.go cmd/server/main.go
git commit -m "feat(worker): add panic recovery and structured task timing logs"
```

---

## Task 2: HTTP body size limit middleware

**Files:**
- Modify: `internal/api/server.go`

**Context:** All endpoints except `/api/webhooks/paddle` accept unbounded request bodies via `json.NewDecoder(r.Body)`. An attacker can send a multi-GB body to exhaust memory. The fix is one middleware added to the global stack.

- [ ] **Step 1: Add the body limit to all non-webhook routes in `internal/api/server.go`**

The Paddle webhook endpoint is excluded because Paddle payloads can legitimately be large and a 413 response would trigger Paddle's retry system. Apply the limit to the health check and all API sub-router groups instead.

Find the health check registration (line ~81):
```go
	// Health check — no auth, no rate limit.
	r.Get("/health", healthHandler(cfg.Pool, cfg.StartTime))
```
Replace with:
```go
	// Health check — no auth, no rate limit.
	r.With(requestBodyLimit(1 << 20)).Get("/health", healthHandler(cfg.Pool, cfg.StartTime))
```

Find the public auth group (lines ~87–95):
```go
	// Public auth routes with per-IP rate limiting.
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimit(ctx, 20, time.Minute, false))
```
Replace with:
```go
	// Public auth routes with per-IP rate limiting.
	r.Group(func(r chi.Router) {
		r.Use(requestBodyLimit(1 << 20)) // 1 MB cap — excludes Paddle webhook
		r.Use(middleware.RateLimit(ctx, 20, time.Minute, false))
```

Find the authenticated routes group (lines ~98–99):
```go
	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(authMW)
```
Replace with:
```go
	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(requestBodyLimit(1 << 20)) // 1 MB cap — excludes Paddle webhook
		r.Use(authMW)
```

- [ ] **Step 2: Add the `requestBodyLimit` function at the bottom of `internal/api/server.go`**

Add after the `corsMiddleware` function:

```go
// requestBodyLimit caps incoming request bodies at the given byte limit using
// http.MaxBytesReader. Requests that exceed the limit receive 413 and the body
// reader returns an error, stopping decoder processing immediately.
func requestBodyLimit(limit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, limit)
			next.ServeHTTP(w, r)
		})
	}
}
```

- [ ] **Step 3: Build to confirm no compile errors**

```bash
go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add internal/api/server.go
git commit -m "feat(api): add 1 MB global request body limit middleware"
```

---

## Task 3: CORS — warn loudly when origin is not explicitly configured

**Files:**
- Modify: `internal/api/server.go`

**Context:** If `CORS_ORIGIN` is not set, the server silently opens all endpoints to any origin with `Access-Control-Allow-Origin: *`. This is a security risk in production. The fix logs a warning so operators notice. The server still starts (hard-failing would break local dev).

- [ ] **Step 1: Replace the silent CORS fallback with a logged warning**

Find this block in `internal/api/server.go` (lines 68–71):
```go
	corsOrigin := cfg.CORSOrigin
	if corsOrigin == "" {
		corsOrigin = "*"
	}
```

Replace with:
```go
	corsOrigin := cfg.CORSOrigin
	if corsOrigin == "" {
		corsOrigin = "*"
		log.Warn("CORS_ORIGIN not set — defaulting to wildcard (*). Set CORS_ORIGIN explicitly in production.")
	}
```

- [ ] **Step 2: Build**

```bash
go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add internal/api/server.go
git commit -m "fix(api): warn when CORS_ORIGIN is unset instead of silently defaulting to wildcard"
```

---

## Task 4: Fix email validation to use `net/mail`

**Files:**
- Modify: `internal/api/validate/validate.go`
- Modify: `internal/api/validate/validate_test.go`

**Context:** The current `Email()` function does a simple `@` + dot check that accepts `x@y`, `@.com`, and other invalid addresses. `net/mail.ParseAddress` applies RFC 5322 parsing and rejects these.

- [ ] **Step 1: Write the failing tests first**

Open `internal/api/validate/validate_test.go`. Add a new test function for Email (or extend the existing one). The test must cover addresses the current implementation accepts but shouldn't:

```go
func TestEmail(t *testing.T) {
	valid := []string{
		"user@example.com",
		"user+tag@sub.domain.org",
		"user.name@example.co.uk",
	}
	invalid := []string{
		"",
		"notanemail",
		"@nodomain.com",
		"x@y",            // no TLD — currently passes, must fail
		"missingat.com",
		"double@@example.com",
	}
	for _, e := range valid {
		if err := validate.Email(e); err != nil {
			t.Errorf("Email(%q) got error %v, want nil", e, err)
		}
	}
	for _, e := range invalid {
		if err := validate.Email(e); err == nil {
			t.Errorf("Email(%q) got nil, want error", e)
		}
	}
}
```

- [ ] **Step 2: Run the test to confirm `x@y` currently passes (i.e., the test fails)**

```bash
go test ./internal/api/validate/... -run TestEmail -v
```
Expected: FAIL — `Email("x@y") got nil, want error`

- [ ] **Step 3: Replace the Email function in `internal/api/validate/validate.go`**

Replace the current `Email` function (lines 21–30) and update the import block:

```go
import (
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"
)
```

```go
func Email(s string) error {
	if s == "" {
		return errors.New("email is required")
	}
	addr, err := mail.ParseAddress(s)
	if err != nil {
		return errors.New("invalid email address")
	}
	// ParseAddress accepts "Name <email>" — we only want bare addresses.
	if addr.Address != s {
		return errors.New("invalid email address")
	}
	// Require a dot in the domain part.
	at := strings.LastIndex(addr.Address, "@")
	if at < 0 || !strings.Contains(addr.Address[at+1:], ".") {
		return errors.New("email must have a domain with a dot")
	}
	return nil
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
go test ./internal/api/validate/... -run TestEmail -v
```
Expected: PASS

- [ ] **Step 5: Run all validate tests to confirm nothing regressed**

```bash
go test ./internal/api/validate/... -v
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add internal/api/validate/validate.go internal/api/validate/validate_test.go
git commit -m "fix(validate): replace custom email check with net/mail RFC 5322 parsing"
```

---

## Task 5: Log the `MarkFollowUpSurfaced` error in the follow-up handler

**Files:**
- Modify: `internal/api/handler/followup.go`
- Modify: `internal/api/server.go` (pass logger to NewFollowUpHandler)

**Context:** `followup.go:58` uses `_ = h.store.MarkFollowUpSurfaced(...)` — silently ignoring the error. If this fails, the follow-up resurfaces on every request. The handler has no logger; we add one.

- [ ] **Step 1: Add a `log` field to `FollowUpHandler` and update the constructor**

In `internal/api/handler/followup.go`, update the struct and constructor:

```go
import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
)

type FollowUpHandler struct {
	store followUpStore
	log   *slog.Logger
}

func NewFollowUpHandler(store followUpStore, log *slog.Logger) *FollowUpHandler {
	if log == nil {
		log = slog.Default()
	}
	return &FollowUpHandler{store: store, log: log}
}
```

- [ ] **Step 2: Replace the silent error with a logged warning in `GetToday`**

Replace:
```go
	if !fu.SurfacedAt.Valid {
		_ = h.store.MarkFollowUpSurfaced(r.Context(), db.MarkFollowUpSurfacedParams{
			ID:     fu.ID,
			UserID: user.ID,
		})
	}
```

With:
```go
	if !fu.SurfacedAt.Valid {
		if err := h.store.MarkFollowUpSurfaced(r.Context(), db.MarkFollowUpSurfacedParams{
			ID:     fu.ID,
			UserID: user.ID,
		}); err != nil {
			h.log.WarnContext(r.Context(), "follow-up: mark surfaced failed", "follow_up_id", fu.ID, "err", err)
		}
	}
```

- [ ] **Step 3: Update `NewFollowUpHandler` call in `internal/api/server.go`**

Find:
```go
	followUpH := handler.NewFollowUpHandler(pg)
```
Replace with:
```go
	followUpH := handler.NewFollowUpHandler(pg, log)
```

- [ ] **Step 4: Build**

```bash
go build ./...
```

- [ ] **Step 5: Run handler tests**

```bash
go test ./internal/api/handler/... -v
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add internal/api/handler/followup.go internal/api/server.go
git commit -m "fix(handler): log MarkFollowUpSurfaced error instead of silently discarding it"
```

---

## Task 6: Billing — make subscription + tier updates atomic

**Files:**
- Modify: `internal/service/billing/service.go`
- Modify: `internal/api/server.go` (pass pool to billing.New)

**Context:** `handleSubscriptionUpsert`, `handleSubscriptionCancelled`, and `handleSubscriptionPaused` each call two store methods that update different tables. If the first succeeds and the second fails, the database is inconsistent (subscription table and users.tier disagree). Wrapping both in a transaction prevents this.

The billing service gets a `*pgxpool.Pool` added so it can open transactions without exposing the pool everywhere.

- [ ] **Step 1: Add `pool` to billing.Service and update the constructor**

In `internal/service/billing/service.go`, update the import block and struct:

```go
import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"
)

type Service struct {
	store billingStore
	pool  *pgxpool.Pool
	log   *slog.Logger
}

func New(store billingStore, pool *pgxpool.Pool, log *slog.Logger) *Service {
	return &Service{store: store, pool: pool, log: log}
}
```

- [ ] **Step 2: Add the `withTx` helper to `service.go`**

Add this private method to the Service:

```go
// withTx runs fn inside a pgx transaction. Rolls back on any error.
// fn receives a *db.Queries bound to the transaction via db.New(tx).
// Note: sqlc generates *db.Queries (not a Querier interface) and db.New(tx) is the
// correct constructor for a transaction-bound querier.
func (s *Service) withTx(ctx context.Context, fn func(*db.Queries) error) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("billing: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op if already committed
	if err := fn(db.New(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
```

- [ ] **Step 3: Rewrite `handleSubscriptionUpsert` to use `withTx`**

Replace the current `handleSubscriptionUpsert` method:

```go
func (s *Service) handleSubscriptionUpsert(ctx context.Context, eventType string, sub paddleSubscriptionData) {
	user, err := s.resolveUserFromPaddleEvent(ctx, sub.CustomerID, sub.CustomData)
	if err != nil {
		s.log.ErrorContext(ctx, "sub upsert: resolve user failed", "request_id", reqid.FromCtx(ctx), "customer_id", sub.CustomerID, "err", err)
		return
	}

	if !user.PaddleCustomerID.Valid && sub.CustomerID != "" {
		if err := s.store.SetPaddleCustomerID(ctx, db.SetPaddleCustomerIDParams{
			ID:               user.ID,
			PaddleCustomerID: pgtype.Text{String: sub.CustomerID, Valid: true},
		}); err != nil {
			s.log.WarnContext(ctx, "sub upsert: set customer id failed", "request_id", reqid.FromCtx(ctx), "user_id", user.ID, "err", err)
		}
	}

	planName, currency, unitPriceCents := extractPlanDetails(sub)
	tier := tierFromStatus(sub.Status, planName)

	params := db.UpsertSubscriptionParams{
		UserID:               user.ID,
		PaddleSubscriptionID: sub.ID,
		PaddlePlanID:         planName,
		PlanName:             planName,
		Currency:             currency,
		UnitPriceCents:       pgtype.Int4{Int32: unitPriceCents, Valid: unitPriceCents > 0},
		Status:               sub.Status,
		CancelAtPeriodEnd:    sub.CancelledAt != nil,
		SeatCount:            1,
		LastEventType:        pgtype.Text{String: eventType, Valid: true},
		LastEventAt:          pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	if sub.CurrentBilling != nil {
		params.CurrentPeriodStart = pgtype.Timestamptz{Time: sub.CurrentBilling.StartsAt, Valid: true}
		params.CurrentPeriodEnd = pgtype.Timestamptz{Time: sub.CurrentBilling.EndsAt, Valid: true}
	}
	if sub.TrialDates != nil {
		params.TrialEndsAt = pgtype.Timestamptz{Time: sub.TrialDates.EndsAt, Valid: true}
	}

	if err := s.withTx(ctx, func(q *db.Queries) error {
		if _, err := q.UpsertSubscription(ctx, params); err != nil {
			return fmt.Errorf("upsert subscription: %w", err)
		}
		return q.SetUserTier(ctx, db.SetUserTierParams{ID: user.ID, Tier: tier})
	}); err != nil {
		s.log.ErrorContext(ctx, "sub upsert: transaction failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.ID, "err", err)
	}
}
```

- [ ] **Step 4: Rewrite `handleSubscriptionCancelled` to use `withTx`**

Replace with:

```go
func (s *Service) handleSubscriptionCancelled(ctx context.Context, sub paddleSubscriptionData) {
	shouldDowngradeNow := sub.CurrentBilling == nil || time.Now().After(sub.CurrentBilling.EndsAt)

	if !shouldDowngradeNow {
		// Subscription access still valid until period end; just mark cancelled.
		if err := s.store.CancelSubscription(ctx, sub.ID); err != nil {
			s.log.ErrorContext(ctx, "sub cancel: db failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.ID, "err", err)
		}
		return
	}

	user, err := s.resolveUserFromPaddleEvent(ctx, sub.CustomerID, sub.CustomData)
	if err != nil {
		s.log.ErrorContext(ctx, "sub cancel: resolve user failed", "request_id", reqid.FromCtx(ctx), "customer_id", sub.CustomerID, "err", err)
		// Still try to cancel the subscription record even without the user.
		if err := s.store.CancelSubscription(ctx, sub.ID); err != nil {
			s.log.ErrorContext(ctx, "sub cancel: db failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.ID, "err", err)
		}
		return
	}

	if err := s.withTx(ctx, func(q *db.Queries) error {
		if err := q.CancelSubscription(ctx, sub.ID); err != nil {
			return fmt.Errorf("cancel subscription: %w", err)
		}
		return q.SetUserTier(ctx, db.SetUserTierParams{ID: user.ID, Tier: "free"})
	}); err != nil {
		s.log.ErrorContext(ctx, "sub cancel: transaction failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.ID, "err", err)
	}
}
```

- [ ] **Step 5: Rewrite `handleSubscriptionPaused` to use `withTx`**

Replace with:

```go
func (s *Service) handleSubscriptionPaused(ctx context.Context, sub paddleSubscriptionData) {
	user, err := s.resolveUserFromPaddleEvent(ctx, sub.CustomerID, sub.CustomData)
	if err != nil {
		s.log.ErrorContext(ctx, "sub pause: resolve user failed", "request_id", reqid.FromCtx(ctx), "customer_id", sub.CustomerID, "err", err)
		// Still mark past due even if user lookup failed.
		if err := s.store.SetSubscriptionPastDue(ctx, sub.ID); err != nil {
			s.log.ErrorContext(ctx, "sub pause: set past due failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.ID, "err", err)
		}
		return
	}

	if err := s.withTx(ctx, func(q *db.Queries) error {
		if err := q.SetSubscriptionPastDue(ctx, sub.ID); err != nil {
			return fmt.Errorf("set past due: %w", err)
		}
		return q.SetUserTier(ctx, db.SetUserTierParams{ID: user.ID, Tier: "free"})
	}); err != nil {
		s.log.ErrorContext(ctx, "sub pause: transaction failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.ID, "err", err)
	}
}
```

- [ ] **Step 6: Update `billingStore` interface to add the methods used in `withTx`**

`withTx` uses `db.New(tx)` to create a `*db.Queries` bound to the transaction — this is the sqlc-generated constructor. The `billingStore` interface is not involved inside the transaction; `*db.Queries` is used directly, which is intentional for atomic multi-step writes.

`billingStore` still declares `CancelSubscription` and `SetSubscriptionPastDue` for the fallback calls that happen outside the transaction (confirmed at lines 27–29 of the original). No interface change needed.

Also add a nil pool guard to `withTx` so unit tests with a nil pool get a clear error instead of a panic:

```go
func (s *Service) withTx(ctx context.Context, fn func(*db.Queries) error) error {
	if s.pool == nil {
		return fmt.Errorf("billing: pool not configured")
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("billing: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(db.New(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
```

- [ ] **Step 7: Update `billing.New` call in `internal/api/server.go`**

Find:
```go
	billingService := billingsvc.New(pg, log)
```
Replace with:
```go
	billingService := billingsvc.New(pg, cfg.Pool, log)
```

- [ ] **Step 8: Build**

```bash
go build ./...
```
Expected: clean build.

- [ ] **Step 9: Commit**

```bash
git add internal/service/billing/service.go internal/api/server.go
git commit -m "fix(billing): wrap subscription + tier updates in a single DB transaction"
```

---

## Task 7: Auth service unit tests

**Files:**
- Create: `internal/service/auth/service_test.go`

**Context:** The auth service owns registration, login, token refresh, password reset, and email verification. None of this is tested. Tests mock `authStore` — no database needed.

The mock is a simple struct with function fields (same pattern as handler tests), not a code-generation tool. Each test sets only the store methods it needs.

- [ ] **Step 1: Create `internal/service/auth/service_test.go` with the mock and first test**

```go
package auth_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
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
			return db.User{}, errors.New("not found")
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
```

- [ ] **Step 2: Run the tests**

```bash
go test ./internal/service/auth/... -v
```
Expected: all PASS. (The `ErrEmailInUse` test will currently fail because `store.createUser` returns `auth.ErrEmailInUse` directly — not wrapped in a pgconn.PgError as production code does. See note below.)

**Note on `TestRegister_DuplicateEmail`:** The production `Register` method only returns `ErrEmailInUse` when the DB error is a `pgconn.PgError` with code `23505`. Since the mock bypasses this, return the sentinel directly. If the test fails on this case, update the mock to return `ErrEmailInUse` and confirm the test logic is checking the error correctly.

- [ ] **Step 3: Commit**

```bash
git add internal/service/auth/service_test.go
git commit -m "test(auth): add unit tests for Register, Login, Refresh, ForgotPassword, VerifyEmail"
```

---

## Task 8: Checkin service unit tests

**Files:**
- Create: `internal/service/checkin/service_test.go`

**Context:** The checkin service owns score computation, follow-up scheduling, and AI narrative generation. The score computation path is the most critical to test. Mock the store interface — no database or AI client needed.

- [ ] **Step 1: Create `internal/service/checkin/service_test.go`**

```go
package checkin_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
)

// ── Mock store ────────────────────────────────────────────────────────────────

type mockCheckinStore struct {
	upsertCheckIn            func(ctx context.Context, p db.UpsertCheckInParams) (db.CheckIn, error)
	getTodayCheckIn          func(ctx context.Context, p db.GetTodayCheckInParams) (db.CheckIn, error)
	listCheckIns             func(ctx context.Context, p db.ListCheckInsParams) ([]db.CheckIn, error)
	listRecentCheckIns       func(ctx context.Context, p db.ListRecentCheckInsParams) ([]db.ListRecentCheckInsRow, error)
	getConsecutiveDangerDays func(ctx context.Context, userID uuid.UUID) (int32, error)
	getCheckInStreak         func(ctx context.Context, userID uuid.UUID) (int32, error)
	countCheckIns            func(ctx context.Context, userID uuid.UUID) (int64, error)
	setAIRecoveryPlan        func(ctx context.Context, p db.SetAIRecoveryPlanParams) error
	createFollowUp           func(ctx context.Context, p db.CreateFollowUpParams) (db.FollowUp, error)
}

func (m *mockCheckinStore) UpsertCheckIn(ctx context.Context, p db.UpsertCheckInParams) (db.CheckIn, error) {
	return m.upsertCheckIn(ctx, p)
}
func (m *mockCheckinStore) GetTodayCheckIn(ctx context.Context, p db.GetTodayCheckInParams) (db.CheckIn, error) {
	if m.getTodayCheckIn != nil {
		return m.getTodayCheckIn(ctx, p)
	}
	return db.CheckIn{}, errors.New("no check-in")
}
func (m *mockCheckinStore) ListCheckIns(ctx context.Context, p db.ListCheckInsParams) ([]db.CheckIn, error) {
	if m.listCheckIns != nil {
		return m.listCheckIns(ctx, p)
	}
	return nil, nil
}
func (m *mockCheckinStore) ListRecentCheckIns(ctx context.Context, p db.ListRecentCheckInsParams) ([]db.ListRecentCheckInsRow, error) {
	if m.listRecentCheckIns != nil {
		return m.listRecentCheckIns(ctx, p)
	}
	return nil, nil
}
func (m *mockCheckinStore) GetConsecutiveDangerDays(ctx context.Context, id uuid.UUID) (int32, error) {
	if m.getConsecutiveDangerDays != nil {
		return m.getConsecutiveDangerDays(ctx, id)
	}
	return 0, nil
}
func (m *mockCheckinStore) GetCheckInStreak(ctx context.Context, id uuid.UUID) (int32, error) {
	if m.getCheckInStreak != nil {
		return m.getCheckInStreak(ctx, id)
	}
	return 0, nil
}
func (m *mockCheckinStore) CountCheckIns(ctx context.Context, id uuid.UUID) (int64, error) {
	if m.countCheckIns != nil {
		return m.countCheckIns(ctx, id)
	}
	return 0, nil
}
func (m *mockCheckinStore) SetAIRecoveryPlan(ctx context.Context, p db.SetAIRecoveryPlanParams) error {
	return nil
}
func (m *mockCheckinStore) CreateFollowUp(ctx context.Context, p db.CreateFollowUpParams) (db.FollowUp, error) {
	if m.createFollowUp != nil {
		return m.createFollowUp(ctx, p)
	}
	return db.FollowUp{}, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func newCheckinService(store *mockCheckinStore) *checkin.Service {
	return checkin.New(store, nil, slog.Default()) // no AI client
}

func defaultUser() db.User {
	return db.User{
		ID:            uuid.New(),
		Email:         "alice@example.com",
		Name:          "Alice",
		Role:          "engineer",
		SleepBaseline: 8,
		Timezone:      "UTC",
	}
}

func okCheckin(userID uuid.UUID, stress int) func(context.Context, db.UpsertCheckInParams) (db.CheckIn, error) {
	return func(_ context.Context, p db.UpsertCheckInParams) (db.CheckIn, error) {
		return db.CheckIn{
			ID:            uuid.New(),
			UserID:        userID,
			Stress:        int16(stress),
			CheckedInDate: pgtype.Date{Time: time.Now().UTC(), Valid: true},
		}, nil
	}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestUpsert_InvalidStress(t *testing.T) {
	svc := newCheckinService(&mockCheckinStore{})
	user := defaultUser()

	for _, bad := range []int{0, 6, -1, 100} {
		_, err := svc.Upsert(context.Background(), user, checkin.UpsertRequest{Stress: bad})
		if !errors.Is(err, checkin.ErrInvalidStress) {
			t.Errorf("Upsert(stress=%d) error = %v, want ErrInvalidStress", bad, err)
		}
	}
}

func TestUpsert_ValidStressRange(t *testing.T) {
	user := defaultUser()
	for _, stress := range []int{1, 2, 3, 4, 5} {
		store := &mockCheckinStore{
			upsertCheckIn: okCheckin(user.ID, stress),
		}
		svc := newCheckinService(store)

		res, err := svc.Upsert(context.Background(), user, checkin.UpsertRequest{Stress: stress})
		if err != nil {
			t.Errorf("Upsert(stress=%d) error = %v, want nil", stress, err)
		}
		if res.Score.Score == 0 {
			t.Errorf("Upsert(stress=%d) Score = 0, want non-zero", stress)
		}
	}
}

func TestUpsert_ScoreIncludesStress(t *testing.T) {
	// A stress=5 check-in (max) should always produce a higher score than stress=1.
	user := defaultUser()

	upsertWith := func(stress int) int {
		store := &mockCheckinStore{
			upsertCheckIn: okCheckin(user.ID, stress),
		}
		res, _ := checkin.New(store, nil, slog.Default()).Upsert(context.Background(), user, checkin.UpsertRequest{Stress: stress})
		return res.Score.Score
	}

	highScore := upsertWith(5)
	lowScore := upsertWith(1)

	if highScore <= lowScore {
		t.Errorf("score(stress=5)=%d should be greater than score(stress=1)=%d", highScore, lowScore)
	}
}

func TestUpsert_StoreError(t *testing.T) {
	store := &mockCheckinStore{
		upsertCheckIn: func(_ context.Context, _ db.UpsertCheckInParams) (db.CheckIn, error) {
			return db.CheckIn{}, errors.New("db down")
		},
	}
	svc := newCheckinService(store)

	_, err := svc.Upsert(context.Background(), defaultUser(), checkin.UpsertRequest{Stress: 3})
	if err == nil {
		t.Error("Upsert() error = nil, want db error")
	}
}

func TestGetScoreCard_NoCheckIn(t *testing.T) {
	store := &mockCheckinStore{} // getTodayCheckIn returns error by default
	svc := newCheckinService(store)

	res, err := svc.GetScoreCard(context.Background(), defaultUser())
	if err != nil {
		t.Fatalf("GetScoreCard() error = %v, want nil", err)
	}
	if res.HasCheckIn {
		t.Error("HasCheckIn = true, want false when no check-in today")
	}
}

func TestGetScoreCard_WithCheckIn(t *testing.T) {
	user := defaultUser()
	store := &mockCheckinStore{
		getTodayCheckIn: func(_ context.Context, _ db.GetTodayCheckInParams) (db.CheckIn, error) {
			return db.CheckIn{Stress: 3, Score: 50}, nil
		},
	}
	svc := newCheckinService(store)

	res, err := svc.GetScoreCard(context.Background(), user)
	if err != nil {
		t.Fatalf("GetScoreCard() error = %v, want nil", err)
	}
	if !res.HasCheckIn {
		t.Error("HasCheckIn = false, want true when check-in exists")
	}
}
```

- [ ] **Step 2: Run the tests**

```bash
go test ./internal/service/checkin/... -v
```
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add internal/service/checkin/service_test.go
git commit -m "test(checkin): add unit tests for Upsert validation, score ordering, and GetScoreCard"
```

---

## Task 9: Billing service unit tests

**Files:**
- Create: `internal/service/billing/service_test.go`

**Context:** The billing service processes Paddle webhook events. Key behaviors to test: idempotency (already-processed events), `tierFromStatus` mapping, and `resolveUserFromPaddleEvent` fallback logic. Tests do not need a real database or pool — use mocked store and a nil pool (the `withTx` path is exercised only in integration/e2e tests).

- [ ] **Step 1: Create `internal/service/billing/service_test.go`**

```go
package billing_test

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/service/billing"
)

// ── Mock store ────────────────────────────────────────────────────────────────

type mockBillingStore struct {
	createPaddleEvent            func(ctx context.Context, p db.CreatePaddleEventParams) (db.PaddleEvent, error)
	getUserByID                  func(ctx context.Context, id uuid.UUID) (db.User, error)
	getUserByPaddleCustomerID    func(ctx context.Context, id pgtype.Text) (db.User, error)
	setPaddleCustomerID          func(ctx context.Context, p db.SetPaddleCustomerIDParams) error
	upsertSubscription           func(ctx context.Context, p db.UpsertSubscriptionParams) (db.Subscription, error)
	cancelSubscription           func(ctx context.Context, paddleSubID string) error
	setSubscriptionPastDue       func(ctx context.Context, paddleSubID string) error
	setUserTier                  func(ctx context.Context, p db.SetUserTierParams) error
}

func (m *mockBillingStore) CreatePaddleEvent(ctx context.Context, p db.CreatePaddleEventParams) (db.PaddleEvent, error) {
	return m.createPaddleEvent(ctx, p)
}
func (m *mockBillingStore) GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error) {
	if m.getUserByID != nil {
		return m.getUserByID(ctx, id)
	}
	return db.User{}, errors.New("not found")
}
func (m *mockBillingStore) GetUserByPaddleCustomerID(ctx context.Context, id pgtype.Text) (db.User, error) {
	if m.getUserByPaddleCustomerID != nil {
		return m.getUserByPaddleCustomerID(ctx, id)
	}
	return db.User{}, errors.New("not found")
}
func (m *mockBillingStore) SetPaddleCustomerID(ctx context.Context, p db.SetPaddleCustomerIDParams) error {
	if m.setPaddleCustomerID != nil {
		return m.setPaddleCustomerID(ctx, p)
	}
	return nil
}
func (m *mockBillingStore) UpsertSubscription(ctx context.Context, p db.UpsertSubscriptionParams) (db.Subscription, error) {
	if m.upsertSubscription != nil {
		return m.upsertSubscription(ctx, p)
	}
	return db.Subscription{}, nil
}
func (m *mockBillingStore) CancelSubscription(ctx context.Context, id string) error {
	if m.cancelSubscription != nil {
		return m.cancelSubscription(ctx, id)
	}
	return nil
}
func (m *mockBillingStore) SetSubscriptionPastDue(ctx context.Context, id string) error {
	if m.setSubscriptionPastDue != nil {
		return m.setSubscriptionPastDue(ctx, id)
	}
	return nil
}
func (m *mockBillingStore) SetUserTier(ctx context.Context, p db.SetUserTierParams) error {
	if m.setUserTier != nil {
		return m.setUserTier(ctx, p)
	}
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func newBillingService(store *mockBillingStore) *billing.Service {
	// nil pool is intentional — the withTx path is not exercised in unit tests.
	// withTx has a nil guard that returns an error rather than panicking.
	return billing.New(store, nil, slog.Default())
}

// eventJSON builds a minimal Paddle event payload with the given event type and data.
func eventJSON(t *testing.T, eventType string, data any) (billing.PaddleEvent, []byte) {
	t.Helper()
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("eventJSON: marshal data: %v", err)
	}
	ev := billing.PaddleEvent{
		EventID:   uuid.New().String(),
		EventType: eventType,
		Data:      raw,
	}
	body, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("eventJSON: marshal event: %v", err)
	}
	return ev, body
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestProcessEvent_AlreadyProcessed(t *testing.T) {
	// ON CONFLICT DO NOTHING returns a zero-UUID row — signals idempotent duplicate.
	store := &mockBillingStore{
		createPaddleEvent: func(_ context.Context, _ db.CreatePaddleEventParams) (db.PaddleEvent, error) {
			return db.PaddleEvent{ID: uuid.UUID{}}, nil // zero UUID = already exists
		},
	}
	svc := newBillingService(store)

	ev, body := eventJSON(t, "subscription.created", map[string]string{})
	already, err := svc.ProcessEvent(context.Background(), ev, body)

	if err != nil {
		t.Fatalf("ProcessEvent() error = %v, want nil", err)
	}
	if !already {
		t.Error("alreadyProcessed = false, want true for duplicate event")
	}
}

func TestProcessEvent_NewEvent(t *testing.T) {
	newID := uuid.New()
	store := &mockBillingStore{
		createPaddleEvent: func(_ context.Context, _ db.CreatePaddleEventParams) (db.PaddleEvent, error) {
			return db.PaddleEvent{ID: newID}, nil // non-zero UUID = new event
		},
	}
	svc := newBillingService(store)

	ev, body := eventJSON(t, "unknown.event.type", map[string]string{})
	already, err := svc.ProcessEvent(context.Background(), ev, body)

	if err != nil {
		t.Fatalf("ProcessEvent() error = %v, want nil", err)
	}
	if already {
		t.Error("alreadyProcessed = true, want false for new event")
	}
}

func TestProcessEvent_StoreError(t *testing.T) {
	store := &mockBillingStore{
		createPaddleEvent: func(_ context.Context, _ db.CreatePaddleEventParams) (db.PaddleEvent, error) {
			return db.PaddleEvent{}, errors.New("db error")
		},
	}
	svc := newBillingService(store)

	ev, body := eventJSON(t, "subscription.created", map[string]string{})
	_, err := svc.ProcessEvent(context.Background(), ev, body)

	if err == nil {
		t.Error("ProcessEvent() error = nil, want db error")
	}
}
```

- [ ] **Step 2: Run the tests**

```bash
go test ./internal/service/billing/... -v
```
Expected: all PASS

- [ ] **Step 3: Run the full test suite to confirm nothing regressed**

```bash
go test ./... 2>&1 | tail -20
```
Expected: all packages PASS, no failures.

- [ ] **Step 4: Commit**

```bash
git add internal/service/billing/service_test.go
git commit -m "test(billing): add unit tests for ProcessEvent idempotency and error handling"
```

---

## Final verification

- [ ] **Full build**

```bash
go build ./...
```

- [ ] **Full test suite**

```bash
go test ./... -count=1
```
Expected: all PASS.

- [ ] **Final commit if any loose files**

```bash
git status
```
If clean: done. If stray files: add and commit with `chore: cleanup after hardening pass`.
