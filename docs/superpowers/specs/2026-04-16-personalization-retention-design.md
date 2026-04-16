# Personalization Retention Loop — Daily Briefing and Playbook

**Date:** 2026-04-16  
**Status:** Ready for review

## Problem

Overload has crossed the line from a simple score dashboard into a coaching product. The app already has the right raw pieces: daily check-in, action plan, next-day feedback, pattern insights, consistency, and streak mechanics. The problem is that these pieces feel like adjacent widgets rather than one accumulating intelligence system.

That weakens retention. A user can understand that the app is useful without feeling compelled to open it every day. The current dashboard answers many questions, but it does not clearly answer the one that matters for daily habit formation:

> "What is new about what Overload understands about me today?"

The next product step is not "add more insight cards." It is to make personalization itself the product.

## Goal

Create a daily-open habit where users return to Overload because they expect a fresh personal briefing and visible proof that the system understands their triggers and recovery levers better than it did yesterday.

The daily emotional reward is not streak guilt, raw score checking, or generic wellness encouragement. It is:

> "Overload gets sharper about me every day."

## Product Principles

1. The top of the dashboard must feel like a briefing, not a collection of cards.
2. Recommendations must declare why they are personal and how trustworthy they are.
3. Insights must accumulate into durable memory, not disappear as a feed.
4. Feedback loops must be lightweight. The app should feel helpful, not like homework.
5. The product should prefer visible learning over visible complexity.

## Non-Goals

This design does not attempt to solve:

- team or manager workflows
- pricing or upgrade flow redesign
- new data integrations such as calendar sync expansion
- push notification infrastructure
- a new scoring model from scratch

Those may matter later, but they are not the right lever for the next retention push.

## Design Summary

The product shifts to a four-layer loop:

1. **Today’s Briefing**
   The primary dashboard surface that tells the user what to do, why, and what the system has newly learned.
2. **Personalization Progress**
   A visible model of how much of the system is generic, emerging, and confirmed.
3. **Your Playbook**
   A durable memory layer that stores confirmed triggers, recovery levers, and experiments in progress.
4. **Feedback Loop**
   A minimal outcome loop that lets the app upgrade or downgrade confidence in its advice over time.

The result should feel less like "burnout analytics" and more like a personal operating manual that updates daily.

## 1. Today’s Briefing

The top of the main dashboard should become a single dominant surface called `Today’s Briefing`.

It must answer four questions in this order:

1. What should I do today?
2. Why is that personal to me?
3. How sure is Overload about this advice now?
4. What changed in what the system knows since yesterday?

### Briefing Structure

The briefing should contain four stacked sub-sections:

- **Primary move**
  One recommended action for today. This is the headline.
- **Why this is showing up**
  The most important driver behind the recommendation, expressed in plain language.
- **Confidence**
  A short statement that tells the user whether this is generic guidance, emerging personalization, or confirmed personalization.
- **New learning**
  One concise line about what changed since the user’s last meaningful interaction.

### Example states

**Low-data user**
- Primary move: "Protect your first focus block tomorrow."
- Why: "Your score is elevated and your recent notes mention deadline pressure."
- Confidence: "Generic for now. We need a few more check-ins before this becomes personal."
- New learning: "No new patterns confirmed yet."

**Mid-data user**
- Primary move: "Shut down by 9 PM tonight."
- Why: "Your strain tends to stay elevated after late work nights."
- Confidence: "Emerging pattern. We have seen this several times, but we are still testing it."
- New learning: "Late work is now showing up as a likely trigger."

**High-data user**
- Primary move: "Protect tomorrow morning from meetings."
- Why: "Back-to-back meeting mornings are your strongest confirmed trigger."
- Confidence: "Confirmed personal pattern, based on repeated score increases after stacked meeting blocks."
- New learning: "Meeting-heavy mornings replaced sleep loss as your strongest trigger this week."

### Information Architecture Impact

