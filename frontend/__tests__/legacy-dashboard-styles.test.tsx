import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { InsightBundle } from "@/lib/types";
import BurnoutAlert from "@/components/dashboard/BurnoutAlert";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";
import PersonalizedInsight from "@/components/dashboard/PersonalizedInsight";
import RecoveryPlan from "@/components/dashboard/RecoveryPlan";

const { dismissInsight } = vi.hoisted(() => ({
  dismissInsight: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    api: {
      post: dismissInsight,
    },
  }),
}));

const bundle: InsightBundle = {
  session_context: {
    Message: "Thursday meetings are dragging Friday higher.",
    Kind: "rise",
  },
  patterns: ["Deadlines reliably push your score up."],
  pattern_insights: [],
  earned_pattern: null,
  signature: null,
  signature_narrative: "Your hardest day is Thursday.",
  arc_narrative: "The month arcs upward after stacked meetings.",
  monthly_arc: null,
  what_works: "An early walk helps the next day recover.",
  recovery_feedback: [],
  milestone: null,
  check_in_count: 8,
  accuracy_label: "Based on 8 real check-ins",
  dismissed_components: [],
};

describe("legacy dashboard styling regressions", () => {
  beforeEach(() => {
    dismissInsight.mockClear();
    localStorage.clear();
  });

  it("renders the recovery plan with themed structure and an accessible progress bar", () => {
    const { container } = render(
      <RecoveryPlan
        plan={[{ timing: "Tonight", actions: ["Shut down work by 8 PM"] }]}
        score={72}
        note="Deadline pressure is stacking up."
      />,
    );

    expect(screen.getByText("How to pull back")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: /recovery plan progress/i }),
    ).toHaveAttribute("aria-valuenow", "0");
    expect(container.querySelector(".dash-card")).not.toBeInTheDocument();
    expect(container.querySelector(".recovery-item")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /shut down work by 8 pm/i }));

    expect(screen.getByText("1/1 done")).toBeInTheDocument();
  });

  it("renders personalized insights without relying on removed dashboard utility classes", () => {
    const { container } = render(<PersonalizedInsight bundle={bundle} />);

    expect(screen.getByText("What your data says")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /dismiss/i })).toHaveLength(5);
    expect(container.querySelector(".dash-card")).not.toBeInTheDocument();
    expect(container.querySelector(".pi-dismiss")).not.toBeInTheDocument();
    expect(container.querySelector(".auth-error")).not.toBeInTheDocument();
  });

  it("uses shared skeleton primitives instead of orphaned dash/skel classes", () => {
    const { container } = render(<DashboardSkeleton showCalculatingLabel />);

    expect(
      screen.getByRole("status", { name: /loading dashboard/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Calculating your score…")).toBeInTheDocument();
    expect(container.querySelector(".dash-card")).not.toBeInTheDocument();
    expect(container.querySelector(".skel")).not.toBeInTheDocument();
  });

  it("renders the burnout alert as a themed accessible card", () => {
    const { container } = render(
      <BurnoutAlert
        score={78}
        trend={7}
        dangerStreak={3}
        dangerDaysAhead={2}
        recoveryDate="Sunday"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something's building.");
    expect(container.querySelector(".burnout-alert")).not.toBeInTheDocument();
    expect(container.querySelector(".burnout-alert-dismiss")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
