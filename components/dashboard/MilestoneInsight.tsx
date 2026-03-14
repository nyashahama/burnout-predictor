"use client";

import { useEffect, useState } from "react";
import { buildMilestoneData, type MilestoneData } from "@/app/dashboard/data";

function buildInsights(d: MilestoneData): string[] {
  const lines: string[] = [];

  if (d.hardestDay) {
    lines.push(
      `Your ${d.hardestDay}s run consistently harder than the rest of your week — ${d.hardestDayStress.toFixed(1)} average stress. Whatever that day looks like, it's worth changing something about it.`
    );
  }

  if (d.easiestDay && d.easiestDay !== d.hardestDay) {
    lines.push(
      `Your ${d.easiestDay}s reliably bring you back. Don't let meetings creep in — they're working for a reason.`
    );
  }

  if (d.keywordTrigger && d.keywordLift >= 0.6) {
    const lift = d.keywordLift.toFixed(1);
    lines.push(
      `When "${d.keywordTrigger}" appears in your notes, your stress reads ${lift} points above your baseline — consistently. That's your clearest trigger.`
    );
  }

  if (d.recoveryDays !== null) {
    if (d.recoveryDays <= 1) {
      lines.push(
        `You recover fast — typically back to calm within a day of a hard period. That's a real asset. It only works if you actually protect the recovery day.`
      );
    } else {
      lines.push(
        `After high-load days, it takes you an average of ${d.recoveryDays} day${d.recoveryDays !== 1 ? "s" : ""} to get back to calm. Plan recovery time like you plan the hard work.`
      );
    }
  }

  const delta = d.firstHalfAvg - d.secondHalfAvg;
  if (delta >= 6) {
    lines.push(
      `Your average load has dropped ${delta} points from your first check-ins to your most recent. The habit is working — the data is saying it.`
    );
  } else if (delta <= -6) {
    lines.push(
      `Your load has climbed ${Math.abs(delta)} points since you started. That trajectory doesn't reverse without a deliberate change.`
    );
  } else {
    lines.push(
      `Your load has been stable across ${d.totalEntries} check-ins. Consistency matters — now the question is whether you can move the average down.`
    );
  }

  return lines;
}

function milestoneHeader(n: number): { headline: string; sub: string } {
  if (n === 90) return {
    headline: `90 check-ins.`,
    sub: `This is enough data to know you — not as a user, but as a person with a specific pattern of work and recovery. Here's what's real.`,
  };
  if (n === 60) return {
    headline: `60 check-ins.`,
    sub: `Two months in. The patterns have solidified. Here's what the data has learned about how you actually work.`,
  };
  return {
    headline: `30 check-ins.`,
    sub: `A month of real data. Here's what it knows about you that you might not have noticed.`,
  };
}

export default function MilestoneInsight({ checkinCount }: { checkinCount: number }) {
  const [data, setData]       = useState<MilestoneData | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (checkinCount < 28) return;
    const milestone = buildMilestoneData(checkinCount);
    if (milestone) {
      setData(milestone);
      setVisible(true);
    }
  }, [checkinCount]);

  function dismiss() {
    if (!data) return;
    localStorage.setItem(`milestone-seen-${data.milestone}`, "1");
    setVisible(false);
  }

  if (!visible || !data) return null;

  const { headline, sub } = milestoneHeader(data.milestone);
  const insights = buildInsights(data);

  return (
    <div className="milestone-card">
      <div className="milestone-header">
        <div>
          <div className="milestone-headline">{headline}</div>
          <div className="milestone-sub">{sub}</div>
        </div>
        <button className="milestone-dismiss" onClick={dismiss} aria-label="Dismiss">×</button>
      </div>

      <div className="milestone-insights">
        {insights.map((line, i) => (
          <div key={i} className="milestone-insight-row">
            <span className="milestone-insight-dot" />
            <p className="milestone-insight-text">{line}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
