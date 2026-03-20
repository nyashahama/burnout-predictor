# Handler Unit Tests — Design Spec

**Date:** 2026-03-20
**Status:** Approved
**Scope:** Black-box unit tests for all 9 HTTP handler files using hand-written function-field mocks. No database, no integration concerns.

---

## Problem Statement

The handler layer (`internal/api/handler/`) has zero test coverage. Handlers contain non-trivial logic: input validation, service error mapping via `respond.ServiceError`, and response shaping. A production bug in any of these paths is invisible until it hits a real user.

---

## Architecture

No structural changes to production code except one exported helper added to `internal/api/middleware/auth.go`:

```go
// SetUserInCtx stores a user in context — mirrors what the Auth middleware does.
// Used by handler tests to simulate an authenticated request without running JWT validation.
func SetUserInCtx(ctx context.Context, user db.User) context.Context {
    return context.WithValue(ctx, userContextKey, user)
}
```

All test files live in `internal/api/handler/`, in `package handler_test` (black-box). A shared `testhelpers_test.go` holds three utilities visible to all test files in the directory.

---

## Section 1 — File Structure

**Modified:**
- `internal/api/middleware/auth.go` — add `SetUserInCtx`

**New test files:**
- `internal/api/handler/testhelpers_test.go` — shared test utilities
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

## Section 2 — Mock Pattern

Each test file defines a mock struct implementing the interface declared in that handler file. Methods nil-guard so only the function under test needs to be wired.

```go
type mockAuthService struct {
    RegisterFn          func(ctx context.Context, req authsvc.RegisterRequest) (authsvc.RegisterResult, error)
    LoginFn             func(ctx context.Context, req authsvc.LoginRequest) (authsvc.LoginResult, error)
    RefreshFn           func(ctx context.Context, req authsvc.RefreshRequest) (authsvc.RefreshResult, error)
    LogoutFn            func(ctx context.Context, userID uuid.UUID) error
    VerifyEmailFn       func(ctx context.Context, req authsvc.VerifyEmailRequest) error
    ResendVerificationFn func(ctx context.Context, user db.User) error
    ForgotPasswordFn    func(ctx context.Context, req authsvc.ForgotPasswordRequest) error
    ResetPasswordFn     func(ctx context.Context, req authsvc.ResetPasswordRequest) error
    ChangePasswordFn    func(ctx context.Context, user db.User, req authsvc.ChangePasswordRequest) error
    ChangeEmailFn       func(ctx context.Context, user db.User, req authsvc.ChangeEmailRequest) (authsvc.UserResponse, error)
    DeleteAccountFn     func(ctx context.Context, userID uuid.UUID) error
}

func (m *mockAuthService) Register(ctx context.Context, req authsvc.RegisterRequest) (authsvc.RegisterResult, error) {
    if m.RegisterFn != nil {
        return m.RegisterFn(ctx, req)
    }
    return authsvc.RegisterResult{}, nil
}
// ... same nil-guard pattern for all methods
```

The nil guard means validation tests set no functions — if a test inadvertently reaches the service call, it gets a zero value rather than a panic.

---

## Section 3 — Shared Test Helpers (`testhelpers_test.go`)

```go
package handler_test

// jsonBody marshals v to JSON and returns it as an io.Reader suitable for request bodies.
func jsonBody(t *testing.T, v any) io.Reader

// withUser injects user into the request context, simulating what the Auth middleware does.
func withUser(r *http.Request, user db.User) *http.Request {
    return r.WithContext(middleware.SetUserInCtx(r.Context(), user))
}

// decodeJSON decodes the recorder's response body into v.
func decodeJSON(t *testing.T, w *httptest.ResponseRecorder, v any)
```

---

## Section 4 — Coverage Per Handler

### `auth_test.go`

