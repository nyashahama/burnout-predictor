"use client";

import { useState, useEffect, useCallback } from "react";
import {
  forecast,
  history,
  recoveryPlan,
  trendDelta,
  consecutiveDangerDays,
  calculateLiveScore,
  getLiveSignals,
  getLiveSuggestion,
  scoreLabel,
} from "./data";
import ScoreCard from "@/components/dashboard/ScoreCard";
import ForecastChart from "@/components/dashboard/ForecastChart";
import CheckIn from "@/components/dashboard/CheckIn";
import HistoryChart from "@/components/dashboard/HistoryChart";
import UserGreeting from "@/components/dashboard/UserGreeting";
import BurnoutAlert from "@/components/dashboard/BurnoutAlert";
import RecoveryPlan from "@/components/dashboard/RecoveryPlan";

// Forecast stats derived from static forecast data
const dangerDaysAhead = Math.max(
  0,
  forecast.filter((d) => d.score > 65).length - 1,
);
const firstRecoveryDay = forecast.find((d, i) => i > 0 && d.score <= 40);

function todayKey() {
  return `checkin-${new Date().toISOString().split("T")[0]}`;
}

/** Reads the last 3 days of check-in stress values from localStorage. */
function getRecentStresses(): number[] {
  const stresses: number[] = [];
  const now = new Date();
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `checkin-${d.toISOString().split("T")[0]}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.stress === "number") stresses.push(parsed.stress);
      }
    } catch {}
  }
  return stresses;
}

export default function DashboardPage() {
  const [role, setRole]                   = useState("engineer");
  const [sleepBaseline, setSleepBaseline] = useState("8");
  const [estimatedScore, setEstimatedScore] = useState<number | null>(null);
  const [todayStress, setTodayStress]     = useState<number | null>(null);
  const [liveScore, setLiveScore]         = useState(55);
  const [ready, setReady]                 = useState(false);

  // Bootstrap: read profile + today's check-in from localStorage
  useEffect(() => {
    const savedRole  = localStorage.getItem("overload-role")  || "engineer";
    const savedSleep = localStorage.getItem("overload-sleep") || "8";
    const rawEstimate = localStorage.getItem("overload-estimated-score");
    const estimate = rawEstimate ? parseInt(rawEstimate, 10) : null;

    setRole(savedRole);
    setSleepBaseline(savedSleep);
    setEstimatedScore(estimate);

    // Check if user already checked in today
    let stress: number | null = null;
    try {
      const saved = localStorage.getItem(todayKey());
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.stress === "number") stress = parsed.stress;
      }
    } catch {}

    setTodayStress(stress);

    const score = calculateLiveScore({
      todayStress: stress,
      role: savedRole,
      sleepBaseline: savedSleep,
      recentStresses: getRecentStresses(),
      estimatedScore: estimate,
    });
    setLiveScore(score);
    setReady(true);
  }, []);

  // Called by CheckIn immediately after the user submits
  const handleCheckin = useCallback(
    (stress: number) => {
      setTodayStress(stress);
      const newScore = calculateLiveScore({
        todayStress: stress,
        role,
        sleepBaseline,
        recentStresses: getRecentStresses(),
        estimatedScore,
      });
      setLiveScore(newScore);
    },
    [role, sleepBaseline, estimatedScore],
  );

  const hasCheckedIn = todayStress !== null;
  const signals      = getLiveSignals(todayStress, role, sleepBaseline);
  const suggestion   = getLiveSuggestion(liveScore, hasCheckedIn);
  const level        = liveScore > 65 ? "danger" : liveScore > 40 ? "warning" : "ok";

  const scoreData = {
    score: liveScore,
    statusLabel: scoreLabel(liveScore),
    level: level as "ok" | "warning" | "danger",
    signals,
    suggestion,
    isPending: !hasCheckedIn,
  };

  return (
    <div className="dash-content">
      <BurnoutAlert
        score={liveScore}
        trend={trendDelta}
        dangerStreak={consecutiveDangerDays}
        dangerDaysAhead={dangerDaysAhead}
        recoveryDate={firstRecoveryDay?.date ?? "this weekend"}
      />

      <UserGreeting />

      <div className="dash-grid">
        <ScoreCard
          data={scoreData}
          trend={trendDelta}
          dangerStreak={consecutiveDangerDays}
          animate={ready}
        />
        <ForecastChart data={forecast} />
      </div>

      <CheckIn onCheckin={handleCheckin} />

      <RecoveryPlan plan={recoveryPlan} score={liveScore} />

      <HistoryChart data={history} />
    </div>
  );
}
