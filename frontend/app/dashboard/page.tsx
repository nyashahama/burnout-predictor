"use client";

import { useState, useEffect, useCallback } from "react";
import {
  recoveryPlan,
  trendDelta,
  consecutiveDangerDays,
  scoreLabel,
  buildNotificationText,
  type ForecastDay,
} from "./data";
import { useAuth } from "@/contexts/AuthContext";
import type { ScoreCardResult, CheckIn, UpsertCheckInResult } from "@/lib/types";
import ScoreCard from "@/components/dashboard/ScoreCard";
import ForecastChart from "@/components/dashboard/ForecastChart";
import CheckInComponent from "@/components/dashboard/CheckIn";
import HistoryChart from "@/components/dashboard/HistoryChart";
import UserGreeting from "@/components/dashboard/UserGreeting";
import BurnoutAlert from "@/components/dashboard/BurnoutAlert";
import RecoveryPlan from "@/components/dashboard/RecoveryPlan";
import MondayDebrief from "@/components/dashboard/MondayDebrief";
import ComebackCard from "@/components/dashboard/ComebackCard";
import MilestoneInsight from "@/components/dashboard/MilestoneInsight";
import EarlyArc from "@/components/dashboard/EarlyArc";
import GapReturn from "@/components/dashboard/GapReturn";
import RecoveryMilestone from "@/components/dashboard/RecoveryMilestone";
import PersonalizedInsight from "@/components/dashboard/PersonalizedInsight";

// Forecast stats derived from live forecast (updated after check-in)
function getForecastStats(data: ForecastDay[]) {
  const dangerDaysAhead = Math.max(0, data.filter((d) => d.score > 65).length - 1);
  const firstRecoveryDay = data.find((d, i) => i > 0 && d.score <= 40);
  return { dangerDaysAhead, firstRecoveryDay };
}

function scoreLevel(s: number): "ok" | "warning" | "danger" {
  if (s > 65) return "danger";
  if (s > 40) return "warning";
  return "ok";
}

function buildForecast(scoreCard: ScoreCardResult | null, checkins: CheckIn[]): ForecastDay[] {
  const result: ForecastDay[] = [];
  const today = new Date();
  for (let i = -6; i <= 0; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const isToday = i === 0;
    const ci = checkins.find(c => c.checked_in_date === dateStr);
    const score = isToday
      ? (scoreCard?.score.score ?? ci?.score ?? null)
      : (ci?.score ?? null);
    if (score !== null) {
      result.push({
        day: d.toLocaleDateString("en-US", { weekday: "short" }),
        date: isToday ? "Today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score,
        level: scoreLevel(score),
      });
    }
  }
  return result;
}

