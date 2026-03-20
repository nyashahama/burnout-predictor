# Backend Architecture Redesign

**Date:** 2026-03-20
**Status:** Approved
**Author:** Nyasha Hama

## Problem

The current backend has grown organically and accumulated several structural problems that make it harder to reason about, test, and contribute to:

- **God-object `Handler`** holds six unrelated dependencies (DB, JWT secret, email, AI, Paddle secret, app URL). Every handler has access to everything whether it needs it or not.
- **No service layer.** Handlers call `*db.Queries` directly, mixing HTTP concerns with business logic. There is no way to unit-test business logic without running an HTTP request against a real database.
- **Score computation duplicated three times** across `UpsertCheckIn`, `GetScore`, and `buildSessionContext` in insights.
- **Wrong-file placement.** `DismissComponent` lives in `followups.go`. `scheduleFollowUps` (checkin logic) also lives in `followups.go`.
- **`insights.go` is 344 lines** orchestrating eight unrelated insight computations alongside all mapping and DB logic.
- **`workers/notifier.go` is 310 lines** with four distinct concerns (email notifications, AI plans, subscription maintenance, token cleanup) in one struct.
- **`localDate` helper duplicated** in both `internal/api` and `internal/workers`.
- **`main.go` does too much:** env parsing, conditional client creation, router setup, worker scheduling — all in one function.

## Goals

1. Clear separation of concerns: transport, business logic, and data access are distinct layers.
2. Every service is unit-testable without a database via consumer-defined store interfaces.
3. Shared logic (score computation, follow-up scheduling) lives in exactly one place.
4. Each file has one clear responsibility that a new contributor can understand without reading other files.
5. `main.go` is ≤50 lines of pure wiring.

## Non-Goals

- Changing the public API surface (same routes, same JSON shapes).
- Replacing sqlc, chi, or any existing dependency.
- Adding new features.

## Architecture

### Layer Model

```
HTTP Request
     │
     ▼
┌─────────────────────────────┐
│   api/handler/              │  HTTP only: decode → call service → encode
│   (thin adapters, ~50 LOC   │
│    per file)                │
└──────────────┬──────────────┘
               │ calls
               ▼
┌─────────────────────────────┐
│   service/{domain}/         │  Business logic, owns all domain rules
│   (auth, checkin, insight,  │
│    notification, billing)   │
└──────────────┬──────────────┘
               │ depends on (interface)
               ▼
┌─────────────────────────────┐
│   store/postgres.go         │  One concrete DB implementation
│   (wraps *db.Queries)       │  satisfies all consumer-defined interfaces
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   internal/db/sqlc/         │  Generated (unchanged)
└─────────────────────────────┘
```

Workers sit alongside handlers — they call the same services, never the DB directly.

### Directory Structure

```
backend/
├── cmd/
│   └── server/
│       ├── main.go        # ~40 lines: load config, wire deps, start
│       └── config.go      # Config struct + Load() from env
│
└── internal/
    ├── store/
    │   └── postgres.go    # Postgres struct wrapping *db.Queries; satisfies all
    │                      # consumer-defined interfaces implicitly
    │
    ├── service/
    │   ├── auth/
    │   │   ├── service.go # Register, Login, Refresh, Logout, Verify, Reset, GetProfile, UpdateProfile
    │   │   └── errors.go  # Sentinel errors
    │   ├── checkin/
    │   │   ├── service.go # Upsert, GetScoreCard, List, ScheduleFollowUps
    │   │   └── errors.go
    │   ├── insight/
    │   │   ├── service.go # Get (all 8 computations), DismissComponent
    │   │   └── errors.go
    │   ├── notification/
    │   │   ├── service.go # email senders + BackfillAIPlans + RunMaintenance
    │   │   └── errors.go
    │   └── billing/
    │       └── service.go # Paddle webhook processing, subscription upsert/cancel/pause
    │
    ├── api/
    │   ├── server.go      # NewServer(), chi router, mounts all routes
    │   ├── respond/
    │   │   └── respond.go # JSON(), Error(), ServiceError()
    │   ├── handler/
    │   │   ├── auth.go         # Register, Login, Refresh, Logout, Verify, Resend, ForgotPassword, ResetPassword
    │   │   ├── checkin.go      # UpsertCheckIn, GetScore, ListCheckIns
    │   │   ├── insight.go      # GetInsights, DismissComponent
    │   │   ├── followup.go     # GetTodayFollowUp, DismissFollowUp
    │   │   ├── user.go         # GetProfile, UpdateProfile
    │   │   └── webhook.go      # PaddleWebhook + all Paddle payload types
    │   └── middleware/
    │       ├── auth.go         # JWT validation, injects db.User into ctx, exports UserFromCtx
    │       └── ratelimit.go    # IP-based rate limiter (logic unchanged)
    │
    ├── worker/                  # Renamed from workers/ (intentional singular)
    │   └── scheduler.go         # Ticker loop only; calls notification service methods
    │
    ├── ai/                      # Unchanged
    ├── email/                   # Unchanged
    ├── score/                   # Unchanged
    └── db/                      # Unchanged (sqlc generated)
```

