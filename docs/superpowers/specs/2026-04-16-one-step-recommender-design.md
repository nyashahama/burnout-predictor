# One-Step Recommender — Daily Action Decision Engine

**Date:** 2026-04-16  
**Status:** Ready for review

## Problem

Overload already computes a score, forecasts near-term risk, surfaces pattern insights, and now maintains a growing playbook of confirmed triggers and recovery levers. The weak point is the decision gap between knowing and acting.

The current dashboard tells the user what is happening, but it still relies on the user to translate that information into a concrete next move. The existing `recommended_action` field helps, but it is too flat for the next stage of the product:

- it does not expose why this action beats other actions
- it does not estimate how much the action matters
- it does not distinguish between what is actionable today versus tomorrow
- it does not connect tightly enough to the personalization system that now powers the briefing and playbook

That leaves the product sounding informative rather than decisive.

## Goal

Add a one-step recommender to `Today’s Briefing` that tells the user the single best next move, why it matters, how much it is expected to help, and what fallback move to take if the primary move is not feasible.

The outcome should feel like:

> "Not just 'here is your score,' but 'here is the best move to change what happens next.'"

## Product Principles

1. The recommender must be decisive. One primary move, not a buffet of advice.
2. The recommendation must be grounded in existing user evidence, not generic AI prose.
3. The UI should lead with expected score improvement and support it with risk prevention.
4. `Today` recommendations are allowed only when they are still realistically executable.
5. The first version must use only existing check-in data and inferred patterns.
6. The engine must be deterministic and testable before it becomes expansive.

## Non-Goals

This design does not attempt to solve:

- calendar-aware scheduling or availability checks
- freeform AI-generated action suggestions
- multi-step scenario planning or a sandbox UI
- weekly planning workflows
- team workflows or manager-facing recommendations
- a rewrite of the score engine

Those are future layers. The first release is a decision engine, not a planner.

## Design Summary

The feature adds a new recommender object to the insight payload and renders it inside `Today’s Briefing`.

The recommender will:

- choose one primary action from a fixed catalog
- choose one distinct fallback action
- target either `today` or `tomorrow`
- estimate a rounded score delta
- estimate a risk-prevention statement
- explain the evidence basis in plain language
- explain why the action is feasible now

The recommendation should not replace the whole briefing. It upgrades the top section of the briefing from:

> "What should I do today?"

into:

> "Here is the best move, why it matters, why it is personal, and what to do if you cannot do it."

## 1. User Experience

### Placement

The recommender should appear inside `Today’s Briefing` on the main dashboard. It should replace the current plain `recommended_action` presentation and keep the rest of the briefing structure intact.

This is the right placement because the briefing already owns the core user question: what should I do next? The recommender is the decisive version of that answer, not a secondary drill-down.

### Output shape

The briefing should render:

- **Best next move**
  The primary recommendation.
- **Expected impact**
  A short line leading with estimated score improvement and supporting it with a risk-prevention statement.
- **Why this move**
  Evidence tied to playbook and current risk context.
- **Why now**
  Why this action is feasible today or why it should be planned for tomorrow.
- **If that’s not possible**
  One fallback action.

### Example copy

**Tomorrow-targeted**

- Best next move: "Protect a 90-minute focus block tomorrow morning."
- Expected impact: "Expected to lower tomorrow’s score by about 6 points and reduce the chance of a crash day."
- Why this move: "Back-to-back meeting mornings are your strongest confirmed trigger."
- Why now: "This is best set up before tomorrow starts."
- If that’s not possible: "Shut down work by 6 PM tonight."

**Today-targeted**

- Best next move: "End work by 6 PM tonight."
- Expected impact: "Expected to lower tomorrow’s score by about 4 points and reduce the chance of a second high-strain day."
- Why this move: "Late work is showing up as an emerging trigger in your recent check-ins."
- Why now: "There is still enough time left today for this to matter."
- If that’s not possible: "Prioritize sleep tonight."

### Interaction model

The first version should keep interaction lightweight:

- feedback on the selected action should continue to use the existing recommendation feedback path
- no interactive scenario builder
- no editable parameters
- no additional survey required to reveal the recommendation

## 2. Action Catalog

The MVP should use a fixed action catalog, not dynamically generated actions.

Initial candidates:

- `protect_focus_block`
- `shutdown_on_time`
- `reduce_meeting_load`
- `prioritize_sleep`
- `take_recovery_block`

Each action should be defined with deterministic metadata:

- action key
- user-facing title
- default detail copy
- eligible evidence sources
- whether it can target `today`
- feasible time window rules
- score-delta heuristic
- risk-reduction heuristic
- explanation template

The catalog should live close to the new recommender builder in the insight service, not in the frontend.

## 3. Recommendation Inputs

The recommender must use only data the system already has:

- `pattern_insights`
- `recovery_feedback`
- `what_worked_today`
- `checkInCount`
- current local date and time in the user’s timezone
- today and yesterday context already used in the insight service

The first version must not require calendar state. The feature should work for every user, not only users with connected calendars.

Recommendation feedback history should remain an outcome-capture path in v1, not a ranking input. The first recommender release should rank from current evidence only.

## 4. Ranking Model

The ranking model should be deterministic and explicitly explainable.

Each candidate action should be scored on:

- **Impact**
  The expected score improvement and risk reduction if the action is taken.
- **Evidence strength**
  Whether the recommendation is based on confirmed, emerging, observed, or generic evidence.
- **Feasibility**
  Whether the action can still realistically be taken now.

The rank should favor the highest-impact feasible action, not the most personalized action in the abstract.

### Feasibility rules

The engine should default to `tomorrow`. It should target `today` only when all of the following are true:

- the action is eligible for same-day execution
- enough time remains for the action to matter
- the action has not already become impossible for the day
- the recommendation can be explained as immediately actionable

This should be action-specific, not a single blunt cutoff.

Examples:

- `shutdown_on_time` can target `today` only if the current local time is still before the shutdown threshold.
- `prioritize_sleep` can target `today` later into the evening than most actions.
- `protect_focus_block` should usually target `tomorrow`, because its value depends on planning ahead.
- `reduce_meeting_load` should target `tomorrow` in v1 because there is no calendar-aware same-day meeting context yet.

### Thin-data behavior

For low-data users, the recommender should degrade gracefully into explicit generic guidance.

The UI must not imply false personalization. If evidence is weak, the engine should say so.

## 5. API Contract

The recommender should live in `/api/insights`, not in the score payload.

This keeps it aligned with:

- personalization progress
- playbook
- recommendation basis
- briefing change

### Proposed response shape

`InsightBundle` should gain a new field:

```ts
briefing_recommendation: BriefingRecommendation | null;
```

The `BriefingRecommendation` type should include:

- `headline`
- `target_day` (`today` or `tomorrow`)
- `primary_action`
- `fallback_action`
- `predicted_score_delta`
- `risk_reduction_summary`
- `why_this_action`
- `why_now`
- `confidence`
- `basis`

Each action candidate should include:

- `key`
- `title`
- `detail`
- `timeframe`
- `kind`
- `state`

The current `scoreCard.recommended_action` should remain in place for compatibility and fallback.

## 6. Backend Architecture

The implementation should live in `backend/internal/service/insight/`.

Recommended structure:

- `personalization.go`
  Keeps playbook and personalization progress logic.
- `recommender.go`
  Builds and ranks action candidates.
- `recommender_test.go`
  Covers deterministic ranking behavior.

### Flow

1. `Service.Get` computes the existing insight inputs.
2. It calls the personalization builder as it does today.
3. It calls the new recommender builder with those evidence structures and local-time context.
4. It attaches the returned object to `InsightBundle`.
5. The frontend renders the new object when present.

This keeps the score engine stable and makes the recommender an insight-layer decision system.

## 7. Frontend Integration

The frontend should render the new feature inside `TodayBriefing`.

### Behavior

- If `briefing_recommendation` is present, render the new recommendation surface.
- If it is absent, fall back to the existing `scoreCard.recommended_action` block.
- The copy should lead with score delta and support with risk reduction.
- The fallback action should always be visibly distinct from the primary action.

### UI requirements

- preserve the current briefing tone and hierarchy
- do not introduce a separate dashboard card for v1
- keep recommendation feedback tied to the primary action key
- show `today` versus `tomorrow` clearly in the headline or supporting copy

## 8. Rollout Strategy

The feature should be rolled out behind payload presence rather than a separate feature-flag system.

That means:

- backend can ship the field first
- frontend can render it only when present
- legacy `recommended_action` remains as fallback

This lowers rollout risk and avoids dashboard loading complexity.

## 9. Risks and Guardrails

### Fake precision

Exact-looking numbers can undermine trust. The first version should use rounded deltas and restrained wording such as:

- "about 4 points"
- "reduce the chance of a second high-strain day"

### Weak evidence dressed as certainty

Low-data users must not receive copy that sounds highly personalized. Generic mode should be explicit.

### Duplicate recommendation surfaces

The new recommender must replace the plain action section in `TodayBriefing`, not sit beside it as a competing answer.

### Future calendar expansion pressure

Calendar support should plug into the feasibility layer later, not force a redesign of the recommendation model. The current action catalog and candidate scorer should be written so feasibility can later consume calendar availability.

## 10. Testing Strategy

The backend test suite should verify:

- confirmed trigger evidence outranks weaker generic advice
- strong recovery evidence can outrank trigger-derived advice when impact is better
- `today` recommendations only appear when action-specific feasibility passes
- fallback action differs from primary action
- low-data users receive a safe generic recommendation

The frontend test suite should verify:

- the briefing renders the recommender when the payload includes it
- the briefing falls back cleanly to `recommended_action`
- `today` versus `tomorrow` copy renders correctly
- delta and risk-prevention copy both appear
- the primary action key still drives feedback submission

## 11. Future Expansion

If the MVP proves credible, the next layer should be a `What-if sandbox`, not a broader advice list.

That future version can reuse the same action catalog and ranking model, but expose multiple candidate actions and scenario comparisons.

Calendar integration should come after the core recommender is trusted. When it does, it should improve feasibility scoring and recommendation timing, not redefine the feature.

## Success Criteria

The feature is successful when:

- the dashboard answers "what should I do next?" more decisively than it does today
- the recommendation feels obviously connected to personalization evidence
- users can distinguish between a best action and a fallback
- the system avoids recommending impossible same-day actions
- the codebase gains a clean seam for later what-if and calendar expansion