This means the dashboard should no longer lead with separate cards for score, action, feedback, and insight. Existing dashboard elements should be reorganized so the first screen read feels like one coherent narrative. Supporting cards should remain, but their role changes from `main answer` to `evidence and drill-down`.

## 2. Personalization Progress

The current calibration framing is technically correct but emotionally weak. It tells the user the system is still learning, but it does not make that learning feel valuable.

Replace the current "Calibration" concept with `Personalization Progress`.

### Core model

Overload should maintain three types of personalization items:

- **Triggers**
  Conditions that reliably increase strain.
- **Recovery levers**
  Actions or conditions that reliably improve next-day outcomes.
- **Experiments**
  Suspected patterns that are not yet strong enough to trust.

Each item should move through visible states:

- **Observed**
  Seen once or twice.
- **Emerging**
  Repeating enough to matter, but still not stable.
- **Confirmed**
  Strong enough to influence recommendations directly.

### User-facing progress surface

The dashboard should include a compact progress card showing counts such as:

- `2 confirmed triggers`
- `1 confirmed recovery lever`
- `3 experiments still in progress`
- `confidence up from last week`

The app should also explain the status of the current recommendation in the same vocabulary:

- `Based on a confirmed trigger`
- `Based on an emerging recovery pattern`
- `Generic for now while we collect more evidence`

This turns "the app is learning" from background system behavior into visible product value.

## 3. Your Playbook

Insights currently surface as momentary UI. That is not enough. The user needs a durable layer that proves the system is building memory.

Introduce a `Your Playbook` surface, initially as a major dashboard section and later as its own dedicated route once it earns enough density.

### Playbook sections

The playbook should be organized into three groups:

- **Confirmed triggers**
  Patterns that reliably push the user toward higher strain.
- **Confirmed recovery levers**
  Patterns or actions that reliably help the user recover.
- **Experiments in progress**
  Plausible but unsettled hypotheses.

### Item anatomy

Each playbook item should show:

- the pattern statement
- current state: observed, emerging, or confirmed
- evidence count
- recentness
- whether confidence is rising, stable, or falling

### Daily relevance

The playbook becomes retention-positive when items change state and the app calls that out explicitly:

- "New today: walking moved from emerging to confirmed."
- "New today: meetings are now your strongest trigger."
- "Still testing: early shutdown may help, but we need more evidence."

This is the durable memory layer beneath the daily briefing. The briefing is the day’s answer. The playbook is the growing engine that makes the answer increasingly personal.

## 4. Feedback Loop

The current app already gestures toward a closed loop, but it needs to become explicit.

Every recommendation should have an optional follow-through path:

1. The app recommends one move.
2. The user can optionally confirm whether they did it.
3. The next day, the app interprets the outcome.
4. The app adjusts confidence in the advice and tells the user what it changed.

### Product requirement

The loop must stay lightweight. Users should never be forced into a multi-step questionnaire just to maintain value.

The minimal interaction model is:

- `Did it`
- `Partly did it`
- `Didn’t do it`

The next-day read can then say:

- "This move seems to be helping. Confidence increased."
- "No clear effect yet. Still testing."
- "This advice may matter less than we thought."

That is the mechanism that upgrades the product from static advice to adaptive coaching.

## 5. Dashboard Reshape

The main dashboard should be restructured in this order:

1. **Today’s Briefing**
2. **Personalization Progress**
3. **Your Playbook**
4. **Supporting evidence**
   Score details, forecast, recent check-ins, weekly view entry points, and history entry points

### Existing component evolution

Current components should be repurposed as follows:

- [ActionPlan.tsx](/home/nyasha-hama/projects/burnout-predictor/frontend/components/dashboard/ActionPlan.tsx)
  Becomes part of the briefing, not a sibling card.
- [NextDayFeedbackCard.tsx](/home/nyasha-hama/projects/burnout-predictor/frontend/components/dashboard/NextDayFeedbackCard.tsx)
  Becomes the `new learning` or `outcome update` row inside the briefing when relevant.
