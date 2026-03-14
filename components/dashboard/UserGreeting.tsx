"use client";

import { useEffect, useState } from "react";
import { mockUser } from "@/app/dashboard/data";

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
  });
}

/** Counts consecutive days going backwards from today that have a check-in. */
function computeStreak(): number {
  let streak = 0;
  const now  = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `checkin-${d.toISOString().split("T")[0]}`;
    if (localStorage.getItem(key)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Reads check-ins for the same day-of-week from the past 8 weeks.
 * Returns a short, human observation when a clear pattern exists.
 */
function getPatternInsight(): string | null {
  const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const now = new Date();
  const todayDow = now.getDay();
  const dayName  = DAY_NAMES[todayDow];
  const stresses: number[] = [];

  for (let week = 1; week <= 8; week++) {
    const d = new Date(now);
    d.setDate(d.getDate() - week * 7);
    if (d.getDay() !== todayDow) continue; // safety guard
    const raw = localStorage.getItem(`checkin-${d.toISOString().split("T")[0]}`);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.stress === "number") stresses.push(parsed.stress);
    } catch {}
  }

  if (stresses.length < 2) return null;
  const avg = stresses.reduce((a, b) => a + b, 0) / stresses.length;

  if (avg >= 4.2) return `Your ${dayName}s have been running hot. Plan lighter today if you can.`;
  if (avg >= 3.6) return `${dayName}s tend to be one of your harder days. Head's up.`;
  if (avg <= 1.8) return `${dayName}s are usually easy on you. The data is on your side.`;
  if (avg <= 2.4) return `${dayName}s tend to be good. Let's keep it that way.`;
  return null;
}

export default function UserGreeting() {
  const [name,    setName]    = useState(mockUser.name);
  const [streak,  setStreak]  = useState<number | null>(null);
  const [insight, setInsight] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("overload-name");
    if (stored) setName(stored);
    setStreak(computeStreak());
    setInsight(getPatternInsight());
  }, []);

  const showStreak = streak !== null;
  const hasStreak  = (streak ?? 0) > 0;

  return (
    <header className="dash-header">
      <h1 className="dash-greeting">
        {timeGreeting()}, <em>{name}</em>
      </h1>
      <p className="dash-subheading">{todayLabel()}</p>

      {insight && (
        <p className="greeting-insight">{insight}</p>
      )}

      {showStreak && (
        <div className={`dash-streak-badge${hasStreak ? "" : " dash-streak-zero"}`}>
          {hasStreak ? (
            <>
              <span className="dash-streak-flame">🔥</span>
              <span>
                {streak}-day streak — keep it going
              </span>
            </>
          ) : (
            <>
              <span className="dash-streak-flame">◯</span>
              <span>No streak yet — check in to start one</span>
            </>
          )}
        </div>
      )}
    </header>
  );
}
