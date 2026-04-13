"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface StreakMilestoneCardProps {
  milestones: { day: number; message: string }[];
}

const ICONS: Record<number, string> = { 3: "🎯", 7: "📅", 14: "🔑", 30: "🔐", 60: "📈" };

export default function StreakMilestoneCard({ milestones }: StreakMilestoneCardProps) {
  const { api } = useAuth();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  function handleDismiss(m: { day: number; message: string }) {
    setDismissed((prev) => new Set(prev).add(m.day));
    api.post("/api/insights/dismiss", { component_key: `streak-milestone-${m.day}` }).catch(() => {});
  }

  const visible = milestones.filter((m) => !dismissed.has(m.day));

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((m) => (
        <div
          key={m.day}
          className="rounded-lg border border-border p-4 flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <span className="text-xl">{ICONS[m.day] ?? "🏆"}</span>
            <div>
              <div className="font-semibold">{m.day}-day streak</div>
              <p className="text-sm text-muted-foreground">{m.message}</p>
            </div>
          </div>
          <button
            onClick={() => handleDismiss(m)}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}