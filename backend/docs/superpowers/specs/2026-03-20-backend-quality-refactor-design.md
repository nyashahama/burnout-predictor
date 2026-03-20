# Backend Quality Refactor — Design Spec

**Date:** 2026-03-20
**Status:** Approved
**Scope:** Option B — Refactor-forward quality pass. No feature additions, no pagination, no structural overhaul. Fix what is actually wrong and elevate code quality to unambiguous senior level.

---

## Problem Statement

The backend is architecturally sound but has eight concrete gaps that a senior Go engineer would flag in code review:

1. Unstructured logging (`log.Printf` everywhere) — no structured fields, no request correlation
2. No request ID — impossible to trace a request through logs in production
3. `BuildScoreInput` exists but `checkin.Upsert` duplicates its logic inline
4. `respond.ServiceError` imports three service packages — adding services requires touching this file
5. Rate limiter cleanup goroutine runs forever with no shutdown path (goroutine leak)
6. `auth.ResetPassword` re-checks password length manually, duplicating `validate.Password`
7. `Retry-After` header absent from 429 responses
8. Dependencies behind current stable versions

---

## Architecture

No structural changes. All existing layers (handler → service → store → sqlc) stay as-is. Changes are additive (new middleware, new interface) or subtractive (remove duplication, fix coupling).

### Dependency graph after refactor

```
main.go
  └─ *slog.Logger (created here, injected everywhere)
  └─ middleware.RequestID (new, runs first on router)
  └─ service/* (each receives *slog.Logger)
  └─ worker (receives *slog.Logger)

respond.ServiceError
  └─ HTTPError interface (no service imports)

service/auth, service/checkin, service/insight, service/billing
  └─ sentinel errors implement HTTPError
```

---

## Section 1 — Structured Logging (`slog`)

**What:** Replace all `log.Printf` / `log.Fatalf` / `log.Println` with `*slog.Logger`.

**How:**
- `main.go` creates `log := slog.New(slog.NewJSONHandler(os.Stdout, nil))` and calls `slog.SetDefault(log)` so the standard logger also emits JSON.
- Each service constructor (`auth.New`, `checkin.New`, `notification.New`, `billing.New`) gains a `log *slog.Logger` parameter. Services store it as `s.log`.
- Worker `Run` gains a `log *slog.Logger` parameter.
- All call sites use `s.log.ErrorContext(ctx, "message", "key", value)` or `s.log.InfoContext(ctx, "message")` with structured key-value attributes — no string formatting.
- `main.go` startup/shutdown lines use `slog.Default()` directly.
- `log.Fatalf` in `main.go` and `config.go` become `slog.Default().Error(...)` followed by `os.Exit(1)`.

**Log levels used:**
- `Info` — normal operational events (server started, email sent, worker tick)
- `Warn` — recoverable anomalies (email send failed but logged, cleanup skipped)
- `Error` — failures that need investigation (DB errors, unexpected states)

---

## Section 2 — Request ID Middleware

**What:** Generate/propagate a request ID per HTTP request. Log it. Return it to callers.

**How:**
- New file `internal/api/middleware/requestid.go`.
- `RequestID()` middleware: checks `X-Request-ID` request header; if absent, generates `uuid.New().String()`. Stores ID in context via typed key `requestIDKey`. Sets `X-Request-ID` response header.
- Helper `RequestIDFromCtx(ctx context.Context) string` exported from the same file.
- Registered on the router before all other middleware: `r.Use(middleware.RequestID())`.
- Services that log errors pull the request ID via `middleware.RequestIDFromCtx(ctx)` and include it as a `slog` attribute: `"request_id", requestID`.

**Wire-up in `NewServer`:**
```go
r.Use(middleware.RequestID())
r.Use(chimw.Logger)   // chi's logger runs after, so request ID is in context
r.Use(chimw.Recoverer)
r.Use(chimw.Timeout(30 * time.Second))
r.Use(corsMiddleware(corsOrigin))
```

---

## Section 3 — Fix `BuildScoreInput` Duplication

**What:** `checkin.Upsert` manually builds `score.Input` instead of calling `BuildScoreInput`.

**Where:** `internal/service/checkin/service.go`, `Upsert` method, lines 116–136.

**How:** Delete the inline block. Replace with:
```go
in := BuildScoreInput(user, recent, &req.Stress, today)
```

`BuildScoreInput` already handles the exact same logic (exclude today from recent, extract estimated score). Zero new code, one fewer place to maintain.

**Note:** `GetScoreCard` correctly uses the same inline pattern for its own slightly different case (today may or may not exist). `BuildScoreInput` signature accommodates both. Verify the call is correct after the change.

---

## Section 4 — `HTTPError` Interface to Decouple `respond`

**What:** `respond.ServiceError` currently imports `authsvc`, `checkinsvc`, `insightsvc` directly. Adding any new service requires a `respond` edit — wrong layer to own this.

**How:**

Define in `internal/api/respond/respond.go`:
```go
// HTTPError is implemented by service sentinel errors to declare their own HTTP status.
type HTTPError interface {
    error
    HTTPStatus() int
}
```

Add `HTTPStatus() int` methods to each sentinel error. Since sentinels are `errors.New` values (not types), wrap them as named types:

