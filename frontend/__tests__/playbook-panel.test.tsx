import { render, screen } from "@testing-library/react";
import PlaybookPanel from "@/components/dashboard/PlaybookPanel";

describe("PlaybookPanel", () => {
  it("renders confirmed triggers, confirmed recovery levers, and experiments", () => {
    render(
      <PlaybookPanel
        title="Your Playbook"
        subtitle="The durable memory behind today's recommendation."
        playbook={{
          confirmed_triggers: [
            {
              key: "meetings",
              title: "Back-to-back meeting mornings",
              detail: "Your next-day strain rises after stacked morning meetings.",
              kind: "trigger",
              state: "confirmed",
              evidence_count: 4,
              last_seen_date: "2026-04-15",
              trend: "rising",
            },
          ],
          confirmed_recovery_levers: [
            {
              key: "shutdown",
              title: "Early shutdown",
              detail: "Leaving work on time lowers your next-day strain.",
              kind: "recovery",
              state: "confirmed",
              evidence_count: 3,
              last_seen_date: "2026-04-14",
              trend: "stable",
            },
          ],
          experiments: [
            {
              key: "deadline",
              title: "Deadline-heavy Tuesdays",
              detail: "Still testing whether this is a stable trigger.",
              kind: "experiment",
              state: "observed",
              evidence_count: 1,
              last_seen_date: "2026-04-09",
              trend: "new",
            },
          ],
        }}
      />
    );

    expect(screen.getByText(/confirmed triggers/i)).toBeInTheDocument();
    expect(screen.getByText(/back-to-back meeting mornings/i)).toBeInTheDocument();
    expect(screen.getByText(/confirmed recovery levers/i)).toBeInTheDocument();
    expect(screen.getByText(/early shutdown/i)).toBeInTheDocument();
    expect(screen.getByText(/experiments in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/deadline-heavy tuesdays/i)).toBeInTheDocument();
  });
});