## Store Interface Design

### Consumer-Defined Interfaces (idiomatic Go)

Each service defines the minimal interface it needs, co-located in its own package. `store.Postgres` satisfies all of them implicitly via Go structural typing. No central `Store` interface file is maintained.

**Why consumer-defined over a central interface:**
- The Go proverb: *"The bigger the interface, the weaker the abstraction."*
- Tests mock only the 4–8 methods the service actually uses, not 50+.
- Adding a new DB query requires zero interface changes — just implement the method on `Postgres`.
- Interfaces live next to the code that uses them, making dependencies self-documenting.

### `service/auth` — `authStore`

All return types match the sqlc-generated code exactly. Token types are distinct structs (`db.RefreshToken`, `db.EmailVerification`, `db.PasswordReset`), not a shared `db.AuthToken`.

```go
// authStore is the data-access contract for the auth service.
// store.Postgres satisfies this implicitly.
type authStore interface {
    CreateUser(ctx context.Context, params db.CreateUserParams) (db.User, error)
    GetUserByEmail(ctx context.Context, email string) (db.User, error)
    GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error)
    UpdateUserProfile(ctx context.Context, params db.UpdateUserProfileParams) (db.User, error)
    UpdateUserPassword(ctx context.Context, params db.UpdateUserPasswordParams) error
    VerifyUserEmail(ctx context.Context, id uuid.UUID) error               // param name is "id", matching sqlc
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
```

### `service/checkin` — `checkinStore`

`GetCheckInStreak` and `GetConsecutiveDangerDays` return `int32` in the sqlc-generated code — the interface must match exactly (not `int64`).

`ListRecentCheckIns` is needed here because `Upsert` and `GetScoreCard` both fetch recent rows to build the score input before calling `BuildScoreInput`.

```go
type checkinStore interface {
    UpsertCheckIn(ctx context.Context, params db.UpsertCheckInParams) (db.CheckIn, error)
    GetTodayCheckIn(ctx context.Context, params db.GetTodayCheckInParams) (db.CheckIn, error)
    ListCheckIns(ctx context.Context, params db.ListCheckInsParams) ([]db.CheckIn, error)
    ListRecentCheckIns(ctx context.Context, params db.ListRecentCheckInsParams) ([]db.ListRecentCheckInsRow, error)
    GetConsecutiveDangerDays(ctx context.Context, userID uuid.UUID) (int32, error)  // int32, not int64
    GetCheckInStreak(ctx context.Context, userID uuid.UUID) (int32, error)           // int32, not int64
    CountCheckIns(ctx context.Context, userID uuid.UUID) (int64, error)
    SetAIRecoveryPlan(ctx context.Context, params db.SetAIRecoveryPlanParams) error
    CreateFollowUp(ctx context.Context, params db.CreateFollowUpParams) (db.FollowUp, error)
}
```

### `service/insight` — `insightStore`

