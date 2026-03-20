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
│    notification)            │
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
    │   ├── store.go       # (optional) shared sentinel errors, no central interface
    │   └── postgres.go    # Postgres struct wrapping *db.Queries; satisfies all
    │                      # consumer-defined interfaces implicitly
    │
    ├── service/
    │   ├── auth/
    │   │   └── service.go # Register, Login, Refresh, Logout, Verify, Reset
    │   ├── checkin/
    │   │   └── service.go # Upsert, GetScoreCard, List, ScheduleFollowUps
    │   ├── insight/
    │   │   └── service.go # Get (all 8 computations), DismissComponent
    │   └── notification/
    │       └── service.go # email senders + BackfillAIPlans + RunMaintenance
    │
    ├── api/
    │   ├── server.go      # NewServer(), chi router, mounts all routes
    │   ├── respond/
    │   │   └── respond.go # JSON(), Error(), ServiceError()
    │   ├── handler/
    │   │   ├── auth.go
    │   │   ├── checkin.go
    │   │   ├── insight.go
    │   │   ├── followup.go
    │   │   ├── user.go
    │   │   └── webhook.go # Paddle handler + all Paddle types
    │   └── middleware/
    │       ├── auth.go    # JWT validation, user injection
    │       └── ratelimit.go
    │
    ├── worker/
    │   └── scheduler.go   # Ticker loop only; calls notification service methods
    │
    ├── ai/                # Unchanged
    ├── email/             # Unchanged
    ├── score/             # Unchanged
    └── db/                # Unchanged (sqlc generated)
```

## Store Interface Design

### Consumer-Defined Interfaces (idiomatic Go)

Each service defines the minimal interface it needs, co-located in its own package. `store.Postgres` satisfies all of them implicitly via Go structural typing. No central `Store` interface file is maintained.

**Why consumer-defined over a central interface:**
- The Go proverb: *"The bigger the interface, the weaker the abstraction."*
- Tests mock only the 4–8 methods the service actually uses, not 50+.
- Adding a new DB query requires zero interface changes — just implement the method on `Postgres`.
- Interfaces live next to the code that uses them, making dependencies self-documenting.

**Example — `service/auth/service.go`:**
```go
// authStore is the data-access contract for the auth service.
// store.Postgres satisfies this implicitly.
type authStore interface {
    CreateUser(ctx context.Context, params db.CreateUserParams) (db.User, error)
    GetUserByEmail(ctx context.Context, email string) (db.User, error)
    GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error)
    CreateRefreshToken(ctx context.Context, params db.CreateRefreshTokenParams) (db.AuthToken, error)
    GetRefreshToken(ctx context.Context, hash string) (db.AuthToken, error)
    RevokeRefreshToken(ctx context.Context, hash string) error
    RevokeAllUserRefreshTokens(ctx context.Context, userID uuid.UUID) error
    CreateEmailVerification(ctx context.Context, params db.CreateEmailVerificationParams) (db.AuthToken, error)
    GetEmailVerification(ctx context.Context, hash string) (db.AuthToken, error)
    MarkEmailVerificationUsed(ctx context.Context, hash string) error
    CreatePasswordReset(ctx context.Context, params db.CreatePasswordResetParams) (db.AuthToken, error)
    GetPasswordReset(ctx context.Context, hash string) (db.AuthToken, error)
    MarkPasswordResetUsed(ctx context.Context, hash string) error
    UpdateUserPassword(ctx context.Context, params db.UpdateUserPasswordParams) error
    VerifyUserEmail(ctx context.Context, userID uuid.UUID) error
    CreateDefaultNotificationPrefs(ctx context.Context, userID uuid.UUID) (db.Notification, error)
}
```

**Example — `service/checkin/service.go`:**
```go
type checkinStore interface {
    UpsertCheckIn(ctx context.Context, params db.UpsertCheckInParams) (db.CheckIn, error)
    GetTodayCheckIn(ctx context.Context, params db.GetTodayCheckInParams) (db.CheckIn, error)
    ListCheckIns(ctx context.Context, params db.ListCheckInsParams) ([]db.CheckIn, error)
    ListRecentCheckIns(ctx context.Context, params db.ListRecentCheckInsParams) ([]db.ListRecentCheckInsRow, error)
    GetConsecutiveDangerDays(ctx context.Context, userID uuid.UUID) (int64, error)
    GetCheckInStreak(ctx context.Context, userID uuid.UUID) (int64, error)
    CountCheckIns(ctx context.Context, userID uuid.UUID) (int64, error)
    SetAIRecoveryPlan(ctx context.Context, params db.SetAIRecoveryPlanParams) error
    CreateFollowUp(ctx context.Context, params db.CreateFollowUpParams) (db.FollowUp, error)
}
```

**`store/postgres.go`** is a thin wrapper — one forwarding method per `*db.Queries` method:
```go
package store

