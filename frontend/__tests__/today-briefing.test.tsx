import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TodayBriefing from "@/components/dashboard/TodayBriefing";
import type { BriefingRecommendation, RecommendationCommitment, ScoreCardResult } from "@/lib/types";

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
  fallback_action: null,
  predicted_score_delta: 6,
  risk_reduction_summary: "Reduces the chance of a crash day.",
  why_this_action: "Meetings are your strongest confirmed trigger.",
  why_now: "This is easiest to set up before tomorrow starts.",
  confidence: "confirmed",
  basis: null,
};

describe("TodayBriefing", () => {
  it("shows a commit CTA when no active commitment exists", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

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
        activeCommitment={null}
        onCommitRecommendation={onCommit}
        onCompleteCommitment={vi.fn()}
        onSkipCommitment={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /commit to this/i }));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("shows the committed state when an active commitment exists", () => {
    const activeCommitment: RecommendationCommitment = {
      id: "33333333-3333-3333-3333-333333333333",
      recommendation_key: "protect_focus_block",
      recommendation_title: "Protect a 90-minute focus block tomorrow morning",
      recommendation_detail: "Keep the first deep-work block clear.",
      why_this_action: "Meetings are your strongest confirmed trigger.",
      why_now: "This is easiest to set up before tomorrow starts.",
      target_day: "tomorrow",
      status: "committed",
      predicted_score_delta: 6,
      committed_at: "2026-04-16T08:00:00Z",
      due_at: "2026-04-17T23:59:59Z",
      completed_at: null,
      outcome_helpfulness: null,
      evaluated_at: null,
      basis: null,
    };

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
        activeCommitment={activeCommitment}
        onCommitRecommendation={vi.fn()}
        onCompleteCommitment={vi.fn()}
        onSkipCommitment={vi.fn()}
      />
    );

    expect(screen.getByText(/you committed to this/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark done/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /couldn't do it/i })).toBeInTheDocument();
  });
});