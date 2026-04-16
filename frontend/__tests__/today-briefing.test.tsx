import { render, screen } from "@testing-library/react";
import TodayBriefing from "@/components/dashboard/TodayBriefing";
import type { BriefingRecommendation, ScoreCardResult } from "@/lib/types";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "test@example.com", name: "Test", timezone: "UTC" },
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
    logout: vi.fn(),
  }),
}));

const scoreCard = {
  score: { score: 61, level: "warning", label: "Watch this", signals: [] },
  recommended_action: {
    title: "Protect tomorrow morning from meetings",
    detail: "You reliably spike after stacked meeting mornings.",
    driver: "meetings",
    confidence: "medium",
  },
  feedback_submitted_for_today: null,
} as unknown as ScoreCardResult;

const briefingRecommendation: BriefingRecommendation = {
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
  basis: null,
};

describe("TodayBriefing", () => {
  it("renders the one-step recommender when present", () => {
    render(
      <TodayBriefing
        scoreCard={scoreCard}
        todayCheckIn={undefined}
        plan={[]}
        trend={0}
        dangerStreak={0}
        dangerDaysAhead={0}
        recoveryDate=""
        reason="Because meetings keep compounding."
        confidenceCopy="Confirmed pattern."
        newLearning="Meetings replaced sleep loss as your strongest trigger."
        whatWorkedToday={null}
        feedbackSubmittedForToday={null}
        briefingRecommendation={briefingRecommendation}
      />
    );

    expect(screen.getByText(/best move for tomorrow/i)).toBeInTheDocument();
    expect(screen.getByText(/lower tomorrow's score by about 6 points/i)).toBeInTheDocument();
    expect(screen.getByText(/if that's not possible/i)).toBeInTheDocument();
    expect(screen.getByText(/end work by 6 pm tonight/i)).toBeInTheDocument();
  });
});