The insight service owns all eight computations and does its own DB fetching. It does not call into the checkin service; it fetches check-in data directly via its store interface.

```go
type insightStore interface {
    // Check-in history
    ListCheckInsInRange(ctx context.Context, params db.ListCheckInsInRangeParams) ([]db.CheckIn, error)
    ListRecentCheckIns(ctx context.Context, params db.ListRecentCheckInsParams) ([]db.ListRecentCheckInsRow, error)
    GetTodayCheckIn(ctx context.Context, params db.GetTodayCheckInParams) (db.CheckIn, error)
    GetYesterdayCheckIn(ctx context.Context, params db.GetYesterdayCheckInParams) (db.CheckIn, error)
    CountCheckIns(ctx context.Context, userID uuid.UUID) (int64, error)

    // Insight metadata (earned patterns, milestones, cooldowns)
    GetInsightMetadata(ctx context.Context, params db.GetInsightMetadataParams) (db.InsightMetadatum, error)
    SetInsightMetadata(ctx context.Context, params db.SetInsightMetadataParams) (db.InsightMetadatum, error)
    ListInsightMetadataByPrefix(ctx context.Context, params db.ListInsightMetadataByPrefixParams) ([]db.InsightMetadatum, error)

    // Component dismissal
    ListDismissedComponents(ctx context.Context, params db.ListDismissedComponentsParams) ([]string, error)
    DismissComponent(ctx context.Context, params db.DismissComponentParams) error
}
```

Note: `buildSessionContext` inside `insight.Service` recomputes today's score using `ListRecentCheckIns` + `GetTodayCheckIn` — the same pattern as `checkin.Service`. It calls the exported `checkin.BuildScoreInput(user, rows, today)` (from `service/checkin`) so the score logic lives in exactly one place. `insight.Service` fetches the rows via its own `insightStore.ListRecentCheckIns` and passes them in.

### `service/notification` — `notificationStore`

21 methods. `CreateEmailLog` returns `db.EmailLog` (not `db.Notification`). `ListExpiredSubscriptions` returns `[]db.ListExpiredSubscriptionsRow` (a projected row type, not the full `db.Subscription` model) — both types match the sqlc-generated code exactly.

```go
type notificationStore interface {
    // User targeting
    ListUsersForCheckinReminder(ctx context.Context) ([]db.ListUsersForCheckinReminderRow, error)
    ListUsersForStreakAlert(ctx context.Context) ([]db.ListUsersForStreakAlertRow, error)
    ListUsersForMondayDebrief(ctx context.Context) ([]db.ListUsersForMondayDebriefRow, error)
    ListUsersForReengagement(ctx context.Context) ([]db.ListUsersForReengagementRow, error)
    GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error)

    // Dedup + email logging
    IsEmailAlreadySent(ctx context.Context, params db.IsEmailAlreadySentParams) (bool, error)
    CreateEmailLog(ctx context.Context, params db.CreateEmailLogParams) (db.EmailLog, error)  // db.EmailLog, not db.Notification
    MarkEmailFailed(ctx context.Context, params db.MarkEmailFailedParams) error

    // Streak + danger data for notification copy
    GetCheckInStreak(ctx context.Context, userID uuid.UUID) (int32, error)
    GetConsecutiveDangerDays(ctx context.Context, userID uuid.UUID) (int32, error)
    ListRecentCheckIns(ctx context.Context, params db.ListRecentCheckInsParams) ([]db.ListRecentCheckInsRow, error)
    ListCheckInsInRange(ctx context.Context, params db.ListCheckInsInRangeParams) ([]db.CheckIn, error)

    // AI plan backfill
    ListCheckInsNeedingAIPlan(ctx context.Context) ([]db.CheckIn, error)
    SetAIRecoveryPlan(ctx context.Context, params db.SetAIRecoveryPlanParams) error

    // Maintenance
    ExpireStaleFollowUps(ctx context.Context) error
    ListExpiredSubscriptions(ctx context.Context) ([]db.ListExpiredSubscriptionsRow, error)  // projected row, not db.Subscription
    CancelSubscription(ctx context.Context, paddleSubID string) error
    SetUserTier(ctx context.Context, params db.SetUserTierParams) error
    DeleteExpiredRefreshTokens(ctx context.Context) error
    DeleteExpiredPasswordResets(ctx context.Context) error
    DeleteOldDismissals(ctx context.Context) error
}
```

