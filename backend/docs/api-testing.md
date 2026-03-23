# API Testing Guide

Base URL: `http://localhost:8080`

All authenticated endpoints require the header:
```
Authorization: Bearer <access_token>
```

Tokens are obtained from `/api/auth/login` or `/api/auth/register`.

---

## Table of Contents

1. [Health](#1-health)
2. [Auth — Register](#2-auth--register)
3. [Auth — Login](#3-auth--login)
4. [Auth — Refresh Token](#4-auth--refresh-token)
5. [Auth — Logout](#5-auth--logout)
6. [Auth — Verify Email](#6-auth--verify-email)
7. [Auth — Resend Verification](#7-auth--resend-verification)
8. [Auth — Forgot Password](#8-auth--forgot-password)
9. [Auth — Reset Password](#9-auth--reset-password)
10. [Auth — Change Password](#10-auth--change-password)
11. [Auth — Change Email](#11-auth--change-email)
12. [Auth — Delete Account](#12-auth--delete-account)
13. [User — Get Profile](#13-user--get-profile)
14. [User — Update Profile](#14-user--update-profile)
15. [User — Get Subscription](#15-user--get-subscription)
16. [User — Export Data](#16-user--export-data)
17. [Notifications — Get Prefs](#17-notifications--get-prefs)
18. [Notifications — Update Prefs](#18-notifications--update-prefs)
19. [Score — Get Scorecard](#19-score--get-scorecard)
20. [Check-ins — Upsert](#20-check-ins--upsert)
21. [Check-ins — List](#21-check-ins--list)
22. [Insights — Get](#22-insights--get)
23. [Insights — Dismiss Component](#23-insights--dismiss-component)
24. [Follow-ups — Get Today](#24-follow-ups--get-today)
25. [Follow-ups — Dismiss](#25-follow-ups--dismiss)
26. [Webhooks — Paddle](#26-webhooks--paddle)

---

## Validation Reference

| Field | Rules |
|---|---|
| `email` | Valid RFC 5322 address, domain must contain a dot |
| `password` | Minimum 8 characters |
| `role` | One of: `engineer`, `designer`, `pm`, `manager`, `founder`, `other` |
| `sleep_baseline` | Integer between `4` and `12` (hours) |
| `timezone` | Valid IANA timezone string (e.g. `America/New_York`) |
| `stress` | Integer `1`–`10` |
| `energy_level` | Integer `1`–`5` (optional) |
| `focus_quality` | Integer `1`–`5` (optional) |
| `hours_worked` | Float `0`–`24` (optional) |
| `physical_symptoms` | Array of: `headache`, `muscle_tension`, `fatigue`, `trouble_sleeping`, `appetite_changes` |
| `note` | String, max 280 characters |
| `reminder_time` | `HH:MM` format (e.g. `09:00`) |

---

## 1. Health

**`GET /health`** — no auth required

### Happy path

```bash
curl http://localhost:8080/health
```

**Expected response `200 OK`:**
```json
{
  "status": "ok",
  "db": "ok",
  "uptime_seconds": 42
}
```

### DB unreachable

When the database cannot be reached the status changes and the HTTP code becomes 503.

**Expected response `503 Service Unavailable`:**
```json
{
  "status": "degraded",
  "db": "unreachable",
  "uptime_seconds": 5
}
```

---

## 2. Auth — Register

**`POST /api/auth/register`** — no auth required

### Happy path

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alex@example.com",
    "password": "hunter2!secure",
    "name": "Alex Johnson",
    "role": "engineer",
    "sleep_baseline": 8,
    "timezone": "America/New_York"
  }'
```

**Expected response `201 Created`:**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "alex@example.com",
    "name": "Alex Johnson",
    "role": "engineer",
    "sleep_baseline": 8,
    "timezone": "America/New_York",
    "email_verified": false,
    "created_at": "2026-03-23T10:00:00Z"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "dGVzdHJlZnJlc2h0b2tlbg=="
}
```

### Invalid email

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "not-an-email", "password": "hunter2!secure", "name": "Alex", "role": "engineer", "timezone": "UTC"}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "invalid email address"}
```

### Password too short

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "alex@example.com", "password": "short", "name": "Alex", "role": "engineer", "timezone": "UTC"}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "password must be at least 8 characters"}
```

### Invalid role

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "alex@example.com", "password": "hunter2!secure", "name": "Alex", "role": "hacker", "timezone": "UTC"}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "role must be one of: engineer, designer, pm, manager, founder, other"}
```

### Invalid sleep baseline

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "alex@example.com", "password": "hunter2!secure", "name": "Alex", "role": "engineer", "sleep_baseline": 2, "timezone": "UTC"}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "sleep_baseline must be between 4 and 12"}
```

### Duplicate email

**Expected response `409 Conflict`:**
```json
{"error": "email already registered"}
```

---

## 3. Auth — Login

**`POST /api/auth/login`** — no auth required

### Happy path

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alex@example.com",
    "password": "hunter2!secure"
  }'
```

**Expected response `200 OK`:**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "alex@example.com",
    "name": "Alex Johnson",
    "role": "engineer",
    "sleep_baseline": 8,
    "timezone": "America/New_York",
    "email_verified": false
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "dGVzdHJlZnJlc2h0b2tlbg=="
}
```

### Wrong password

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alex@example.com", "password": "wrongpassword"}'
```

**Expected response `401 Unauthorized`:**
```json
{"error": "invalid credentials"}
```

### Unknown email

**Expected response `401 Unauthorized`:**
```json
{"error": "invalid credentials"}
```

---

## 4. Auth — Refresh Token

**`POST /api/auth/refresh`** — no auth required

### Happy path

```bash
curl -X POST http://localhost:8080/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "dGVzdHJlZnJlc2h0b2tlbg=="
  }'
```

**Expected response `200 OK`:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "bmV3cmVmcmVzaHRva2Vu"
}
```

### Missing refresh token

```bash
curl -X POST http://localhost:8080/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "refresh_token is required"}
```

### Expired or revoked token

**Expected response `401 Unauthorized`:**
```json
{"error": "refresh token expired or revoked"}
```

---

## 5. Auth — Logout

**`POST /api/auth/logout`** — requires auth

### Happy path

```bash
curl -X POST http://localhost:8080/api/auth/logout \
  -H "Authorization: Bearer <access_token>"
```

**Expected response `200 OK`:**
```json
{"status": "logged out"}
```

---

## 6. Auth — Verify Email

**`POST /api/auth/verify-email`** — no auth required

### Happy path

```bash
curl -X POST http://localhost:8080/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abc123verificationtoken"
  }'
```

**Expected response `200 OK`:**
```json
{"status": "verified"}
```

### Missing token

```bash
curl -X POST http://localhost:8080/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "token is required"}
```

### Invalid or expired token

**Expected response `400 Bad Request`:**
```json
{"error": "invalid or expired token"}
```

---

## 7. Auth — Resend Verification

**`POST /api/auth/resend-verification`** — requires auth

### Happy path

```bash
curl -X POST http://localhost:8080/api/auth/resend-verification \
  -H "Authorization: Bearer <access_token>"
```

**Expected response `200 OK`:**
```json
{"status": "sent"}
```

---

## 8. Auth — Forgot Password

**`POST /api/auth/forgot-password`** — no auth required

The response is intentionally ambiguous — it does not reveal whether the email exists.

### Happy path (email exists)

```bash
curl -X POST http://localhost:8080/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alex@example.com"
  }'
```

**Expected response `200 OK`:**
```json
{"status": "if that email exists, a reset link has been sent"}
```

### Unknown email (same response by design)

```bash
curl -X POST http://localhost:8080/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "nobody@example.com"}'
```

**Expected response `200 OK`:**
```json
{"status": "if that email exists, a reset link has been sent"}
```

### Missing email field

**Expected response `400 Bad Request`:**
```json
{"error": "email is required"}
```

---

## 9. Auth — Reset Password

**`POST /api/auth/reset-password`** — no auth required

### Happy path

```bash
curl -X POST http://localhost:8080/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abc123resettoken",
    "password": "newSecurePassword1"
  }'
```

**Expected response `200 OK`:**
```json
{"status": "password reset"}
```

### Missing token or password

```bash
curl -X POST http://localhost:8080/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token": "abc123"}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "token and password are required"}
```

### Password too short

```bash
curl -X POST http://localhost:8080/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token": "abc123resettoken", "password": "tiny"}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "password must be at least 8 characters"}
```

### Expired or already-used token

**Expected response `400 Bad Request`:**
```json
{"error": "invalid or expired token"}
```

---

## 10. Auth — Change Password

**`PATCH /api/user/password`** — requires auth

### Happy path

```bash
curl -X PATCH http://localhost:8080/api/user/password \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "current_password": "hunter2!secure",
    "new_password": "evenMoreSecure99"
  }'
```

**Expected response `200 OK`:**
```json
{"status": "password updated"}
```

### Wrong current password

**Expected response `401 Unauthorized`:**
```json
{"error": "invalid credentials"}
```

### New password too short

```bash
curl -X PATCH http://localhost:8080/api/user/password \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"current_password": "hunter2!secure", "new_password": "abc"}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "password must be at least 8 characters"}
```

---

## 11. Auth — Change Email

**`PATCH /api/user/email`** — requires auth

### Happy path

```bash
curl -X PATCH http://localhost:8080/api/user/email \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alex.new@example.com"
  }'
```

**Expected response `200 OK`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "alex.new@example.com",
  "name": "Alex Johnson",
  "role": "engineer",
  "email_verified": false
}
```

### Invalid email format

```bash
curl -X PATCH http://localhost:8080/api/user/email \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "bad-email"}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "invalid email address"}
```

---

## 12. Auth — Delete Account

**`DELETE /api/user`** — requires auth

### Happy path

```bash
curl -X DELETE http://localhost:8080/api/user \
  -H "Authorization: Bearer <access_token>"
```

**Expected response `204 No Content`** (empty body)

---

## 13. User — Get Profile

**`GET /api/user`** — requires auth

### Happy path

```bash
curl http://localhost:8080/api/user \
  -H "Authorization: Bearer <access_token>"
```

**Expected response `200 OK`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "alex@example.com",
  "name": "Alex Johnson",
  "role": "engineer",
  "sleep_baseline": 8,
  "timezone": "America/New_York",
  "email_verified": true,
  "created_at": "2026-03-23T10:00:00Z"
}
```

### Missing or invalid token

```bash
curl http://localhost:8080/api/user \
  -H "Authorization: Bearer badtoken"
```

**Expected response `401 Unauthorized`:**
```json
{"error": "unauthorized"}
```

---

## 14. User — Update Profile

**`PATCH /api/user`** — requires auth

All fields are optional.

### Happy path — partial update

```bash
curl -X PATCH http://localhost:8080/api/user \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alexandra Johnson",
    "role": "manager",
    "sleep_baseline": 7,
    "timezone": "Europe/London"
  }'
```

**Expected response `200 OK`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "alex@example.com",
  "name": "Alexandra Johnson",
  "role": "manager",
  "sleep_baseline": 7,
  "timezone": "Europe/London",
  "email_verified": true
}
```

### Invalid role

```bash
curl -X PATCH http://localhost:8080/api/user \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"role": "ninja"}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "role must be one of: engineer, designer, pm, manager, founder, other"}
```

### Invalid sleep baseline

```bash
curl -X PATCH http://localhost:8080/api/user \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"sleep_baseline": 15}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "sleep_baseline must be between 4 and 12"}
```

### Invalid timezone

```bash
curl -X PATCH http://localhost:8080/api/user \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"timezone": "Mars/OlympusMons"}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "invalid timezone"}
```

---

## 15. User — Get Subscription

**`GET /api/user/subscription`** — requires auth

### Happy path — active subscription

```bash
curl http://localhost:8080/api/user/subscription \
  -H "Authorization: Bearer <access_token>"
```

**Expected response `200 OK`:**
```json
{
  "subscription": {
    "plan_name": "pro",
    "status": "active",
    "current_period_end": "2026-04-23T00:00:00Z",
    "cancel_at_period_end": false,
    "seat_count": 1
  }
}
```

### No subscription

**Expected response `200 OK`:**
```json
{"subscription": null}
```

---

## 16. User — Export Data

**`GET /api/user/export`** — requires auth

Downloads all check-in history as a JSON attachment.

### Happy path

```bash
curl http://localhost:8080/api/user/export \
  -H "Authorization: Bearer <access_token>" \
  -o overload-export.json
```

**Expected response `200 OK`** with header `Content-Disposition: attachment; filename="overload-export.json"`:
```json
{
  "user": {
    "email": "alex@example.com",
    "name": "Alex Johnson",
    "role": "engineer"
  },
  "check_ins": [
    {
      "date": "2026-03-22",
      "stress": 7,
      "score": 62,
      "note": "Tough standup, three back-to-back meetings."
    },
    {
      "date": "2026-03-21",
      "stress": 4,
      "score": 78
    }
  ],
  "exported_at": "2026-03-23T10:00:00Z"
}
```

---

## 17. Notifications — Get Prefs

**`GET /api/notifications/prefs`** — requires auth

### Happy path

```bash
curl http://localhost:8080/api/notifications/prefs \
  -H "Authorization: Bearer <access_token>"
```

**Expected response `200 OK`:**
```json
{
  "checkin_reminder": true,
  "reminder_time": "09:00",
  "monday_debrief_email": false,
  "weekly_summary_email": true,
  "streak_alert_email": true,
  "pattern_email": false,
  "re_engage_email": true
}
```

> If no preferences exist yet, defaults are created and returned automatically.

---

## 18. Notifications — Update Prefs

**`PATCH /api/notifications/prefs`** — requires auth

### Happy path

```bash
curl -X PATCH http://localhost:8080/api/notifications/prefs \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "checkin_reminder": true,
    "reminder_time": "08:30",
    "monday_debrief_email": true,
    "weekly_summary_email": true,
    "streak_alert_email": false,
    "pattern_email": true,
    "re_engage_email": false
  }'
```

**Expected response `200 OK`:**
```json
{
  "checkin_reminder": true,
  "reminder_time": "08:30",
  "monday_debrief_email": true,
  "weekly_summary_email": true,
  "streak_alert_email": false,
  "pattern_email": true,
  "re_engage_email": false
}
```

### Invalid reminder time format

```bash
curl -X PATCH http://localhost:8080/api/notifications/prefs \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"checkin_reminder": true, "reminder_time": "9am"}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "reminder_time must be a valid time in HH:MM format"}
```

---

## 19. Score — Get Scorecard

**`GET /api/score`** — requires auth

Returns the current burnout score, trajectory, and suggestions based on recent check-ins.

### Happy path — user has check-ins

```bash
curl http://localhost:8080/api/score \
  -H "Authorization: Bearer <access_token>"
```

**Expected response `200 OK`:**
```json
{
  "score": {
    "value": 64,
    "label": "Moderate",
    "color": "amber"
  },
  "explanation": "Your stress has been elevated for 3 consecutive days.",
  "suggestion": "Consider blocking 30 minutes of focus time tomorrow morning.",
  "trajectory": "worsening",
  "accuracy_label": "estimated",
  "streak": 5,
  "has_checkin": true
}
```

### No check-ins yet

**Expected response `200 OK`:**
```json
{
  "score": {
    "value": 50,
    "label": "Moderate",
    "color": "amber"
  },
  "explanation": "Not enough data yet — check in daily for a more accurate score.",
  "suggestion": "Log your first check-in to get started.",
  "trajectory": "stable",
  "accuracy_label": "estimated",
  "streak": 0,
  "has_checkin": false
}
```

---

## 20. Check-ins — Upsert

**`POST /api/checkins`** — requires auth

Creates or updates today's check-in (one per day, per user).

### Happy path — full payload

```bash
curl -X POST http://localhost:8080/api/checkins \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "stress": 7,
    "note": "Three back-to-back meetings and a production incident.",
    "energy_level": 2,
    "focus_quality": 3,
    "hours_worked": 9.5,
    "physical_symptoms": ["fatigue", "headache"]
  }'
```

**Expected response `200 OK`:**
```json
{
  "check_in": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "stress": 7,
    "score": 58,
    "note": "Three back-to-back meetings and a production incident.",
    "checked_in_date": "2026-03-23T00:00:00Z",
    "created_at": "2026-03-23T18:42:00Z"
  },
  "score": {
    "value": 58,
    "label": "At Risk",
    "color": "red"
  },
  "explanation": "High stress combined with low energy signals you may be approaching burnout.",
  "suggestion": "Try to protect your calendar tomorrow — fewer meetings, more deep work."
}
```

### Minimal payload (only required fields)

```bash
curl -X POST http://localhost:8080/api/checkins \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "stress": 4
  }'
```

**Expected response `200 OK`** (same shape as above, optional fields omitted from DB row)

### Note too long

```bash
curl -X POST http://localhost:8080/api/checkins \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"stress": 5, "note": "'"$(python3 -c "print('x' * 300)")"'"}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "note must be 280 characters or fewer"}
```

### Invalid energy level

```bash
curl -X POST http://localhost:8080/api/checkins \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"stress": 5, "energy_level": 9}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "energy_level must be between 1 and 5"}
```

### Unknown physical symptom

```bash
curl -X POST http://localhost:8080/api/checkins \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"stress": 5, "physical_symptoms": ["nausea"]}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "unknown symptom: nausea"}
```

### Hours worked out of range

```bash
curl -X POST http://localhost:8080/api/checkins \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"stress": 5, "hours_worked": 25}'
```

**Expected response `400 Bad Request`:**
```json
{"error": "hours_worked must be between 0 and 24"}
```

---

## 21. Check-ins — List

**`GET /api/checkins`** — requires auth

Returns all check-ins for the authenticated user, newest first.

### Happy path

```bash
curl http://localhost:8080/api/checkins \
  -H "Authorization: Bearer <access_token>"
```

**Expected response `200 OK`:**
```json
[
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "stress": 7,
    "score": 58,
    "note": "Three back-to-back meetings.",
    "checked_in_date": "2026-03-23T00:00:00Z",
    "created_at": "2026-03-23T18:42:00Z"
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440002",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "stress": 4,
    "score": 76,
    "checked_in_date": "2026-03-22T00:00:00Z",
    "created_at": "2026-03-22T17:15:00Z"
  }
]
```

### No check-ins

**Expected response `200 OK`:**
```json
[]
```

---

## 22. Insights — Get

**`GET /api/insights`** — requires auth

Returns AI-generated insight cards based on recent check-in patterns.

### Happy path

```bash
curl http://localhost:8080/api/insights \
  -H "Authorization: Bearer <access_token>"
```

**Expected response `200 OK`:**
```json
{
  "components": [
    {
      "id": "streak",
      "type": "streak",
      "title": "5-day check-in streak",
      "body": "You've logged in 5 days in a row. Consistency helps the score model get more accurate.",
      "dismissed_at": null
    },
    {
      "id": "pattern_monday",
      "type": "pattern",
      "title": "Mondays tend to be your hardest day",
      "body": "Your stress scores on Mondays average 8.2 vs 5.4 on other days.",
      "dismissed_at": null
    }
  ]
}
```

### Not enough data

**Expected response `200 OK`:**
```json
{"components": []}
```

---

## 23. Insights — Dismiss Component

**`POST /api/insights/dismiss`** — requires auth

### Happy path

```bash
curl -X POST http://localhost:8080/api/insights/dismiss \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "component_id": "pattern_monday"
  }'
```

**Expected response `200 OK`:**
```json
{"status": "dismissed"}
```

### Malformed body

```bash
curl -X POST http://localhost:8080/api/insights/dismiss \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d 'not-json'
```

**Expected response `400 Bad Request`:**
```json
{"error": "invalid request body"}
```

---

## 24. Follow-ups — Get Today

**`GET /api/follow-ups`** — requires auth

Returns today's follow-up prompt if one exists (generated after a high-stress check-in). Marks it as surfaced on first fetch.

### Happy path — follow-up exists

```bash
curl http://localhost:8080/api/follow-ups \
  -H "Authorization: Bearer <access_token>"
```

**Expected response `200 OK`:**
```json
{
  "follow_up": {
    "id": "770e8400-e29b-41d4-a716-446655440003",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "question": "Yesterday you mentioned feeling overwhelmed by meetings. Did anything change today?",
    "fire_date": "2026-03-23T00:00:00Z",
    "surfaced_at": "2026-03-23T09:00:00Z",
    "dismissed_at": null
  }
}
```

### No follow-up today

**Expected response `200 OK`:**
```json
{"follow_up": null}
```

---

## 25. Follow-ups — Dismiss

**`POST /api/follow-ups/{id}/dismiss`** — requires auth

### Happy path

```bash
curl -X POST http://localhost:8080/api/follow-ups/770e8400-e29b-41d4-a716-446655440003/dismiss \
  -H "Authorization: Bearer <access_token>"
```

**Expected response `200 OK`:**
```json
{"status": "dismissed"}
```

### Invalid UUID

```bash
curl -X POST http://localhost:8080/api/follow-ups/not-a-uuid/dismiss \
  -H "Authorization: Bearer <access_token>"
```

**Expected response `400 Bad Request`:**
```json
{"error": "invalid follow-up id"}
```

### Follow-up not found (wrong user or missing)

**Expected response `500 Internal Server Error`:**
```json
{"error": "failed to dismiss follow-up"}
```

---

## 26. Webhooks — Paddle

**`POST /api/webhooks/paddle`** — no auth, signature-verified

Receives billing events from Paddle. The body must be a valid Paddle webhook payload and the `Paddle-Signature` header must be present and valid.

### Simulated subscription activated event

```bash
curl -X POST http://localhost:8080/api/webhooks/paddle \
  -H "Content-Type: application/json" \
  -H "Paddle-Signature: ts=1711180800;h1=<computed_hmac>" \
  -d '{
    "event_type": "subscription.activated",
    "data": {
      "id": "sub_01abc",
      "customer_id": "ctm_01abc",
      "status": "active",
      "items": [
        {
          "price": {
            "product": {
              "name": "Pro"
            }
          },
          "quantity": 1
        }
      ],
      "current_billing_period": {
        "ends_at": "2026-04-23T00:00:00Z"
      },
      "scheduled_change": null
    }
  }'
```

**Expected response `200 OK`** (empty body or `{}`)

### Invalid or missing signature

**Expected response `400 Bad Request`** or `401 Unauthorized`

> The HMAC is computed using your `PADDLE_WEBHOOK_SECRET`. In production this is handled by Paddle's dashboard. For local testing use [Paddle's CLI simulator](https://developer.paddle.com/webhooks/signature-verification).

---

## Common Error Shapes

All error responses follow this structure:

```json
{"error": "<human-readable message>"}
```

| HTTP Code | Meaning |
|---|---|
| `400` | Validation failed or malformed JSON body |
| `401` | Missing, invalid, or expired token |
| `403` | Authenticated but not authorised for this resource |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate email) |
| `413` | Request body exceeds 1 MB limit |
| `429` | Rate limit exceeded (20 req/min per IP on public routes) |
| `500` | Unexpected server error |
| `503` | Database unreachable (health check only) |
