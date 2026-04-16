import React from "react";
import { render, screen } from "@testing-library/react";

const mockDashboardData = {
  scoreCard: {
    score: { score: 61, level: "warning", label: "Watch this", signals: [] },
    explanation: "Meetings are stacking into tomorrow morning.",
    suggestion: "Protect tomorrow morning from meetings.",
    daily_forecast: {
      score: 64,
      delta: 3,
      direction: "up",
      confidence: "medium",
      summary: "Tomorrow gets heavier if the calendar stays crowded.",
    },
    recommended_action: {
      title: "Protect tomorrow morning from meetings",
      detail: "You reliably spike after stacked meeting mornings.",
      driver: "meetings",
      confidence: "medium",
    },
    trajectory: "Trending up this week",
    accuracy_label: "Based on 11 real check-ins",
    streak: 6,
    has_checkin: true,
    consistency_pct: 86,
    has_follow_up: false,
    follow_up: null,
    streak_forgiven: false,
    streak_milestones: [],
  } as any,
  checkins: [
    {
      id: "c1",
      user_id: "u1",
      checked_in_date: "2026-04-16",
      stress: 4,
      score: 61,
      note: "Calendar is overloaded with demos.",
      role_snapshot: "engineer",
      sleep_snapshot: 8,
      meeting_count: 6,
      ai_recovery_plan: null,
      ai_generated_at: null,
      created_at: "2026-04-16T08:00:00Z",
      updated_at: "2026-04-16T08:00:00Z",
      energy_level: 2,
      focus_quality: 2,
      hours_worked: 9,
      physical_symptoms: ["fatigue"],
      small_wins: "blocked a focus hour",
    },
  ],
  insightBundle: {
    session_context: null,
    patterns: [],
    pattern_insights: [
      {
        title: "Meeting-heavy mornings are pushing you up",
        explanation: "Your last few higher scores followed stacked morning meetings.",
        evidence: "4 matching check-ins",
        driver: "meetings",
        confidence: "medium",
      },
    ],
    earned_pattern: null,
    signature: null,
    signature_narrative: "",
    arc_narrative: "",
    monthly_arc: null,
    what_works: "Early shutdowns help more than walks.",
    recovery_feedback: [],
    milestone: null,
    check_in_count: 11,
    accuracy_label: "Based on 11 real check-ins",
    dismissed_components: [],
    what_worked_today: {
      action: "blocked a focus hour",
      improvement: 7,
      evidence: "Blocking a focus hour has lowered your next-day score by 7 points on average.",
    },
    streak_milestones: [],
    streak_forgiven: false,
  } as any,
  loadingData: false,
  loadingMessage: "",
  loadError: "",
  ready: true,
  followUp: null,
  dismissFollowUp: vi.fn(),
  handleCheckInComplete: vi.fn(),
  reload: vi.fn(),
};

vi.mock("@/contexts/DashboardDataContext", () => ({
  useDashboardData: () => mockDashboardData,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
      user: { id: "u1", email: "test@example.com", name: "Test", timezone: "UTC" },
      api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
      logout: vi.fn(),
  }),
}));

describe("DashboardPage", () => {
  it("leads with a single briefing surface before the supporting evidence cards", async () => {
    const { default: DashboardPage } = await import("@/app/dashboard/page");

    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: /today's briefing/i })).toBeInTheDocument();
    expect(screen.getByText(/what should i do today/i)).toBeInTheDocument();
    expect(screen.getByText(/protect tomorrow morning from meetings/i)).toBeInTheDocument();
    expect(screen.getByText(/why this is showing up/i)).toBeInTheDocument();
    expect(screen.getByText(/tomorrow forecast/i)).toBeInTheDocument();
  });
});