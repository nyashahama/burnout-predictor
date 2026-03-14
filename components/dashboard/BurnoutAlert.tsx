"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = `burnout-dismissed-${new Date().toISOString().split("T")[0]}`;

function buildAlertBody(
  score: number,
  dangerStreak: number,
  trend: number,
  dangerDaysAhead: number,
  recoveryDate: string,
): string {
  const streakPhrase =
    dangerStreak <= 1
      ? "Today is your first day in the red."
      : `${dangerStreak} consecutive days in the red.`;

  const trendPhrase =
    trend > 0
      ? ` Your score climbed ${trend} points this week — the trend is moving in the wrong direction.`
      : ` Your score sits at ${score}.`;

  const forecastPhrase =
    dangerDaysAhead > 0
      ? ` The forecast doesn't ease until ${recoveryDate}. That means you have a window right now to make it shorter.`
      : ` The forecast clears soon — but only if you act on it today.`;

  return streakPhrase + trendPhrase + forecastPhrase;
}

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
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(!!localStorage.getItem(DISMISS_KEY));
  }, []);

  if (score <= 65 || dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  const body = buildAlertBody(score, dangerStreak, trend, dangerDaysAhead, recoveryDate);

  return (
    <div className="burnout-alert">
      <div className="burnout-alert-top">
        <div className="burnout-alert-icon">⚠</div>
        <div className="burnout-alert-body">
          <div className="burnout-alert-heading">You need to pull back</div>
          <p className="burnout-alert-text">{body}</p>
          <div className="burnout-alert-actions">
            <div className="burnout-alert-action">
              <span className="burnout-alert-action-icon">😴</span>
              <span>Sleep 8+ hours tonight. Set a hard shutdown at 10 PM — it&apos;s your highest-leverage action right now.</span>
            </div>
            <div className="burnout-alert-action">
              <span className="burnout-alert-action-icon">📅</span>
              <span>Block tomorrow 9–11 AM before your calendar fills. Guard it like an appointment you can&apos;t move.</span>
            </div>
            <div className="burnout-alert-action">
              <span className="burnout-alert-action-icon">🚶</span>
              <span>Twenty minutes outside today. No podcast, no phone. Movement lowers cortisol in ways nothing else does.</span>
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