export default function DashboardPage() {
  const { api } = useAuth();

  const [scoreCard, setScoreCard]   = useState<ScoreCardResult | null>(null);
  const [checkins, setCheckins]     = useState<CheckIn[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [ready, setReady]           = useState(false);

  // Ambient danger mode
  const liveScore = scoreCard?.score.score ?? 55;
  useEffect(() => {
    const lvl = liveScore > 65 ? "danger" : liveScore > 40 ? "warning" : "ok";
    document.body.dataset.scoreLevel = lvl;
    return () => { delete document.body.dataset.scoreLevel; };
  }, [liveScore]);

  useEffect(() => {
    if (!api) return;
    Promise.all([
      api.get<ScoreCardResult>("/api/score"),
      api.get<CheckIn[]>("/api/checkins"),
    ])
      .then(([sc, ci]) => {
        setScoreCard(sc);
        setCheckins(ci);
        setReady(true);
      })
      .catch(console.error)
      .finally(() => setLoadingData(false));
  }, [api]);

  // Trigger notification when past reminder time and not yet checked in today
  useEffect(() => {
    if (loadingData) return;
    const streak = scoreCard?.streak ?? 0;
    try {
      if (
        "Notification" in window &&
        Notification.permission === "granted" &&
        localStorage.getItem("overload-notif-enabled") === "1" &&
        !scoreCard?.has_checkin
      ) {
        const timeStr = localStorage.getItem("overload-notif-time") || "17:30";
        const [hh, mm] = timeStr.split(":").map(Number);
        const nowTime = new Date();
        const isAfterTime =
          nowTime.getHours() > hh ||
          (nowTime.getHours() === hh && nowTime.getMinutes() >= mm);
        const notifKey = `notif-sent-${nowTime.toISOString().split("T")[0]}`;

        if (isAfterTime && !localStorage.getItem(notifKey)) {
          const savedName = localStorage.getItem("overload-name") || "";
          const { title, body } = buildNotificationText({
            streak,
            consecutiveDangerDays: 0,
            name: savedName || undefined,
          });
          new Notification(title, { body, icon: "/favicon.ico" });
          localStorage.setItem(notifKey, "1");
        }
      }
    } catch {}
  }, [loadingData, scoreCard?.has_checkin, scoreCard?.streak]);

  const handleCheckInComplete = useCallback((result: UpsertCheckInResult) => {
    setScoreCard(prev => prev ? {
      ...prev,
      score: result.score,
      explanation: result.explanation,
      suggestion: result.suggestion,
      has_checkin: true,
    } : null);
    setCheckins(prev => [
      result.check_in,
      ...prev.filter(c => c.checked_in_date !== result.check_in.checked_in_date),
    ]);
  }, []);

  const hasCheckedIn = scoreCard?.has_checkin ?? false;
  const level        = liveScore > 65 ? "danger" : liveScore > 40 ? "warning" : "ok";
  const liveForecast = buildForecast(scoreCard, checkins);
  const checkinCount = checkins.length;
  const streak       = scoreCard?.streak ?? 0;

  const scoreData = {
    score: liveScore,
    statusLabel: scoreLabel(liveScore),
    level: level as "ok" | "warning" | "danger",
    signals: scoreCard?.score.signals ?? [],
    suggestion: scoreCard?.suggestion ?? "",
    isPending: !hasCheckedIn,
  };

  const { dangerDaysAhead, firstRecoveryDay } = getForecastStats(liveForecast);

  // Build history from real check-ins for HistoryChart
  const realHistory = checkins
    .slice()
    .sort((a, b) => a.checked_in_date.localeCompare(b.checked_in_date))
    .map(ci => ({
      date: new Date(ci.checked_in_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: ci.score,
    }));

  // Today's note and stress from the most recent check-in (today's date)
  const todayStr = new Date().toISOString().split("T")[0];
  const todayCI  = checkins.find(c => c.checked_in_date === todayStr);
  const todayNote   = todayCI?.note ?? undefined;
  const todayStress = todayCI?.stress ?? null;

  return (
    <div className="dash-content">
      <BurnoutAlert
        score={liveScore}
        trend={trendDelta}
        dangerStreak={consecutiveDangerDays}
        dangerDaysAhead={dangerDaysAhead}
        recoveryDate={firstRecoveryDay?.date ?? "this weekend"}
      />

      <div className="dash-hero">
        <UserGreeting liveScore={liveScore} />
        <GapReturn hasCheckedIn={hasCheckedIn} />
        <EarlyArc checkinCount={checkinCount} />
        <ComebackCard currentScore={liveScore} />
        <RecoveryMilestone />
        <MilestoneInsight checkinCount={checkinCount} />
        <MondayDebrief />
        <div className="dash-grid">
          <ScoreCard
            data={scoreData}
            trend={trendDelta}
            dangerStreak={consecutiveDangerDays}
            animate={ready}
            streak={streak}
            checkinCount={checkinCount}
            explanation={scoreCard?.explanation}
            trajectory={scoreCard?.trajectory ?? undefined}
          />
          <ForecastChart data={liveForecast} />
          <CheckInComponent onComplete={handleCheckInComplete} />
        </div>
      </div>

      <PersonalizedInsight />

      <RecoveryPlan
        plan={recoveryPlan}
        score={liveScore}
        note={todayNote}
        stress={todayStress ?? undefined}
        consecutiveDays={0}
        role={scoreCard ? "engineer" : "engineer"}
      />

      <HistoryChart data={realHistory.length ? realHistory : []} checkinCount={checkinCount} />
    </div>
  );
}
