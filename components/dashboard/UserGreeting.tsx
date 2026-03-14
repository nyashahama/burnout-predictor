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

export default function UserGreeting() {
  const [name,   setName]   = useState(mockUser.name);
  const [streak, setStreak] = useState<number | null>(null); // null = loading

  useEffect(() => {
    const stored = localStorage.getItem("overload-name");
    if (stored) setName(stored);
    setStreak(computeStreak());
  }, []);

  const showStreak = streak !== null;
  const hasStreak  = (streak ?? 0) > 0;

  return (
    <header className="dash-header">
      <h1 className="dash-greeting">
        {timeGreeting()}, <em>{name}</em>
      </h1>
      <p className="dash-subheading">{todayLabel()}</p>

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
