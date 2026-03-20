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
  └─ *slog.Logger (created here, injected into each service)
  └─ middleware.RequestID (new, runs first on router)
  └─ service/* (each receives *slog.Logger)

respond.ServiceError
  └─ HTTPError interface (no service imports)

service/auth, service/checkin, service/insight
  └─ sentinel errors implement HTTPError
```

---

## Section 1 — Structured Logging (`slog`)

**What:** Replace all `log.Printf` / `log.Fatalf` / `log.Println` with `*slog.Logger`.

**How:**
- `main.go` creates `logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))` and calls `slog.SetDefault(logger)`.
- Each service constructor (`auth.New`, `checkin.New`, `notification.New`, `billing.New`) gains a `log *slog.Logger` parameter. Services store it as `s.log`.
- The worker `Run(ctx context.Context, notif *notificationsvc.Service)` signature does **not** change — the worker itself has no log calls; all logging happens inside the notification service it calls. The notification service's own `s.log` handles it.
- All log call sites use structured key-value attributes: `s.log.ErrorContext(ctx, "message", "key", value)`. No `fmt.Sprintf` for log messages.
- `main.go` startup/shutdown lines use `slog.Default()` directly.
- `log.Fatal` / `log.Fatalf` in `main.go` and `config.go` become `slog.Default().Error("message", "err", err)` followed by `os.Exit(1)`.
- `config.go` currently does not import `"os"`. The `"os"` import must be added when `os.Exit(1)` is introduced.

**Log levels used:**
- `Info` — normal operational events (server started, email sent)
- `Warn` — recoverable anomalies (email send failed but logged, cleanup skipped)
- `Error` — failures that need investigation (DB errors, unexpected states)

---

## Section 2 — Request ID Middleware

**What:** Generate/propagate a request ID per HTTP request. Return it to callers.

**How:**
- New file `internal/api/middleware/requestid.go`.
- `RequestID()` middleware: checks `X-Request-ID` request header; if absent, generates `uuid.New().String()`. Stores ID in context via typed key `requestIDKey`. Sets `X-Request-ID` response header.
- The context key and `RequestIDFromCtx` helper live in a new shared package `internal/reqid/reqid.go` — **not** in the middleware package — so service packages can call `reqid.FromCtx(ctx)` without importing `internal/api/middleware` (which would be a layer violation).
- `internal/api/middleware/requestid.go` imports `internal/reqid` and calls `reqid.Set(ctx, id)` to store the ID.
- Registered as the first middleware on the router.
- Services include the request ID in all error/warn log calls: `s.log.ErrorContext(ctx, "msg", "request_id", reqid.FromCtx(ctx), "err", err)`.

**Wire-up in `NewServer`:**
```go
r.Use(middleware.RequestID())
r.Use(chimw.Logger)
r.Use(chimw.Recoverer)
r.Use(chimw.Timeout(30 * time.Second))
r.Use(corsMiddleware(corsOrigin))
```

---

## Section 3 — Fix `BuildScoreInput` Duplication

**What:** `checkin.Upsert` manually builds `score.Input` instead of calling `BuildScoreInput`.

**Where:** `internal/service/checkin/service.go`, `Upsert` method, the inline block that builds `recentStresses` and `in`.

**How:** Delete the inline block (manual `recentStresses` construction and `score.Input` literal). Replace with:
```go
in := BuildScoreInput(user, recent, &req.Stress, today)
```

**Critical:** `recentStresses` is referenced later in `Upsert` at the `BuildScoreExplanation` and `BuildSuggestion` calls at the bottom of the method. After the replacement, use `in.RecentStresses` everywhere the deleted local `recentStresses` variable was used:

```go
// BuildScoreExplanation — before:
Explanation: score.BuildScoreExplanation(score.ExplanationInput{
    ...
    RecentStresses: recentStresses,
}),
// After:
Explanation: score.BuildScoreExplanation(score.ExplanationInput{
    ...
    RecentStresses: in.RecentStresses,
}),
```

The `BuildSuggestion` call does **not** reference `recentStresses` directly — it only uses `out.Score`, `hasTodayCI`, and `danger`, so no change is needed there. Apply `in.RecentStresses` only at the `BuildScoreExplanation` call site.

`GetScoreCard` already has its own slightly different inline pattern (today check-in may or may not exist); it is left as-is.

---

## Section 4 — `HTTPError` Interface to Decouple `respond`

**What:** `respond.ServiceError` currently imports `authsvc`, `checkinsvc`, `insightsvc` directly. Adding any new service requires a `respond` edit — wrong layer.

**Scope:** Only errors surfaced through HTTP handlers via `ServiceError` need `HTTPError`. Confirmed non-HTTP errors:
- `billing.ErrEventAlreadyProcessed` — handled directly in `webhook.go`, never reaches `ServiceError`. No change needed.
- `notification.ErrEmailDisabled` — only used inside background worker tasks, never in an HTTP handler. No change needed.

**How:**

Define in `internal/api/respond/respond.go`:
```go
// HTTPError is implemented by service sentinel errors to declare their own HTTP status.
type HTTPError interface {
    error
    HTTPStatus() int
}
```

Convert sentinel errors to named types. Since sentinels are currently `errors.New` values (pointer equality), they become named value-type structs. **Important:** All sentinel variables are package-level singletons. `errors.Is` compares them by `==` on the struct value — two `authError` structs with the same fields are equal. Since no call site wraps these sentinels with `fmt.Errorf("%w", ...)`, `errors.Is` continues to work for any caller that compares against the package-level variable directly. The sentinels are returned directly from service methods, never wrapped.

```go
// internal/service/auth/errors.go
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

`respond.go` drops all three service imports. Future services implement `HTTPError` on their own errors — no file to touch here.

---

## Section 5 — Rate Limiter Goroutine Leak Fix

**What:** `newRateLimiter` spawns a cleanup goroutine that runs forever with no shutdown path.

**How:** Pass `ctx context.Context` as the first parameter to `newRateLimiter`. Cleanup goroutine selects on `ctx.Done()`:

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

`RateLimit` middleware factory gains `ctx` as first parameter:
```go
func RateLimit(ctx context.Context, max int, window time.Duration) func(http.Handler) http.Handler
```

`NewServer` needs to receive a context to pass to `RateLimit`. The idiomatic Go pattern is **not** to store a context in a config struct. Instead, change the function signature:

```go
// Before:
func NewServer(cfg ServerConfig) http.Handler

// After:
func NewServer(ctx context.Context, cfg ServerConfig) http.Handler
```

`main.go` call site becomes `api.NewServer(ctx, api.ServerConfig{...})`. `ServerConfig` struct is unchanged — no `Ctx` field added.

---

## Section 6 — Remove Validation Duplication

**What:** `auth.Service.ResetPassword` manually checks `len(req.Password) < 8` instead of using `validate.Password`.

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

The `auth` package gains an import on `validate`. No import cycle: `validate` has no imports from `auth` or any service package.

---

## Section 7 — `Retry-After` Header on 429

**What:** Rate-limited responses should tell clients when to retry.

**How:** In `internal/api/middleware/ratelimit.go`, in the `RateLimit` handler closure, before writing the error response:

```go
w.Header().Set("Retry-After", strconv.Itoa(int(window.Seconds())))
respond.Error(w, http.StatusTooManyRequests, "too many requests — try again in a minute")
```

The value is derived from the `window time.Duration` parameter that is already in scope in the closure — no hardcoding needed. Add `"strconv"` to the import block.

---

## Section 8 — Dependency Updates

Update to latest stable versions:
- `github.com/go-chi/chi/v5` → v5.2.1
- `github.com/jackc/pgx/v5` → v5.7.2
- `golang.org/x/crypto` → v0.37.0
- `github.com/golang-jwt/jwt/v5` → v5.2.2

Run `go get` for each, then `go mod tidy`. Verify `go build ./...` and `go test ./...` pass. No API-breaking changes expected from any of these upgrades.

---

## Error Handling

- No changes to error propagation paths. `ServiceError` becomes more general, not less safe.
- Sentinel errors converted from `errors.New` to named value-type structs. `errors.Is` compares by `==` on struct value. Since the sentinels are package-level singletons and are never wrapped at any call site, all existing `errors.Is` checks continue to pass.
- `errors.As(err, &he)` in `ServiceError` matches a value-type `authError` because `authError` implements `HTTPError` on value receivers. No `Unwrap` is needed; the sentinels are returned directly.
- `billing.ErrEventAlreadyProcessed` and `notification.ErrEmailDisabled` are not HTTP-facing — they require no changes.

---

## Testing Strategy

- `go test ./...` must pass after Section 4 to confirm `errors.Is` checks still work.
- `go build ./...` must pass after Section 8 (dep updates).
- Manually verify `X-Request-ID` appears in response headers after Section 2.
- Manually verify `Retry-After` appears in 429 response headers after Section 7.

---

## Files Changed

| File | Change |
|------|--------|
| `cmd/server/main.go` | slog setup, inject logger into services, `NewServer(ctx, cfg)` call site |
| `cmd/server/config.go` | replace `log.Fatal` with slog + `os.Exit(1)`; add `"os"` import; remove `"log"` import |
| `internal/api/server.go` | `NewServer(ctx, cfg)` signature, pass ctx to `RateLimit`, inject logger |
| `internal/api/middleware/requestid.go` | **new** — `RequestID()` middleware + `RequestIDFromCtx` |
| `internal/api/middleware/ratelimit.go` | ctx param, `Retry-After` header using `window.Seconds()`, add `"strconv"` import |
| `internal/api/respond/respond.go` | `HTTPError` interface, `errors.As` in `ServiceError`, remove service imports |
| `internal/service/auth/errors.go` | `authError` typed struct with `HTTPStatus()` |
| `internal/service/auth/service.go` | logger injection, replace manual password check with `validate.Password` |
| `internal/service/checkin/errors.go` | `checkinError` typed struct with `HTTPStatus()` |
| `internal/service/checkin/service.go` | logger injection, use `BuildScoreInput` in `Upsert`, use `in.RecentStresses` downstream |
| `internal/service/insight/errors.go` | `insightError` typed struct with `HTTPStatus()` |
| `internal/service/notification/service.go` | logger injection |
| `internal/service/billing/service.go` | logger injection |
| `internal/reqid/reqid.go` | **new** — shared request ID context key; imported by middleware and services to avoid layer violation |
| `go.mod` / `go.sum` | dependency updates |

**Note:** `internal/service/insight/service.go` has no log calls — logger injection omitted (YAGNI). `internal/worker/scheduler.go` has no log calls — the notification service owns its own logger.
