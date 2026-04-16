import { describe, expect, it } from "vitest";

import { parseInsightBundle } from "../validators";

describe("parseInsightBundle", () => {
  it("accepts older insight payloads by defaulting personalization fields", () => {
    const bundle = parseInsightBundle({
      session_context: null,
      patterns: [],
      pattern_insights: [],
      earned_pattern: null,
      signature: null,
      signature_narrative: "",
      arc_narrative: "",
      monthly_arc: null,
      what_works: "",
      recovery_feedback: [],
      milestone: null,
      check_in_count: 0,
      accuracy_label: "Still learning",
      dismissed_components: [],
      what_worked_today: null,
      streak_milestones: [],
      streak_forgiven: false,
      recommendation_basis: null,
      briefing_change: null,
    });

    expect(bundle.personalization_progress).toEqual({
      confirmed_triggers: 0,
      confirmed_recovery_levers: 0,
      experiments: 0,
      confidence_trend: "flat",
    });
    expect(bundle.playbook).toEqual({
      confirmed_triggers: [],
      confirmed_recovery_levers: [],
      experiments: [],
    });
    expect(bundle.briefing_recommendation).toBeNull();
  });

  it("parses a briefing recommendation when the payload includes one", () => {
    const bundle = parseInsightBundle({
      session_context: null,
      patterns: [],
      pattern_insights: [],
      earned_pattern: null,
      signature: null,
      signature_narrative: "",
      arc_narrative: "",
      monthly_arc: null,
      what_works: "",
      recovery_feedback: [],
      milestone: null,
      check_in_count: 8,
      accuracy_label: "Based on 8 real check-ins",
      dismissed_components: [],
      what_worked_today: null,
      streak_milestones: [],
      streak_forgiven: false,
      personalization_progress: {
        confirmed_triggers: 1,
        confirmed_recovery_levers: 0,
        experiments: 2,
        confidence_trend: "up",
      },
      recommendation_basis: null,
      briefing_change: null,
      playbook: {
        confirmed_triggers: [],
        confirmed_recovery_levers: [],
        experiments: [],
      },
      briefing_recommendation: {
        headline: "Best move for tomorrow",
        target_day: "tomorrow",
        primary_action: {
          key: "protect_focus_block",
          title: "Protect a 90-minute focus block tomorrow morning",
          detail: "Keep the first deep-work block clear.",
          timeframe: "tomorrow",
          kind: "trigger",
          state: "confirmed",
        },
        fallback_action: {
          key: "shutdown_on_time",
          title: "End work by 6 PM tonight",
          detail: "Use an earlier shutdown to reduce tomorrow's load.",
          timeframe: "today",
          kind: "recovery",
          state: "emerging",
        },
        predicted_score_delta: 6,
        risk_reduction_summary: "Reduces the chance of a crash day.",
        why_this_action: "Meetings are your strongest confirmed trigger.",
        why_now: "This is easiest to set up before tomorrow starts.",
        confidence: "confirmed",
        basis: {
          kind: "trigger",
          state: "confirmed",
          summary: "Back-to-back meeting mornings are your strongest trigger.",
          evidence_count: 4,
        },
      },
    });

    expect(bundle.briefing_recommendation?.primary_action.key).toBe("protect_focus_block");
  });
});
