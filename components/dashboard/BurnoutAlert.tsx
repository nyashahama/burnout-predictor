"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = `burnout-dismissed-${new Date().toISOString().split("T")[0]}`;

export default function BurnoutAlert({
  score,
  trend,
  dangerStreak,
  dangerDaysAhead,
  recoveryDate,
}: {
  score: number;
  trend: number;
  dangerStreak: number;
  dangerDaysAhead: number;
  recoveryDate: string;
}) {
  const [dismissed, setDismissed] = useState(true); // start hidden, check localStorage

  useEffect(() => {
    setDismissed(!!localStorage.getItem(DISMISS_KEY));
  }, []);

  if (score <= 65 || dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  const streakText =
    dangerStreak === 1
      ? "today is your first high-strain day"
      : `you've been in the danger zone for ${dangerStreak} days in a row`;

  return (
    <div className="burnout-alert">
      <div className="burnout-alert-top">
        <div className="burnout-alert-icon">⚠</div>
        <div className="burnout-alert-body">
          <div className="burnout-alert-heading">High burnout risk detected</div>
          <p className="burnout-alert-text">
            Your score is{" "}
            <strong>{score}/100</strong> and {streakText}.{" "}
            {trend > 0 && `It's climbed ${trend} points this week. `}
            {dangerDaysAhead > 0
              ? `Your forecast shows ${dangerDaysAhead} more high-strain ${dangerDaysAhead === 1 ? "day" : "days"} — recovery expected from ${recoveryDate}.`
              : "Take action today to prevent a full crash."}
          </p>
          <div className="burnout-alert-actions">
            <div className="burnout-alert-action">
              <span className="burnout-alert-action-icon">😴</span>
              <span>Sleep 8+ hours tonight. Set a hard shutdown at 10 PM — it&apos;s your highest-leverage action right now.</span>
            </div>
            <div className="burnout-alert-action">
              <span className="burnout-alert-action-icon">📅</span>
              <span>Block tomorrow 9–11 AM as a no-meeting window before your calendar fills.</span>
            </div>
            <div className="burnout-alert-action">
              <span className="burnout-alert-action-icon">🚶</span>
              <span>Take a 20-minute walk today. No podcast, no phone. Just movement to lower cortisol.</span>
            </div>
          </div>
        </div>
        <button className="burnout-alert-dismiss" onClick={dismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
