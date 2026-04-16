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
  });
});