| Endpoint | What is tested |
|---|---|
| Register | invalid JSON → 400; bad email → 400; short password → 400; bad role → 400; bad sleep_baseline → 400; bad timezone → 400; `ErrEmailInUse` → 409; success → 201 |
| Login | invalid JSON → 400; `ErrInvalidCredentials` → 401; success → 200 |
| RefreshToken | missing `refresh_token` → 400; `ErrInvalidToken` → 400; success → 200 |
| Logout | success → 200 (service error is intentionally ignored) |
| VerifyEmail | missing `token` → 400; `ErrInvalidToken` → 400; success → 200 |
| ResendVerification | `ErrEmailServiceDisabled` → 503; success → 200 |
| ForgotPassword | missing `email` → 400; service error ignored → 200 (anti-enumeration); success → 200 |
| ResetPassword | missing `token`/`password` → 400; `ErrInvalidToken` → 400; success → 200 |
| ChangePassword | invalid JSON → 400; short password → 400; `ErrInvalidCredentials` → 401; success → 200 |
| ChangeEmail | invalid JSON → 400; bad email → 400; `ErrEmailInUse` → 409; success → 200 |
| DeleteAccount | service error → 500 (via `respond.Error` directly — hardcoded, not mapped through `respond.ServiceError`); success → 204 |

### `checkin_test.go`

| Endpoint | What is tested |
|---|---|
| Upsert | invalid JSON → 400; note too long → 400; `ErrInvalidStress` → 400 (returned by service, mapped via `respond.ServiceError`; mock `UpsertFn` must return the real `checkinsvc.ErrInvalidStress` sentinel — plain `errors.New` would produce 500); success → 200 |
| GetScoreCard | service error → 500 (via `respond.ServiceError`; use plain `errors.New` in the mock — no `HTTPError` sentinel needed to reach 500); success → 200 |
| List | service error → 500 (via `respond.ServiceError`; use plain `errors.New` in the mock); success → 200 |

### `insight_test.go`

| Endpoint | What is tested |
|---|---|
| Get | service error → 500 (via `respond.ServiceError`); success → 200 |
| DismissComponent | invalid JSON → 400; `ErrInvalidComponent` → 400 (returned by service, mapped via `respond.ServiceError`; mock `DismissComponentFn` must return the real `insightsvc.ErrInvalidComponent` sentinel); success → 200 |

### `user_test.go`

| Endpoint | What is tested |
|---|---|
| GetProfile | success → 200 |
| UpdateProfile | invalid JSON → 400; bad role → 400; bad sleep_baseline → 400; bad timezone → 400; service error → 500 (via `respond.ServiceError`); success → 200 |

### `followup_test.go`

| Endpoint | What is tested |
|---|---|
| GetToday | any store error → 200 with `{"follow_up": null}`; success with unsurfaced follow-up (`SurfacedAt.Valid = false`) → 200 with follow-up object (and `MarkFollowUpSurfaced` called); success with already-surfaced follow-up (`SurfacedAt.Valid = true`) → 200 with follow-up object (and `MarkFollowUpSurfaced` NOT called) |
| Dismiss | malformed UUID path param → 400; store error → 500 (via `respond.Error` directly — any `error` value suffices in the mock, `HTTPStatus()` is not consulted); success → 200 |

Note for `followup_test.go`: `mockFollowUpStore` must expose a `MarkFollowUpSurfacedFn` function field — `GetToday` calls `MarkFollowUpSurfaced` when the returned follow-up has `SurfacedAt.Valid = false`.

### `notifprefs_test.go`

| Endpoint | What is tested |
|---|---|
| Get | `GetNotificationPrefs` error → `CreateDefaultNotificationPrefs` called → 200; success (prefs exist) → 200 |
| Update | invalid JSON → 400; bad `reminder_time` → 400; `UpsertNotificationPrefs` error → 500 (via `respond.Error` directly — hardcoded, not mapped through `respond.ServiceError`); success → 200 |

