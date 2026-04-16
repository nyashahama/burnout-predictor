# Recommendation Execution Loop

**Date:** 2026-04-16  
**Status:** Ready for review

## Problem

Overload now has scoring, pattern detection, personalization progress, a durable playbook, and a one-step recommender. The weak point is that the product still stops at advice.

The app can tell the user the best next move, but it does not yet help the user commit to that move, close the loop afterward, or learn from the result in a structured way. That leaves the product closer to a strong advisor than a true operating system for burnout prevention.

## Goal

Add a commitment-first execution loop that turns the primary recommendation in `Today's Briefing` into a tracked action with a lightweight follow-through and outcome-learning cycle.

The MVP should create this flow:

1. Overload recommends one move.
2. The user commits to that move.
3. Overload follows up after the action window.
4. The user reports whether they did it and whether it helped.
5. Overload uses that outcome to improve confidence in future guidance.

## Product Principles

1. The briefing must become an active contract, not a passive suggestion.
2. The MVP should optimize for retention and learning, not automation breadth.
3. Only one active commitment should exist at a time.
4. The system should learn separately from adoption friction and effectiveness.
5. The first version should stay deterministic and auditable.

## Non-Goals

This design does not attempt to solve:

- calendar writes or external automation
- custom user-authored commitments
- multiple concurrent commitments
- multi-step planning workflows
- aggressive reminder systems
- ranking recommendations from commitment history in v1

Those are valid future layers, but they would dilute the clarity of the first execution loop release.

## Design Summary

The MVP adds a new tracked object: `recommendation_commitment`.

It is created only from the current primary recommendation in `Today's Briefing`. Once accepted, the recommendation changes from `suggested` advice into an active commitment with explicit lifecycle states. The system then captures whether the user completed the move and whether it helped, and uses that outcome as evidence for future recommendation confidence.

This is a commitment-first design:

- no external automation
- no custom actions
- one active commitment at a time
- lightweight outcome capture

## 1. Product Flow

### Core flow

1. Overload generates the primary recommendation in `Today's Briefing`.
2. The user sees one clear CTA: `Commit to this`.
3. Once committed, the briefing changes state from advice to an active commitment.
4. The commitment remains visible until it is resolved or expires.
5. At the next relevant moment, Overload asks whether the user did it.
6. After enough post-commitment context exists, Overload asks whether it helped.
7. The result updates recommendation confidence over time.

### User-facing states

- `Suggested` — recommendation is visible but not yet accepted.
- `Committed` — user accepted the move.
- `Due` — the action window is active or has just passed.
- `Completed` — user reports they did it.
- `Skipped` — user reports they did not do it.
- `Evaluated` — Overload has a completion result plus outcome feedback.
- `Expired` — the action window passed without resolution.

### Scope guardrails

The MVP should stay tightly bounded:

- one active commitment per user
- commitment created only from the current primary recommendation
- no custom commitments
- no automation outside the product

## 2. UX And Surface Changes

The main UX surface is [TodayBriefing.tsx](/home/nyasha-hama/projects/burnout-predictor/frontend/components/dashboard/TodayBriefing.tsx).

### Suggested state

When no active commitment exists:

- show the current primary recommendation
- show one primary CTA: `Commit to this`
- show one secondary action: `Not now`

### Committed state

When a commitment exists:

- replace passive recommendation framing with `You committed to this`
- keep the action title, timing, short rationale, and commitment timestamp visible
- show explicit resolution actions when appropriate: `Mark done` and `Couldn't do it`
- keep the top of the dashboard focused on the active commitment rather than asking the user what to do next again

### Due and stale handling

- `today` commitments should prompt for closure near the end of the day or on the next meaningful app open
- `tomorrow` commitments should prompt on the next check-in or next relevant dashboard open after the target window passes
- the MVP should not repeatedly nag; one strong follow-up is enough

### Outcome capture

After the user marks the commitment done, the next relevant check-in should ask:

- `Did this help?`

With these answer options:

- `Yes`
- `A bit`
- `No`

The MVP should not add a skip-reason questionnaire yet. If the user marks the action as skipped, that is enough state for v1.

### Supporting dashboard effects

- `New learning` in the briefing can reflect execution outcomes, not only pattern detection
- `Your Playbook` can surface evidence such as repeated successful commitments
- the current recommendation feedback path should be absorbed into this execution loop rather than remain a detached opinion prompt

