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

**New DB columns (nullable):** `energy_level INT`, `focus_quality INT`, `hours_worked FLOAT`, `physical_symptoms TEXT[]` on the `check_ins` table.

---

## Section 2: AI-Synthesized Score Card

### AI Input

**Compressed 30-day history** — one row per day:
- Date, stress, energy, focus, hours worked, symptoms, computed score, note snippet (60 chars)
- Pre-computed stats: avg stress, avg score, highest-strain days, recurring note keywords, consecutive danger days

**Today's check-in** — all collected signals

**User profile** — role, sleep baseline, total check-in count (so AI knows how much history to reference)

### AI Output (structured JSON)
```json
{
  "explanation": "1-2 sentences referencing actual patterns in the user's history",
  "signals": [
    {
      "label": "string",
      "value": "string",
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

### What makes this personal
The AI sees that *this specific user* mentioned "deadline" four times this week, slept 5h two nights running, and scores highest on Wednesdays for three consecutive weeks. The explanation it generates cannot be given to any other user. Signals reflect what's actually happening in their data, not which bucket their inputs fall into.

### Score number
Unchanged. Formula-based, deterministic, always fast. AI only generates the narrative layer around it.

---

## Section 3: Codebase Changes

### New
- `ai.GenerateScoreCard(ctx, profile, history, today) (ScoreCardNarrative, error)` — single AI call replacing the four static narrative functions
- `ai.CompressHistory(rows []db.CheckIn) string` — converts 30-day history into a token-efficient string; keeps prompt size predictable
- New DB migration: nullable columns on `check_ins`

### Modified
- `checkin/service.go Upsert()` — after computing numeric score, calls `ai.GenerateScoreCard()` instead of the four static functions; falls back to static on error
- `UpsertRequest` — adds `EnergyLevel *int`, `FocusQuality *int`, `HoursWorked *float64`, `PhysicalSymptoms []string`

### Kept as fallback (not deleted)
- `score.BuildScoreExplanation()`
- `score.BuildSuggestion()`
- `score.BuildDynamicRecoveryPlan()`
- `score.buildSignals()` (static version)

### Unchanged
- Score engine (`engine.go`, `patterns.go`, `arc.go`, `session.go`, `explanation.go`) — numeric score and long-term insight patterns are not touched
- Insight service — pattern detection, arc narrative, "what works" all unchanged

---

## Section 4: Fallback Strategy & Cost

### Fallback chain
1. AI call succeeds → AI-generated score card
2. AI call fails (timeout / API error / rate limit) → existing rule-based functions; user sees nothing different
3. No `OPENAI_API_KEY` → rule-based only, same as today

### Timeout
10 seconds (matches current recovery plan timeout). Fallback triggers automatically on exceed.

### Cost
GPT-4o-mini at ~2,000 tokens per call ≈ $0.001 per check-in. At 100 DAU: ~$3/month. Not a concern until significant scale.

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
