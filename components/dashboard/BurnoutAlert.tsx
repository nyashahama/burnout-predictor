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
    dangerStreak >= 4
      ? `${dangerStreak} days running at high load. That's not a rough day — it's a sustained period.`
      : dangerStreak >= 2
      ? `${dangerStreak} days in a row above the threshold.`
      : "You're in the red today.";

  const contextPhrase =
    trend > 5
      ? ` The load has been climbing — up ${trend} points this week.`
      : ` Score is at ${score}.`;

  const forecastPhrase =
    dangerDaysAhead > 0
      ? ` The forecast doesn't clear until ${recoveryDate}. There's a window right now to shorten that — but only if something changes today.`
      : ` The forecast starts to ease soon. Tonight matters.`;

  return streakPhrase + contextPhrase + forecastPhrase;
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
          <div className="burnout-alert-heading">Something&apos;s building.</div>
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