### `service/billing` — `billingStore`

The billing service processes Paddle webhook events. It is called from `handler/webhook.go`.

`CreatePaddleEvent` returns `db.PaddleEvent` (not `db.Subscription`) — matching the sqlc-generated code exactly.

```go
type billingStore interface {
    CreatePaddleEvent(ctx context.Context, params db.CreatePaddleEventParams) (db.PaddleEvent, error)  // db.PaddleEvent, not db.Subscription
    GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error)
    GetUserByPaddleCustomerID(ctx context.Context, customerID pgtype.Text) (db.User, error)
    SetPaddleCustomerID(ctx context.Context, params db.SetPaddleCustomerIDParams) error
    UpsertSubscription(ctx context.Context, params db.UpsertSubscriptionParams) (db.Subscription, error)
    CancelSubscription(ctx context.Context, paddleSubID string) error
    SetSubscriptionPastDue(ctx context.Context, paddleSubID string) error
    SetUserTier(ctx context.Context, params db.SetUserTierParams) error
}
```

### `api/middleware/auth.go` — `userGetter`

The auth middleware defines its own one-method interface so it does not depend on any service package:

```go
type userGetter interface {
    GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error)
}

func Auth(store userGetter, secret []byte) func(http.Handler) http.Handler

// UserFromCtx is exported so handler packages can read the injected user.
// The injected value is db.User (unchanged from today).
func UserFromCtx(ctx context.Context) db.User
```

`UserFromCtx` lives in the `middleware` package. Handler packages import `middleware` to call it. This is the standard Go pattern: the middleware that injects the value also exports the accessor.

### `store/postgres.go`

A thin wrapper — one forwarding method per `*db.Queries` method. No logic, no interfaces defined here.

```go
package store

import (
    "context"
    db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
    // ... other imports
)

type Postgres struct{ q *db.Queries }

func New(q *db.Queries) *Postgres { return &Postgres{q} }

func (p *Postgres) CreateUser(ctx context.Context, params db.CreateUserParams) (db.User, error) {
    return p.q.CreateUser(ctx, params)
}
// ... one method per sqlc query
```

## Service Layer

### `service/auth`

Owns: register, login, token issuance, logout, email verification, password reset, and user profile (get/update). Profile management belongs here because users are an auth concern and `UpdateProfile` requires no other domain knowledge.

Moves from `api/auth.go` and `api/users.go`:
- `issueTokens` → `auth.Service.issueTokens` (private)
- `tokenHash` → `auth.Service.tokenHash` (private)
- `sendWelcomeEmail`, `sendVerificationEmail`, `sendPasswordResetEmail` → private methods
- `safeUser` / `safeUserResp` → `auth.UserResponse` (exported type, used by handler)
- `GetProfile` and `UpdateProfile` from `users.go` → `auth.Service.GetProfile` / `auth.Service.UpdateProfile`

Public methods return typed result structs. Error cases return typed sentinel errors.

### `service/checkin`

Owns: check-in persistence, score computation (single authoritative location), follow-up scheduling, and the `BuildScoreInput` helper exported for `insight.Service`.

Moves from `api/checkins.go` and `api/followups.go`:
- `BuildScoreInput(user db.User, rows []db.ListRecentCheckInsRow, today time.Time) score.Input` — **exported** pure function; takes the raw sqlc row slice and handles `int16→int` field extraction internally. This is the single authoritative signature. Callers fetch `ListRecentCheckIns` rows from their own store and pass them in. Called by `Upsert`, `GetScoreCard`, and `insight.Service.buildSessionContext`
- `ScheduleFollowUps` + all `followUpRules` — moved from `followups.go`
- `localDate` / `userLocation` helpers — single copy here, no more duplication

