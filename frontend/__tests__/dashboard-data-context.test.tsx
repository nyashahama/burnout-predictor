import { render, waitFor } from "@testing-library/react";
import { DashboardDataProvider, useDashboardData } from "@/contexts/DashboardDataContext";

const post = vi.fn();
const get = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    api: { get, post },
    isLoading: false,
  }),
}));

function Harness({ onReady }: { onReady: (value: ReturnType<typeof useDashboardData>) => void }) {
  const data = useDashboardData();
  onReady(data);
  return null;
}

it("posts recommendation commits and reloads dashboard data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  get
    .mockResolvedValueOnce({ score: { score: 50, level: "warning", label: "Watch this", signals: [] }, daily_forecast: {}, recommended_action: {}, has_checkin: false })
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({
      session_context: null,
      patterns: [],
      pattern_insights: [],
      recovery_feedback: [],
      dismissed_components: [],
      personalization_progress: { confirmed_triggers: 0, confirmed_recovery_levers: 0, experiments: 0, confidence_trend: "flat" },
      playbook: { confirmed_triggers: [], confirmed_recovery_levers: [], experiments: [] },
      briefing_recommendation: null,
      active_commitment: null,
      pending_outcome_prompt: null,
    })
    .mockResolvedValueOnce(null);
  post.mockResolvedValue({ id: "33333333-3333-3333-3333-333333333333", status: "committed" });

  let latest: ReturnType<typeof useDashboardData> | null = null;

  render(
    <DashboardDataProvider>
      <Harness onReady={(value) => { latest = value; }} />
    </DashboardDataProvider>
  );

  await waitFor(() => expect(latest?.ready).toBe(true));
  await latest!.commitRecommendation();

  expect(post).toHaveBeenCalledWith("/api/recommendations/commit", {});
});