## 3. Data Model And System Behavior

The new backend concept is `recommendation_commitment`.

It represents a specific accepted recommendation instance, not a reusable template.

### Core fields

- `id`
- `user_id`
- `recommendation_key`
- `recommendation_title`
- `target_day`
- `basis_kind`
- `basis_state`
- `predicted_score_delta`
- `committed_at`
- `due_at`
- `status`
- `completed_at`
- `outcome_helpfulness`
- `evaluated_at`

### Status values

The first version should support:

- `committed`
- `completed`
- `skipped`
- `expired`
- `evaluated`

`Suggested` and `Due` should be treated as derived UI states, not persisted database statuses. `Suggested` exists when no active commitment has been created. `Due` exists when a `committed` record has reached its action window and should now prompt for resolution.

### Behavior rules

- only one active commitment may exist per user at a time
- a commitment can only be created from the current primary briefing recommendation
- if a newer recommendation appears while one commitment is active, the active commitment remains the tracked object until it is resolved or expires
- `today` commitments usually expire at the end of the user's local day
- `tomorrow` commitments expire after the relevant next-day window passes
- evaluation should only happen once enough post-commitment context exists, typically the next completed check-in

### Architectural placement

- recommendation generation stays in [recommender.go](/home/nyasha-hama/projects/burnout-predictor/backend/internal/service/insight/recommender.go)
- commitment lifecycle state should live near the insight and check-in services, not inside score calculation
- `/api/insights` should return both the current recommendation and any active commitment snapshot
- the write path can live near the existing recommendation handler in [recommendation.go](/home/nyasha-hama/projects/burnout-predictor/backend/internal/api/handler/recommendation.go)

## 4. API Contract

The API surface should stay narrow.

### New write endpoints

- `POST /api/recommendations/commit`
- `POST /api/recommendations/{id}/complete`
- `POST /api/recommendations/{id}/skip`
- `POST /api/recommendations/{id}/outcome`

### Read path changes

Extend `/api/insights` to return:

- `briefing_recommendation`
- `active_commitment`
- `pending_outcome_prompt` when the next check-in should ask for evaluation

### Transition rules

- `commit` is only valid when the server confirms the client is acting on the current primary recommendation
- `complete` and `skip` are only valid on the user's active unresolved commitment
- `outcome` is only valid after completion and only once per commitment
- expired or evaluated commitments cannot be reopened in v1

## 5. Evaluation Logic

The first version should use simple, explicit learning rules.

- if the user committed and completed the action, allow outcome feedback on the next relevant check-in
- `Yes` and `A bit` should increase confidence over time
- `No` should weaken confidence slightly, but should not immediately erase a pattern
- `Skipped` should count as adoption friction, not as negative evidence against the recommendation's underlying value

That distinction matters. A user failing to do the action may mean the action was inconvenient, not that the recommendation was wrong.

## 6. Error Handling

- if commitment creation fails, the recommendation should still render in its normal suggested state
- if the user never resolves the commitment before the window ends, mark it `expired` and stop prompting
- if the recommendation changes while a commitment is active, do not rewrite history; keep the active commitment bound to the original recommendation snapshot
- if the user opens the app on multiple devices, the server remains the source of truth

## 7. Testing

Testing should focus on lifecycle behavior and state correctness.

### Backend

- service tests for one-active-commitment enforcement
- lifecycle tests for `commit -> complete/skip -> outcome -> evaluated`
- expiration tests based on target day and local time
- handler tests for invalid state transitions
- read-path tests for `/api/insights` returning recommendation plus active commitment correctly

### Frontend

- component tests for `Today's Briefing` transitions from suggested to committed to resolved
- tests for rendering the correct CTA set by state
- tests for showing the outcome prompt only when the server indicates it is due

### Integration

- next-check-in flow tests to ensure outcome capture appears only after completion and at the right time

## 8. Why This Is The Right Next Layer

This feature is the right next step because it compounds the repo's current direction:

- it builds directly on the personalization and one-step recommender work
- it creates a real retention loop instead of another insight surface
- it starts collecting intervention-outcome evidence, which is more valuable than symptom-only data
- it preserves a clean path to future automation, custom commitments, and ranking improvements

The product identity shifts from:

> "Here is your best next move."

to:

> "Here is the move, commit to it, and Overload will learn whether it actually works for you."
