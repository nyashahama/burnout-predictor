"use client";

import PlaybookPanel from "@/components/dashboard/PlaybookPanel";
import { useDashboardData } from "@/contexts/DashboardDataContext";

export default function PlaybookPage() {
  const { insightBundle } = useDashboardData();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl tracking-tight">Your Playbook</h1>
        <p className="text-muted-foreground">
          Confirmed triggers, confirmed recovery levers, and the experiments Overload is still testing.
        </p>
      </div>

      <PlaybookPanel
        title="Your Playbook"
        subtitle="The durable memory behind today's recommendation."
        playbook={insightBundle?.playbook ?? null}
      />
    </div>
  );
}