**Goroutine context:** `Upsert` spawns two goroutines (follow-up scheduling, AI plan persistence). Because the request context is cancelled when the response is sent, both goroutines must use a detached context. Use `context.WithoutCancel(ctx)` (available since Go 1.21; this project targets Go 1.22):

```go
bgCtx := context.WithoutCancel(ctx)
go s.scheduleFollowUps(bgCtx, checkin.ID, user.ID, req.Note, today)
```

This preserves any context values (e.g. trace IDs) without inheriting the cancellation deadline.

### `service/insight`

Owns: all eight insight computations and component dismissal. Does its own DB fetching via `insightStore`.

Moves from `api/insights.go`:
- `buildSessionContext` — calls `checkin.BuildScoreInput` (imported from `service/checkin`) to avoid duplicating score logic
- `buildEarnedPatternInsight`, `buildMonthlyArc`, `buildMilestone` → private methods on `insight.Service`
- `buildNoteEntries`, `nearestMilestone` → private helpers
- `DismissComponent` handler logic → `insight.Service.DismissComponent`

Returns `InsightBundle` struct — the handler calls `respond.JSON` on it directly.

### `service/notification`

Owns: all email dispatch logic and background maintenance tasks. Method `RunAIPlans` is renamed `BackfillAIPlans` for clarity (describes what it does, not when it runs).

Moves from `workers/notifier.go`:
- All `sendCheckinReminders`, `sendStreakAlerts`, `sendMondayDebriefs`, `sendReEngagements` → private methods
- `RunMinutely` fans out to the four email senders (unchanged behaviour)
- `BackfillAIPlans` (renamed from `RunAIPlans`) → backfills AI plans for high-stress check-ins
- `RunMaintenance` (renamed from `RunHourly`) → consolidates token pruning, subscription expiry, follow-up expiry, old dismissal cleanup
- `localDate`, `loc`, `avgRecentScore`, `avgFullScore`, `toHistoryEntries` helpers → private

### `service/billing`

Owns: Paddle webhook processing. Handles the five Paddle event types (subscription.created/updated, cancelled, paused, transaction.completed) and manages tier transitions.

Moves from `api/webhooks_paddle.go`:
- `handleSubscriptionUpsert`, `handleSubscriptionCancelled`, `handleSubscriptionPaused`, `handleTransactionCompleted` → methods on `billing.Service`
- `resolveUserFromPaddleEvent`, `tierFromStatus`, `extractPlanDetails` → private helpers

**`parseUUID`:** The current workaround in `webhooks_paddle.go` (a custom UUID parser that avoids importing `github.com/google/uuid`) is removed. `billing.Service` imports `github.com/google/uuid` and uses `uuid.Parse` directly. The workaround was a code smell and `uuid.Parse` is already a project dependency.

`handler/webhook.go` retains only: HMAC-SHA256 signature verification, body reading, event dispatch to `billing.Service`, and all Paddle payload type definitions. The signature verification stays in the handler because it operates on the raw HTTP body before any parsing.

## API / Handler Layer

### `api/server.go`

```go
package api

type ServerConfig struct {
    Auth         *authsvc.Service
    Checkin      *checkinsvc.Service
    Insight      *insightsvc.Service
    Notification *notificationsvc.Service
    Billing      *billingsvc.Service
    Store        *store.Postgres   // for middleware user lookup only
    Secret       []byte            // JWT signing secret, for middleware only
    PaddleSecret []byte
}

// NewServer wires all routes and returns an http.Handler.
func NewServer(cfg ServerConfig) http.Handler {
    r := chi.NewRouter()
    // global middleware
    r.Use(chimw.Logger, chimw.Recoverer, chimw.Timeout(30*time.Second))

    // public webhook
    wh := handler.NewWebhookHandler(cfg.Billing, cfg.PaddleSecret)
    r.Post("/api/webhooks/paddle", wh.Handle)

    // public auth routes with rate limiting
    auth := handler.NewAuthHandler(cfg.Auth)
    r.Group(func(r chi.Router) {
        r.Use(api_middleware.RateLimit(20, time.Minute))
        r.Post("/api/auth/register", auth.Register)
        // ...
    })

    // authenticated routes
    r.Group(func(r chi.Router) {
        r.Use(api_middleware.Auth(cfg.Store, cfg.Secret))
        // ... all authenticated routes
    })

    return r
}
```

