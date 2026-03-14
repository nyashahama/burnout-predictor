"use client";

import { useEffect, useState } from "react";
import { stressToScore } from "@/app/dashboard/data";

function isMondayMorning(): boolean {
  const now = new Date();
  return now.getDay() === 1 && now.getHours() >= 6 && now.getHours() < 13;
}

function getDismissKey(): string {
  const today = new Date().toISOString().split("T")[0];
  return `monday-debrief-dismissed-${today}`;
}

type DebriefData = {
  avgScore: number;
  peakScore: number;
  highStrainDays: number;
  totalDays: number;
  peakNote: string | null;
  level: "ok" | "warning" | "danger";
};

function buildDebrief(role: string, sleep: string): DebriefData | null {
  const now = new Date();
  const scores: number[] = [];
  let peakScore = 0;
  let peakNote: string | null = null;

  // Last week = 7–13 days ago
  for (let i = 7; i <= 13; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `checkin-${d.toISOString().split("T")[0]}`;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.stress !== "number") continue;
      const score = stressToScore(parsed.stress, role, sleep);
      scores.push(score);
      if (score > peakScore) {
        peakScore = score;
        peakNote  = parsed.note || null;
      }
    } catch {}
  }

  if (scores.length < 3) return null;

  const avgScore      = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const highStrainDays = scores.filter((s) => s > 65).length;
  const level          = avgScore > 65 ? "danger" : avgScore > 40 ? "warning" : "ok";

  return { avgScore, peakScore, highStrainDays, totalDays: scores.length, peakNote, level };
}

function buildNarrative(d: DebriefData): string {
  const { avgScore, peakScore, highStrainDays, totalDays, peakNote } = d;

  if (avgScore > 65) {
    const peakDetail = peakNote ? ` (you noted: "${peakNote.slice(0, 50)}")` : "";
    return `Last week ran hard — average load of ${avgScore}, with ${highStrainDays} of ${totalDays} days in the danger zone. Your peak hit ${peakScore}${peakDetail}. That kind of week leaves a residue. This week, one thing needs to give.`;
  }
  if (avgScore > 50) {
    return `Last week was elevated — average load of ${avgScore} across ${totalDays} days. You stayed out of the danger zone, but there wasn't much recovery margin. Worth protecting this week's early days before the load builds.`;
  }
  if (avgScore <= 40) {
    return `Last week was genuinely good — average load of ${avgScore} across ${totalDays} check-ins. That's the kind of week that builds resilience. Protect what worked.`;
  }
  return `Last week averaged ${avgScore} across ${totalDays} days — manageable, but room to improve. Focus on one structural change this week: a protected morning, fewer meetings, earlier sleep.`;
}

function buildOneThing(d: DebriefData): string {
  const { avgScore, highStrainDays, peakNote } = d;
  const n = (peakNote || "").toLowerCase();

  if (/meeting|call|sync|standup/.test(n))
    return "Convert one recurring meeting to async — you'll feel the space immediately.";
  if (/deadline|deliver|launch|submit/.test(n))
    return "Plan the hardest deliverable for early in the week, not Friday.";
  if (/sleep|tired|exhausted/.test(n))
    return "Set a hard stop at 9 PM every night this week. Sleep is the lever.";
  if (highStrainDays >= 3)
    return "Block one full morning this week with no meetings and no Slack — just the work that matters.";
  if (avgScore > 50)
    return "Protect your mornings. Don't let the first hour become reactive email.";
  return "Keep doing what worked last week. Don't let a good week become an excuse to push harder.";
}

export default function MondayDebrief() {
  const [visible, setVisible]   = useState(false);
  const [debrief, setDebrief]   = useState<DebriefData | null>(null);

  useEffect(() => {
    if (!isMondayMorning()) return;
    if (localStorage.getItem(getDismissKey())) return;

    const role  = localStorage.getItem("overload-role")  || "engineer";
    const sleep = localStorage.getItem("overload-sleep") || "8";
    const data  = buildDebrief(role, sleep);
    if (!data) return;

    setDebrief(data);
    setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(getDismissKey(), "1");
    setVisible(false);
  }

  if (!visible || !debrief) return null;

  return (
    <div className={`monday-debrief monday-debrief--${debrief.level}`}>
      <div className="monday-debrief-header">
        <span className="monday-debrief-label">Last week</span>
        <button className="monday-debrief-dismiss" onClick={dismiss} aria-label="Dismiss">
          ×
        </button>
      </div>

      <p className="monday-debrief-narrative">{buildNarrative(debrief)}</p>

      <div className="monday-debrief-onething">
        <span className="monday-debrief-thing-label">This week: </span>
        <span className="monday-debrief-thing-text">{buildOneThing(debrief)}</span>
      </div>

      <a className="monday-debrief-link" href="/dashboard/weekly">
        Full weekly debrief →
      </a>
    </div>
  );
}