- [InsightRevealCard.tsx](/home/nyasha-hama/projects/burnout-predictor/frontend/components/dashboard/InsightRevealCard.tsx)
  Evolves into the basis of the playbook, not just a dismissable insight feed.
- The current calibration card in [page.tsx](/home/nyasha-hama/projects/burnout-predictor/frontend/app/dashboard/page.tsx)
  Becomes `Personalization Progress`.
- Streak and consistency remain useful, but they should stop carrying the retention story on their own.

## 6. Data and System Model

This design requires a small but explicit personalization model behind the UI.

### Core entities

The product should support these conceptual records:

- `PersonalizationItem`
  A trigger, recovery lever, or experiment
- `RecommendationBasis`
  Why today’s recommendation exists and what evidence tier it came from
- `BriefingChange`
  What changed since the last session

### Required attributes

A personalization item should be able to express:

- type: trigger, recovery, experiment
- state: observed, emerging, confirmed
- evidence count
- confidence score or band
- last seen date
- recent trend in confidence
- supporting explanation

### System outputs

The backend should eventually be able to generate:

- the top recommendation for today
- the strongest reason behind it
- the confidence explanation
- the most important newly confirmed or updated learning
- grouped playbook sections

This is an additive layer on top of the current score and insight system, not a replacement for it.

## 7. Low-Data and Error States

The product must remain useful before the playbook is mature.

### Low-data behavior

If there is not enough personal evidence yet:

- keep the briefing structure intact
- use generic recommendations
- explicitly explain what unlocks personalization next

Example:

> "We are still testing what drives your strain. Two more check-ins with notes will unlock your first emerging pattern."

### Ambiguous-data behavior

If evidence conflicts:

- say the app is still testing
- do not overstate certainty
- avoid pretending an experiment is confirmed

### Missing-data behavior

If the app cannot produce new learning:

- still show the recommendation
- show the strongest currently known pattern or a generic fallback
- avoid blank states where the top of the dashboard feels empty

## 8. Success Criteria

This design succeeds if the user can describe the app this way:

> "I open it because it tells me what matters today and it keeps getting more specific about my patterns."

### Product signals to track

- increase in weekly active users who open without being prompted by a missed check-in flow
- increase in consecutive days with dashboard opens, not just check-in submissions
- increase in users who return after a new learning event
- increase in users who can accumulate confirmed playbook items

### Qualitative benchmark

A user should be able to answer these questions after one week:

- What is my strongest trigger right now?
- What seems to help me recover?
- How sure is the app about that?
- What did it learn recently?

If they cannot, the product still feels like analytics instead of a coach.

## 9. Phased Execution

### Phase 1: Briefing-first dashboard

Reshape the top of the dashboard into one coherent briefing using existing action, insight, and feedback components.

**Outcome:** the daily-open value becomes obvious immediately.

### Phase 2: Personalization Progress

Add explicit learning states and recommendation provenance, then replace calibration with a progress model the user can understand.

**Outcome:** the user sees the system becoming more trustworthy over time.

### Phase 3: Your Playbook

Create the durable memory layer for confirmed triggers, confirmed recovery levers, and experiments in progress.

**Outcome:** transient insights become a growing product asset.

### Phase 4: Outcome loop and retention multiplier

Add minimal follow-through capture, next-day confidence updates, and reminder logic that triggers when there is something new to learn or review.

**Outcome:** Overload becomes a daily operating manual rather than a passive tracker.

## Recommendation

Phase 1 should ship first and stay tightly scoped. It is the fastest way to make the product feel different without waiting for a larger backend rewrite.

Phases 2 and 3 are the real moat. That is where the app becomes hard to substitute, because it stops being "a score app" and starts becoming a personal system memory.

Phase 4 should come after the product language is already coherent. A stronger reminder system matters, but only once there is something distinctly worth returning for.