`main.go` calls `api.NewServer(cfg)` and uses the returned `http.Handler` directly with `http.Server`.

### Handlers

Handlers are pure HTTP adapters following one pattern: decode → validate → call service → respond.

```go
// Example: handler/auth.go
type AuthHandler struct{ svc *authsvc.Service }

func NewAuthHandler(svc *authsvc.Service) *AuthHandler { return &AuthHandler{svc} }

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
    var req authsvc.RegisterRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respond.Error(w, http.StatusBadRequest, "invalid body")
        return
    }
    result, err := h.svc.Register(r.Context(), req)
    if err != nil {
        respond.ServiceError(w, err)
        return
    }
    respond.JSON(w, http.StatusCreated, result)
}
```

### `api/respond/respond.go`

```go
func JSON(w http.ResponseWriter, status int, v any)
func Error(w http.ResponseWriter, status int, msg string)

// ServiceError maps known sentinel errors to HTTP status codes.
// All errors not matched by errors.Is fall through to 500.
// As new services add sentinel errors, add cases here.
func ServiceError(w http.ResponseWriter, err error) {
    switch {
    case errors.Is(err, auth.ErrEmailInUse):           Error(w, 409, "email already in use")
    case errors.Is(err, auth.ErrInvalidCredentials):   Error(w, 401, "invalid credentials")
    case errors.Is(err, auth.ErrInvalidToken):         Error(w, 400, "invalid or expired token")
    case errors.Is(err, auth.ErrEmailAlreadyVerified): Error(w, 400, "email already verified")
    case errors.Is(err, auth.ErrEmailServiceDisabled): Error(w, 503, "email service unavailable")
    // checkin, insight, billing errors added here as services are implemented
    default:
        log.Printf("unhandled service error: %v", err)
        Error(w, 500, "internal server error")
    }
}
```

**Projected handler file sizes:**

| File | Current | After |
|---|---|---|
| `handler/auth.go` | 414 lines | ~80 lines |
| `handler/checkin.go` | 281 lines | ~60 lines |
| `handler/insight.go` | 344 lines | ~50 lines |
| `handler/followup.go` | 176 lines | ~40 lines |
| `handler/user.go` | 51 lines | ~20 lines |
| `handler/webhook.go` | 367 lines | ~120 lines |

## Workers

`worker/scheduler.go` owns the ticker loop only. Note the package rename from `workers` (plural) to `worker` (singular) — intentional, consistent with Go convention (`context`, `sync`, `http`).

```go
// worker/scheduler.go
func Run(ctx context.Context, notif *notificationsvc.Service) {
    minutely   := time.NewTicker(time.Minute)
    aiBackfill := time.NewTicker(5 * time.Minute)  // named aiBackfill to avoid confusion with the ai.Client
    hourly     := time.NewTicker(time.Hour)
    defer minutely.Stop()
    defer aiBackfill.Stop()
    defer hourly.Stop()
    for {
        select {
        case <-minutely.C:
            notif.RunMinutely(ctx)
        case <-aiBackfill.C:
            notif.BackfillAIPlans(ctx)
        case <-hourly.C:
            notif.RunMaintenance(ctx)
        case <-ctx.Done():
            return
        }
    }
}
```

## Config

All env parsing in one place, validated at startup:

```go
// cmd/server/config.go
type Config struct {
    DatabaseURL  string // required
    JWTSecret    string // required
    Port         string // default: "8080"
    ResendKey    string // optional — email disabled if empty
    EmailFrom    string // default: "Overload <noreply@overload.app>"
    OpenAIKey    string // optional — AI disabled if empty
    PaddleSecret string // optional — signature check disabled if empty
    AppURL       string // default: "https://overload.app"
}

func Load() (*Config, error) // validates required fields, applies defaults
```

