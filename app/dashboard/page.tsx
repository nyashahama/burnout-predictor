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

function computeStreak(): number {
  let s = 0;
  const now = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (localStorage.getItem(`checkin-${d.toISOString().split("T")[0]}`)) s++;
    else break;
  }
  return s;
}

export default function DashboardPage() {
  const [role, setRole]                           = useState("engineer");
  const [sleepBaseline, setSleepBaseline]         = useState("8");
  const [estimatedScore, setEstimatedScore]       = useState<number | null>(null);
  const [todayStress, setTodayStress]             = useState<number | null>(null);
  const [liveScore, setLiveScore]                 = useState(55);
  const [ready, setReady]                         = useState(false);
  const [checkinCount, setCheckinCount]           = useState(0);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [streak, setStreak]                       = useState(0);

  // Ambient danger mode — paint the whole interface with the score's urgency
  useEffect(() => {
    const lvl = liveScore > 65 ? "danger" : liveScore > 40 ? "warning" : "ok";
    document.body.dataset.scoreLevel = lvl;
    return () => { delete document.body.dataset.scoreLevel; };
  }, [liveScore]);

  useEffect(() => {
    const savedRole   = localStorage.getItem("overload-role")  || "engineer";
    const savedSleep  = localStorage.getItem("overload-sleep") || "8";
    const rawEstimate = localStorage.getItem("overload-estimated-score");
    const estimate    = rawEstimate ? parseInt(rawEstimate, 10) : null;
    const gcal        = localStorage.getItem("overload-gcal-connected") === "1";

    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith("checkin-")) count++;
    }
    setCheckinCount(count);
    setStreak(computeStreak());
    setCalendarConnected(gcal);
    setRole(savedRole);
    setSleepBaseline(savedSleep);
    setEstimatedScore(estimate);

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
      calendarConnected: gcal,
    });
    setLiveScore(score);
    setReady(true);
  }, []);

  const handleCheckin = useCallback(
    (stress: number) => {
      setTodayStress(stress);
      setStreak(computeStreak());
      const newScore = calculateLiveScore({
        todayStress: stress,
        role,
        sleepBaseline,
        recentStresses: getRecentStresses(),
        estimatedScore,
        calendarConnected,
      });
      setLiveScore(newScore);
    },
    [role, sleepBaseline, estimatedScore, calendarConnected],
  );

  const hasCheckedIn = todayStress !== null;
  const signals      = getLiveSignals(todayStress, role, sleepBaseline, calendarConnected);
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

      {/*
        dash-hero wraps greeting + grid together.
        On mobile, CSS gives the grid order:-1 so the score card
        appears before the text greeting — score dominates immediately.
      */}
      <div className="dash-hero">
        <UserGreeting />
        <div className="dash-grid">
          <ScoreCard
            data={scoreData}
            trend={trendDelta}
            dangerStreak={consecutiveDangerDays}
            animate={ready}
            streak={streak}
          />
          <ForecastChart data={forecast} />
          <CheckIn onCheckin={handleCheckin} />
        </div>
      </div>

      <RecoveryPlan plan={recoveryPlan} score={liveScore} />

      <HistoryChart data={history} checkinCount={checkinCount} />
    </div>
  );
}