type Postgres struct{ q *db.Queries }

func New(q *db.Queries) *Postgres { return &Postgres{q} }

func (p *Postgres) CreateUser(ctx context.Context, params db.CreateUserParams) (db.User, error) {
    return p.q.CreateUser(ctx, params)
}
// ... one per DB method
```

## Service Layer

### `service/auth`

Owns: register, login, token issuance, logout, email verification, password reset.

Moves from `api/auth.go`:
- `issueTokens` → `auth.Service.issueTokens` (private)
- `tokenHash` → `auth.Service.tokenHash` (private)
- `sendWelcomeEmail`, `sendVerificationEmail`, `sendPasswordResetEmail` → private methods
- `safeUser` / `safeUserResp` → `auth.UserResponse` (exported type)

Public methods return typed result structs and typed sentinel errors (`ErrEmailInUse`, `ErrInvalidCredentials`, `ErrInvalidToken`) that the handler maps to HTTP status codes.

### `service/checkin`

Owns: check-in persistence, score computation (single authoritative location), follow-up scheduling.

Moves from `api/checkins.go` and `api/followups.go`:
- `BuildScoreInput` — private helper, called by `Upsert`, `GetScoreCard`, and `insight.Service`
- `ScheduleFollowUps` + all `followUpRules` — moved from `followups.go`
- `localDate` / `userLocation` helpers — single copy here, no more duplication

`UpsertResult` and `ScoreCard` are typed return structs so handlers never touch score internals.

### `service/insight`

Owns: all eight insight computations and component dismissal.

Moves from `api/insights.go`:
- `buildSessionContext`, `buildEarnedPatternInsight`, `buildMonthlyArc`, `buildMilestone` → private methods on `insight.Service`
- `DismissComponent` handler logic → `insight.Service.DismissComponent`
- `buildNoteEntries`, `nearestMilestone` → private helpers

Returns `InsightBundle` struct so the handler is a one-liner encode.

### `service/notification`

Owns: all email dispatch logic and background maintenance tasks.

Moves from `workers/notifier.go`:
- All `send*` methods → `notification.Service` methods
- `RunMaintenance` consolidates: token pruning, subscription expiry, follow-up expiry, old dismissal cleanup
- `BackfillAIPlans` → `notification.Service.BackfillAIPlans`
- `localDate`, `loc`, `avgRecentScore`, `avgFullScore`, `toHistoryEntries` helpers → private

## API / Handler Layer

Handlers are pure HTTP adapters. Each follows the same pattern:

```
decode request body
validate input (presence/range only)
call service method
map service error to HTTP status
encode response
```

No DB calls, no business logic, no email sending in handlers.

**`api/respond/respond.go`** replaces the current package-level `writeJSON`/`writeError` functions with a proper package:

```go
func JSON(w http.ResponseWriter, status int, v any)
func Error(w http.ResponseWriter, status int, msg string)
func ServiceError(w http.ResponseWriter, err error)
```

`ServiceError` maps sentinel errors from services to HTTP codes:
```go
switch {
case errors.Is(err, auth.ErrInvalidCredentials): respond.Error(w, 401, "invalid credentials")
case errors.Is(err, auth.ErrEmailInUse):         respond.Error(w, 409, "email already in use")
// ...
}
```

**`api/middleware/auth.go`** becomes a standalone package. It depends on a minimal interface:
```go
type userGetter interface {
    GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error)
}
func Auth(store userGetter, secret []byte) func(http.Handler) http.Handler
```

**Projected handler file sizes:**

| File | Current | After |
|---|---|---|
| `handler/auth.go` | 414 lines | ~80 lines |
| `handler/checkin.go` | 281 lines | ~60 lines |
| `handler/insight.go` | 344 lines | ~50 lines |
| `handler/followup.go` | 176 lines | ~40 lines |
| `handler/user.go` | 51 lines | ~30 lines |
| `handler/webhook.go` | 367 lines | ~120 lines |

## Workers

`worker/scheduler.go` owns the ticker loop only. All job logic lives in `notification.Service`.

```go
// worker/scheduler.go
func Run(ctx context.Context, notif *notificationsvc.Service) {
    minutely := time.NewTicker(time.Minute)
    ai       := time.NewTicker(5 * time.Minute)
    hourly   := time.NewTicker(time.Hour)
    defer minutely.Stop()
    defer ai.Stop()
    defer hourly.Stop()
    for {
        select {
        case <-minutely.C:
            notif.RunMinutely(ctx)
        case <-ai.C:
            notif.BackfillAIPlans(ctx)
        case <-hourly.C:
            notif.RunMaintenance(ctx)
        case <-ctx.Done():
            return
        }
    }
}
```

The individual worker files (`checkin_reminder.go`, `streak_alert.go`, etc.) from the original plan are collapsed into private methods on `notification.Service` since they already share state (store, email client). The scheduler calls three coarse-grained methods; the service handles the fan-out internally.

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

Services return typed sentinel errors for expected failure modes:

```go
// service/auth/errors.go
var (
    ErrEmailInUse          = errors.New("email already in use")
    ErrInvalidCredentials  = errors.New("invalid credentials")
    ErrInvalidToken        = errors.New("invalid or expired token")
    ErrEmailAlreadyVerified = errors.New("email already verified")
    ErrEmailServiceDisabled = errors.New("email service unavailable")
)
```

Handlers use `errors.Is` to map these to HTTP status codes in `respond.ServiceError`. Unexpected errors return 500 without leaking internals.

## Migration Strategy

This is a refactor — the public API surface does not change. The migration is done package by package, compiling at each step:

1. `store/postgres.go` — wrap `*db.Queries`, confirm it compiles
2. `service/auth` — move logic, update `main.go` to wire it, delete old handler auth logic
3. `service/checkin` — move logic, wire, delete old
4. `service/insight` — move logic, wire, delete old
5. `service/notification` — move logic, wire, delete old workers file
6. `api/` reorganization — split handler into sub-files, add `respond` package, move middleware
7. `worker/scheduler.go` — replace `workers/notifier.go`
8. `cmd/server/config.go` — consolidate env loading
9. Clean up: delete `internal/api/handler.go`, `internal/workers/notifier.go`

Each step produces a compilable, deployable binary. No big-bang rewrites.

## Testing Strategy

With consumer-defined interfaces, each service can be tested independently:

```go
// service/auth/service_test.go
type mockAuthStore struct {
    createUser    func(ctx context.Context, params db.CreateUserParams) (db.User, error)
    getUserByEmail func(ctx context.Context, email string) (db.User, error)
    // ... only the methods authStore requires
}

func (m *mockAuthStore) CreateUser(ctx context.Context, p db.CreateUserParams) (db.User, error) {
    return m.createUser(ctx, p)
}
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
