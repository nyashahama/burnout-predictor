# burnout-predictor-api

REST API backend for [Overload](https://overload.app) — a burnout prediction tool for engineers, designers, and founders.

Built with Go 1.22, chi, pgx, and sqlc. Deployed as a single binary.

---

## Stack

| Layer | Technology |
|---|---|
| Language | Go 1.22 |
| Router | chi v5 |
| Database | PostgreSQL (pgx v5 + sqlc) |
| Auth | JWT (HS256) + refresh tokens |
| Email | Resend |
| AI | OpenAI |
| Billing | Paddle (webhooks) |

---

## Project layout

```
cmd/server/          Entry point and config (env vars)
internal/
  api/
    handler/         HTTP handlers (one file per domain)
    middleware/      Auth (JWT) and rate limiter
    validate/        Pure input validation helpers
    respond/         JSON response helpers
    server.go        Router, CORS middleware, health handler
  service/
    auth/            Registration, login, tokens, password, email
    billing/         Paddle webhook processing
    checkin/         Daily check-in logic
    insight/         AI-generated insights
    notification/    Email notification scheduling
  score/             Burnout score engine (pure, fully tested)
  store/             store.Postgres — implements all service interfaces
  db/sqlc/           sqlc-generated DB access layer
  ai/                OpenAI client wrapper
  email/             Resend client + email templates
  worker/            Background scheduler (notifications, AI jobs)
```

---

## Getting started

### Prerequisites

- Go 1.22+
- PostgreSQL 15+

### 1. Clone and configure

```bash
cp .env.example .env
# fill in DATABASE_URL and JWT_SECRET at minimum
```

### 2. Run database migrations

```bash
psql $DATABASE_URL -f migrations/*.sql
```

### 3. Start the server

```bash
go run ./cmd/server
```

The server listens on `PORT` (default `8080`).

---

## Environment variables

See [`.env.example`](.env.example) for the full list. Required vars:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |

Optional:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `APP_ENV` | `development` | Environment mode (`development`, `test`, `production`, etc.) |
| `CORS_ORIGIN` | `http://localhost:3000` in development | Allowed CORS origin(s); required outside development/test |
| `RESEND_API_KEY` | _(none)_ | Enables transactional email |
| `EMAIL_FROM` | `Overload <noreply@overload.app>` | Sender address |
| `OPENAI_API_KEY` | _(none)_ | Enables AI-generated insights |
| `PADDLE_WEBHOOK_SECRET` | _(none)_ | Enables Paddle webhook signature verification |
| `APP_URL` | `https://overload.app` | Used in email links |

---

## API reference

### Public

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Server and DB health check |
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Login, receive JWT + refresh token |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/forgot-password` | Send password reset email |
| `POST` | `/api/auth/reset-password` | Complete password reset |
| `POST` | `/api/auth/verify-email` | Verify email address |
| `POST` | `/api/webhooks/paddle` | Paddle billing webhooks |

### Authenticated (Bearer token required)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/logout` | Revoke session |
| `POST` | `/api/auth/resend-verification` | Re-send verification email |
| `GET` | `/api/user` | Get profile |
| `PATCH` | `/api/user` | Update profile |
| `PATCH` | `/api/user/password` | Change password |
| `PATCH` | `/api/user/email` | Change email (requires password) |
| `DELETE` | `/api/user` | Delete account (soft delete) |
| `GET` | `/api/user/subscription` | Active subscription details |
| `GET` | `/api/user/export` | Export all user data (GDPR) |
| `GET` | `/api/notifications/prefs` | Get notification preferences |
| `PATCH` | `/api/notifications/prefs` | Update notification preferences |
| `GET` | `/api/score` | Today's burnout score card |
| `POST` | `/api/checkins` | Submit or update today's check-in |
| `GET` | `/api/checkins` | Check-in history |
| `GET` | `/api/insights` | AI-generated insights |
| `POST` | `/api/insights/dismiss` | Dismiss an insight component |
| `GET` | `/api/follow-ups` | Today's follow-up prompts |
| `POST` | `/api/follow-ups/{id}/dismiss` | Dismiss a follow-up |

---

## Score engine

The burnout score (0–100) is computed from:

- **Stress rating** (1–5) from the daily check-in
- **Role modifier** — founders carry the most ambient load, designers the least
- **Sleep baseline** — below 8 hours adds load; 9+ gives a reduction
- **Arc and pattern modifiers** — trend direction and multi-day patterns (overload, recovery, volatility)

The engine lives in `internal/score/` and has no external dependencies. Run its tests with:

```bash
go test ./internal/score/...
```

---

## Background worker

`internal/worker` runs three ticker loops in a goroutine:

| Interval | Job |
|---|---|
| 1 min | Check and send due reminder notifications |
| 5 min | Generate AI insights for recent check-ins |
| 1 hour | Housekeeping (expire tokens, etc.) |

The worker shuts down cleanly when the server receives `SIGTERM` or `SIGINT`.

---

## Docker

```bash
docker build -t burnout-predictor-api .
docker run -p 8080:8080 --env-file .env burnout-predictor-api
```

---

## Running tests

```bash
go test ./...
```

---

## Known issues

See [open issues](https://github.com/nyashahama/burnout-predictor/issues) — in particular #14–#17 (security) which are tracked but not yet fixed.
