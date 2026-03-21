# Score & AI Personalization — Design Spec
**Date:** 2026-03-21
**Status:** Approved

## Problem

The current score card feels like a mirror, not a model. A user rates stress-4 and gets back a 64 — math they could have done themselves. Signals restate their inputs ("your sleep is 6h — that's bad"). The recovery plan is keyword-matched generic advice that any two users with similar inputs receive identically. The core disease across all three: the system has no longitudinal awareness and no predictive power. It describes what you told it.

This erodes trust and retention. Users with identical inputs get identical outputs, making the app feel like a category tool rather than a personal one.

---

## Goal

Make every score card feel like it was written specifically for this user, drawing on what the system has learned about them over time. A user with 60 check-ins should feel like leaving means losing something that took months to build about them specifically.

---

## Approach: AI-Synthesized Score Card + Adaptive Check-In

Keep the numeric score formula (fast, deterministic, always available). Replace the static rule-based narrative layer — explanation, signals, suggestion, recovery plan — with a single AI call that uses the user's full 30-day history as context. Expand the check-in to collect more signal adaptively, without burdening low-stress days.

---

## Section 1: Adaptive Check-In

The check-in expands based on stress level.

**Always collected:**
- Stress (1–5)
- Note (optional free text)

**Unlocked at stress ≥ 3:**
- Energy level (1–5) — distinct from stress; captures whether the user is stressed-but-functional or calm-but-depleted
- Focus quality (1–5) — concentration capacity today
- Hours worked — simple number input

**Unlocked at stress ≥ 4:**
- Physical symptoms — multi-select: headache, muscle tension, fatigue, trouble sleeping, appetite changes

**Why adaptive matters:** A stress-4 with energy-4 + 6 hours worked + no symptoms is a completely different situation from stress-4 + energy-1 + 11 hours + three symptoms. Without extra signal, the AI cannot distinguish them. With it, the generated narrative diverges meaningfully.

**New DB columns (nullable):** `energy_level INT`, `focus_quality INT`, `hours_worked NUMERIC`, `physical_symptoms TEXT[]` on the `check_ins` table. In pgx/v5 these map to: `pgtype.Int4` (energy, focus), `pgtype.Numeric` (hours), `pgtype.Array[pgtype.Text]` (symptoms). All nullable — omitted on low-stress days.

---

## Section 2: AI-Synthesized Score Card

### AI Input

**Compressed 30-day history** — supplied by `ai.CompressHistory()` from the result of `store.ListRecentCheckIns(ctx, userID, 30)`. That query already orders by date descending and is parameterised for row count; passing 30 instead of 7 is the only change needed. `CompressHistory` formats one compact line per day:

```
2026-03-20 s=4 e=2 f=2 h=10.5 score=71 symptoms=[fatigue,headache] note="deadline crunch..."
```

Pre-computed stats appended as a header block: avg stress, avg score, highest-strain days of week, recurring note keywords, consecutive danger days.