```go
// internal/service/auth/errors.go
type authError struct{ msg string; status int }
func (e authError) Error() string  { return e.msg }
func (e authError) HTTPStatus() int { return e.status }

var (
    ErrEmailInUse           = authError{"email already in use", http.StatusConflict}
    ErrInvalidCredentials   = authError{"invalid credentials", http.StatusUnauthorized}
    ErrInvalidToken         = authError{"invalid or expired token", http.StatusBadRequest}
    ErrEmailAlreadyVerified = authError{"email already verified", http.StatusConflict}
    ErrEmailServiceDisabled = authError{"email service unavailable", http.StatusServiceUnavailable}
)
```

Same pattern for `checkin.ErrInvalidStress` (400) and `insight.ErrInvalidComponent` (400).

`ServiceError` becomes:
```go
func ServiceError(w http.ResponseWriter, err error) {
    var he HTTPError
    if errors.As(err, &he) {
        Error(w, he.HTTPStatus(), he.Error())
        return
    }
    Error(w, http.StatusInternalServerError, "internal server error")
}
```

`respond.go` drops all three service imports. Future services get HTTP status for free by implementing the interface.

**Compatibility:** All existing `errors.Is` checks in tests and handlers continue to work because `errors.As` with the same underlying type satisfies them. Verify with existing tests.

---

## Section 5 — Rate Limiter Goroutine Leak Fix

**What:** `newRateLimiter` spawns a cleanup goroutine that runs forever.

**How:** Pass `ctx context.Context` to `newRateLimiter`. Cleanup goroutine selects on `ctx.Done()`:

```go
func newRateLimiter(ctx context.Context, max int, period time.Duration) *rateLimiter {
    rl := &rateLimiter{...}
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
```

`RateLimit` middleware factory signature:
```go
func RateLimit(ctx context.Context, max int, window time.Duration) func(http.Handler) http.Handler
```

`NewServer` passes a context. Since `NewServer` doesn't currently receive a context, add `Ctx context.Context` to `ServerConfig`. `main.go` passes the signal context.

---

## Section 6 — Remove Validation Duplication

**What:** `auth.Service.ResetPassword` line 281 manually checks `len(req.Password) < 8` instead of using `validate.Password`.

**How:** Replace:
```go
if len(req.Password) < 8 {
    return fmt.Errorf("password must be at least 8 characters")
}
```
with:
```go
if err := validate.Password(req.Password); err != nil {
    return err
}
```

The `auth` package gains a dependency on `validate`. Both packages are internal; no cycle risk (`validate` has no imports from `auth`).

---

## Section 7 — `Retry-After` Header on 429

**What:** Rate-limited responses should tell clients when to retry.

**How:** In `internal/api/middleware/ratelimit.go`, before writing the 429 response:
```go
w.Header().Set("Retry-After", "60")
respond.Error(w, http.StatusTooManyRequests, "too many requests — try again in a minute")
```

The value `"60"` matches the `time.Minute` window configured in `NewServer`. If the window becomes configurable, derive the value from the period parameter.

---

## Section 8 — Dependency Updates

Update to latest stable versions:
- `github.com/go-chi/chi/v5` → v5.2.1
- `github.com/jackc/pgx/v5` → v5.7.2
- `golang.org/x/crypto` → v0.37.0
- `github.com/golang-jwt/jwt/v5` → v5.2.2

Run `go get` for each, then `go mod tidy`. Verify build and tests pass. No API-breaking changes expected from any of these upgrades.

---

## Error Handling

- No changes to error propagation paths. `ServiceError` becomes more general, not less safe.
- The `HTTPError` type conversion means `errors.Is` still works for equality checks in tests. `errors.As` is used in `ServiceError` which is consistent with idiomatic Go error handling.
- Sentinel error values that were `var Err = errors.New(...)` become typed structs. Callers using `errors.Is` will still match because `errors.Is` uses `==` comparison on the value, and named struct values compare by value — this works as long as the error variables are package-level singletons (they are).

---

## Testing Strategy

- Existing `score` package tests require no changes.
- After Section 4, run the full test suite to confirm `errors.Is` checks still pass.
- Manual smoke test of the rate limiter to confirm `Retry-After` appears in response headers.
- Build must pass with `go build ./...` after dep updates.

---

## Files Changed

| File | Change |
|------|--------|
| `cmd/server/main.go` | slog setup, inject logger, pass ctx to ServerConfig |
| `cmd/server/config.go` | slog for fatal errors |
| `internal/api/server.go` | add Ctx to ServerConfig, pass ctx to RateLimit, logger injection |
| `internal/api/middleware/requestid.go` | **new** — RequestID middleware |
| `internal/api/middleware/ratelimit.go` | ctx param, Retry-After header |
| `internal/api/respond/respond.go` | HTTPError interface, remove service imports |
| `internal/service/auth/errors.go` | authError type with HTTPStatus |
| `internal/service/auth/service.go` | logger injection, remove manual password check |
| `internal/service/checkin/errors.go` | checkinError type with HTTPStatus |
| `internal/service/checkin/service.go` | logger injection, use BuildScoreInput in Upsert |
| `internal/service/insight/errors.go` | insightError type with HTTPStatus |
| `internal/service/insight/service.go` | logger injection |
| `internal/service/notification/service.go` | logger injection |
| `internal/service/billing/service.go` | logger injection |
| `internal/worker/scheduler.go` | logger injection |
| `go.mod` / `go.sum` | dependency updates |