`main.go` calls `config.Load()` once and passes the struct into constructors. No more scattered `os.Getenv` calls.

## Error Handling

Services return typed sentinel errors for expected failure modes. Each service package has an `errors.go` file:

```go
// service/auth/errors.go
var (
    ErrEmailInUse           = errors.New("email already in use")
    ErrInvalidCredentials   = errors.New("invalid credentials")
    ErrInvalidToken         = errors.New("invalid or expired token")
    ErrEmailAlreadyVerified = errors.New("email already verified")
    ErrEmailServiceDisabled = errors.New("email service unavailable")
)
```

`respond.ServiceError` is the single place that maps these to HTTP status codes. The fallthrough to 500 ensures unhandled errors are always logged and never leak internals. As new services add sentinel errors, new `errors.Is` cases are added to `respond.ServiceError`.

**Import cycle constraint:** `api/respond` imports service packages to access their sentinel error vars. Service packages must never import from `api/` or `api/respond/` — this would create a cycle that prevents compilation. This is an architectural invariant to enforce during code review.

## Migration Strategy

The refactor is done layer by layer, oldest dependency first. Each step must compile cleanly before moving to the next. `AuthMiddleware` remains on the old `Handler` struct until Step 6 when the entire `api/` layer is reorganised — do not try to move middleware in Step 2.

1. **`store/postgres.go`** — create `store.Postgres` wrapping `*db.Queries`. No behaviour change. Confirm it compiles.
2. **`service/auth`** — move all logic from `api/auth.go` and `api/users.go`. Wire in `main.go` alongside the existing `Handler` (both coexist temporarily). Old handler methods call into the new service. Delete old `api/auth.go` logic once wired.
3. **`service/checkin`** — move logic from `api/checkins.go` and the follow-up scheduling from `api/followups.go`. Wire.
4. **`service/insight`** — move logic from `api/insights.go`. Wire.
5. **`service/notification`** — move all of `workers/notifier.go`. Wire in `main.go`. Delete `workers/notifier.go`.
6. **`service/billing`** — move subscription logic from `api/webhooks_paddle.go`. Handler retains signature verification only.
7. **`api/` reorganisation** — create `api/server.go`, split into `handler/` sub-files, add `respond/` package, move middleware to `middleware/` package, replace `h.AuthMiddleware` with `middleware.Auth(store, secret)`. **Delete `internal/api/handler.go`** (the god-object `Handler` struct is fully replaced by this point).
8. **`worker/scheduler.go`** — create `internal/worker/scheduler.go`. Delete `internal/workers/` directory.
9. **`cmd/server/config.go`** — extract `Config` struct and `Load()`. Simplify `main.go` to ≤50 lines.
10. **Cleanup** — delete any remaining dead code, confirm `go build ./...` is clean.

## Testing Strategy

With consumer-defined interfaces, each service can be tested independently:

```go
// service/auth/service_test.go
type mockAuthStore struct {
    createUser     func(ctx context.Context, params db.CreateUserParams) (db.User, error)
    getUserByEmail func(ctx context.Context, email string) (db.User, error)
    // ... only the methods authStore requires
}

func (m *mockAuthStore) CreateUser(ctx context.Context, p db.CreateUserParams) (db.User, error) {
    return m.createUser(ctx, p)
}
// ... implement only the interface methods, all others panic if called unexpectedly
```

Tests for `Register`, `Login`, `ResetPassword`, `VerifyEmail` can run without a DB, without an HTTP server, and without an email client.

## What Does Not Change

- All SQL queries (`internal/db/queries/`)
- All migrations (`internal/db/migrations/`)
- All sqlc generated code (`internal/db/sqlc/`)
- The score engine (`internal/score/`)
- The AI client (`internal/ai/`)
- The email client and templates (`internal/email/`)
- All public API routes and JSON response shapes
- The `go.mod` dependencies