Notes for `notifprefs_test.go`:
- `mockNotifPrefsStore` must expose a `CreateDefaultNotificationPrefsFn` function field — `Get` calls `CreateDefaultNotificationPrefs` on any `GetNotificationPrefs` error. For the happy-path test (prefs exist, `GetNotificationPrefs` succeeds), `CreateDefaultNotificationPrefsFn` does NOT need to be set — the fallback branch is never reached.
- `CreateDefaultNotificationPrefs` error is silently discarded (`prefs, _ = ...`): if both store calls fail, `toPrefsResponse` is called with a zero-value `db.UserNotificationPref` and the handler still returns 200. Tests need not cover this sub-case, but must not assert that a `CreateDefaultNotificationPrefs` failure produces a non-200.

### `subscription_test.go`

| Endpoint | What is tested |
|---|---|
| Get | store error (no active subscription) → 200 with `{"subscription": null}`; success → 200 with subscription object |

### `export_test.go`

| Endpoint | What is tested |
|---|---|
| Get | store error → 500; success → 200 with `Content-Disposition: attachment; filename="overload-export.json"` header set |

Note: `export.go` does not use `respond.JSON` — it calls `json.NewEncoder(w).Encode(payload)` directly after setting response headers. The success test should assert `Content-Disposition` is present in addition to the 200 status.

### `webhook_test.go`

Special: test file includes a local `paddleSignatureHeader(secret []byte, body []byte, ts string) string` helper that computes a valid HMAC-SHA256 `Paddle-Signature` header. The returned string must be in the format `"ts=<ts>;h1=<lowercase-hex-hmac>"` — the production `verifyPaddleSignature` parser splits on `;`, trims whitespace per segment, and expects exactly the `ts=` and `h1=` prefixes. Both `"ts=1234;h1=abc"` (no space) and `"ts=1234; h1=abc"` (space after `;`) are accepted by the parser; the helper may produce either form.

The HMAC message to sign is `ts + ":" + string(body)` (timestamp, colon, raw body bytes). The signed string must use exactly this format or the "Valid signature" test will produce a 401.

| Scenario | What is tested |
|---|---|
| No secret configured | signature check skipped → 200 |
| Valid signature | 200 |
| Invalid signature | 401 |
| Malformed JSON body | 400 |
| Valid JSON with empty `event_id` | 400 (the handler checks `event.EventID == ""` after unmarshal) |
| `alreadyProcessed = true` | 200 with `"already processed"` |
| Service error | 500 |

---

## Section 5 — Test Naming Convention

All tests follow Go table-driven style where multiple inputs share the same assertion logic, and separate test functions where behaviour diverges meaningfully:

```go
func TestAuthHandler_Register_ValidationErrors(t *testing.T) { ... } // table-driven
func TestAuthHandler_Register_ServiceError(t *testing.T) { ... }
func TestAuthHandler_Register_Success(t *testing.T) { ... }
```

---

## Notes

- `followup.go`, `subscription.go`, `export.go`, and `notifprefs.go` all access the store directly (no service layer). Their handlers accept a store interface — mocks follow the same function-field pattern.
- `export.go` declares an unused `exportUserService` interface alongside `exportStore`. The handler only uses `exportStore`; no mock for `exportUserService` is needed.
- Tests do not assert on response body content beyond status code and JSON shape for success paths. Exact field values are service-layer concerns, already covered by score engine tests.
- The unauthenticated `auth.go` endpoints (`Register`, `Login`, `RefreshToken`, `ForgotPassword`, `ResetPassword`, `VerifyEmail`) do not call `middleware.UserFromCtx`; the `withUser` helper is not needed for those tests. All remaining `auth.go` endpoints (`Logout`, `ResendVerification`, `ChangePassword`, `ChangeEmail`, `DeleteAccount`) and all endpoints in the other 8 handler files require `withUser` to inject the authenticated user.
- `go test ./internal/api/handler/...` must pass with zero failures after this work.
