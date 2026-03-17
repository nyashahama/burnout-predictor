"use client";

import { useEffect, useState } from "react";
import { stressToScore } from "@/app/dashboard/data";

type ComebackData = {
  dangerStreak: number;
  peakScore: number;
  peakNote: string | null;
};

function detectComeback(currentScore: number): ComebackData | null {
  if (currentScore > 40) return null;

  const todayKey = `comeback-seen-${new Date().toISOString().split("T")[0]}`;
  if (localStorage.getItem(todayKey)) return null;

  const role  = localStorage.getItem("overload-role")  || "engineer";
  const sleep = localStorage.getItem("overload-sleep") || "8";
  const now   = new Date();

  let dangerStreak = 0;
  let peakScore    = 0;
  let peakNote: string | null = null;

  for (let i = 1; i <= 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `checkin-${d.toISOString().split("T")[0]}`;
    const raw = localStorage.getItem(key);
    if (!raw) break;
    try {
      const parsed = JSON.parse(raw);
      const score  = stressToScore(parsed.stress ?? 3, role, sleep);
      if (score > 65) {
        dangerStreak++;
        if (score > peakScore) {
          peakScore = score;
          peakNote  = parsed.note || null;
        }
      } else {
        break;
      }
    } catch { break; }
  }

  if (dangerStreak < 3) return null;
  return { dangerStreak, peakScore, peakNote };
}

function buildComebackNarrative(data: ComebackData): string {
  const { dangerStreak, peakScore, peakNote } = data;
  const n = (peakNote || "").toLowerCase();

  let what = "";
  if (/deadline|deliver|launch|submit/.test(n))
    what = " The deadline passed. Your body knew before you did.";
  else if (/meeting|call|sync/.test(n))
    what = " The load lightened. Protected sleep did the rest.";
  else if (/sleep|tired|exhausted/.test(n))
    what = " Sleep was the variable. It always is.";
  else
    what = " Whatever you protected last night — that was the lever.";

  return `You were in the danger zone for ${dangerStreak} day${dangerStreak !== 1 ? "s" : ""}. Peak: ${peakScore}.${what} Don't lose what made today different.`;
}

export default function ComebackCard({ currentScore }: { currentScore: number }) {
  const [data, setData]       = useState<ComebackData | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const comeback = detectComeback(currentScore);
    if (comeback) {
      setData(comeback);
      setVisible(true);
    }
  }, [currentScore]);

  function dismiss() {
    const todayKey = `comeback-seen-${new Date().toISOString().split("T")[0]}`;
    localStorage.setItem(todayKey, "1");
    setVisible(false);
  }

  if (!visible || !data) return null;

  return (
    <div className="comeback-card">
      <div className="comeback-header">
        <div className="comeback-label">Back in the green</div>
        <button className="comeback-dismiss" onClick={dismiss} aria-label="Dismiss">×</button>
      </div>
      <p className="comeback-narrative">{buildComebackNarrative(data)}</p>
    </div>
  );
}