**Token budget:** Input target ≤ 1,200 tokens (30 rows × ~25 tokens + stats header ~150 tokens + today's check-in ~50 tokens + system prompt ~200 tokens). Output capped at `MaxTokens: 600` (explanation + 4 signals + suggestion + 3-section recovery plan fits comfortably). Total: ~1,800 tokens per call. `CompressHistory` must truncate note snippets to 60 chars and drop symptoms older than 14 days if the budget is exceeded.

**Today's check-in** — all collected signals for today.

**User profile** — role, sleep baseline, total check-in count.

**Cold-start handling:** When a user has fewer than 3 check-ins, `CompressHistory` returns an empty string and the prompt explicitly tells the model: "This user is new — no history is available yet. Generate a score card based only on today's signals and their profile." This prevents the model from hallucinating patterns.

### AI Output (structured JSON)
```json
{
  "explanation": "1-2 sentences referencing actual patterns in the user's history",
  "signals": [
    {
      "label": "string",
      "val": "string",
      "detail": "string",
      "level": "ok | warning | danger"
    }
  ],
  "suggestion": "one concrete action specific to this user's situation",
  "recovery_plan": [
    { "timing": "Tonight | Tomorrow | This week", "actions": ["string"] }
  ]
}
```

Note: the `val` field matches the existing `score.Signal` struct field name (`Val`). The AI-generated signals replace `score.Output.Signals` in place — `UpsertResult.Score.Signals` is overwritten with the AI signals before the response is returned. No new field is added to `UpsertResult`.

### What makes this personal
The AI sees that *this specific user* mentioned "deadline" four times this week, slept 5h two nights running, and scores highest on Wednesdays for three consecutive weeks. The explanation it generates cannot be given to any other user. Signals reflect what's actually happening in their data, not which bucket their inputs fall into.

### Score number
Unchanged. Formula-based, deterministic, always fast. AI only generates the narrative layer around it.

---

## Section 3: Codebase Changes

### New
- `ai.GenerateScoreCard(ctx, profile, history, today) (ScoreCardNarrative, error)` — single AI call returning explanation, signals, suggestion, and recovery plan
- `ai.CompressHistory(rows []db.CheckIn) string` — converts rows into a token-efficient string; enforces token budget by truncating note snippets and dropping old symptom data
- New DB migration: nullable columns on `check_ins` (see Section 1 for types)

### Modified
- `checkin/service.go Upsert()` — after computing numeric score, calls `ai.GenerateScoreCard()`; on success overwrites `scoreOutput.Signals`, `explanation`, `suggestion`, and `recoveryPlan` with AI values; on error falls back to static functions silently
- `checkin/service.go GetScoreCard()` — also calls `ai.GenerateScoreCard()` when a check-in exists for today, so the dashboard view stays consistent with what was shown post-check-in. Only explanation, signals, and suggestion are used from the AI response — the recovery plan is discarded, since `ScoreCardResult` has no `RecoveryPlan` field and the recovery plan is only surfaced immediately post-check-in via `UpsertResult`. When no check-in exists for today, stays rule-based (no history context worth sending for a pending check-in).
- `UpsertRequest` — adds `EnergyLevel *int`, `FocusQuality *int`, `HoursWorked *float64`, `PhysicalSymptoms []string`

### Kept as fallback (not deleted)
These functions in `internal/score/` remain and are called when AI is unavailable:
- `BuildScoreExplanation()` and `BuildSuggestion()` (in `explanation.go`)
- `BuildDynamicRecoveryPlan()` (in `plan.go`)
- `buildSignals()` (in `signals.go`)

### Unchanged
- Score engine: `engine.go`, `patterns.go`, `arc.go`, `session.go` — numeric score and long-term insight patterns are not touched
- Insight service — pattern detection, arc narrative, "what works" all unchanged

---

## Section 4: Fallback Strategy & Cost

### Fallback chain
1. AI call succeeds → AI-generated score card (explanation, signals, suggestion, recovery plan)
2. AI call fails (timeout / API error / rate limit) → existing rule-based functions; user sees nothing different
3. No `OPENAI_API_KEY` configured → rule-based only, same as today

### Timeout
Context timeout: 10 seconds (matches current recovery plan call in `service.go`). The `http.Client` transport timeout in `openai.go` is currently 20 seconds — this remains unchanged since the context deadline fires first. If latency proves problematic at the larger prompt size, the transport timeout can be tuned independently without spec changes.

### Cost
GPT-4o-mini at ~1,800 tokens per call ≈ $0.001 per check-in. At 100 DAU: ~$3/month. Not a concern until significant scale.

### Async option (future)
Return score number immediately with rule-based narrative, update score card once AI responds. Keeps check-in feel instant. Deferred — synchronous is fine for now.

---

## Before / After Summary

| | Before | After |
|---|---|---|
| Check-in data | Stress + note | Stress + note + energy + focus + hours + symptoms (adaptive) |
| Explanation | Static template | AI-generated from 30-day history |
| Signals | Rule-based on inputs | AI-surfaced from actual patterns |
| Suggestion | Static template | AI-generated, specific to user |
| Recovery plan | Keyword → generic advice | AI-generated with full history context |
| Score number | Formula | Unchanged |
| Long-term insights | Pattern engine | Unchanged |
| Fallback | N/A | Existing rule-based at every step |

---

## Out of Scope

- Personal baseline calibration (score weights adapting to user history) — this is Approach B and can layer on top later
- Async score card delivery
- Mobile-specific adaptive UX
- Calendar integration (MeetingCount currently hardcoded to -1)
