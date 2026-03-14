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
  stressToScore,
  buildScoreExplanation,
  buildTrajectoryInsight,
  buildNotificationText,
  type HistoryDay,
  type ForecastDay,
  type SignalLevel,
} from "./data";
import ScoreCard from "@/components/dashboard/ScoreCard";
import ForecastChart from "@/components/dashboard/ForecastChart";
import CheckIn from "@/components/dashboard/CheckIn";
import HistoryChart from "@/components/dashboard/HistoryChart";
import UserGreeting from "@/components/dashboard/UserGreeting";
import BurnoutAlert from "@/components/dashboard/BurnoutAlert";
import RecoveryPlan from "@/components/dashboard/RecoveryPlan";
import MondayDebrief from "@/components/dashboard/MondayDebrief";
import ComebackCard from "@/components/dashboard/ComebackCard";
import MilestoneInsight from "@/components/dashboard/MilestoneInsight";

// Forecast stats derived from live forecast (updated after check-in)
function getForecastStats(data: ForecastDay[]) {
  const dangerDaysAhead = Math.max(0, data.filter((d) => d.score > 65).length - 1);
  const firstRecoveryDay = data.find((d, i) => i > 0 && d.score <= 40);
  return { dangerDaysAhead, firstRecoveryDay };
}

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

function buildRealHistory(): HistoryDay[] {
  const role  = localStorage.getItem("overload-role")  || "engineer";
  const sleep = localStorage.getItem("overload-sleep") || "8";
  const days: HistoryDay[] = [];
  const now = new Date();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key     = `checkin-${d.toISOString().split("T")[0]}`;
    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const raw     = localStorage.getItem(key);

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        days.push({ date: dateStr, score: stressToScore(parsed.stress, role, sleep) });
      } catch {
        days.push({ date: dateStr, score: 0, ghost: true });
      }
    } else {
      days.push({ date: dateStr, score: 0, ghost: true });
    }
  }
  return days;
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

/**
 * Generates a 7-day forecast anchored to today's real score.
 * Uses personal day-of-week stress averages when ≥2 samples exist,
 * otherwise regresses toward the user's equilibrium score with
 * generic weekend relief.
 */
function buildLiveForecast(
  todayScore: number,
  role: string,
  sleepBaseline: string,
): ForecastDay[] {
  const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const now = new Date();
  const equilibrium = stressToScore(3, role, sleepBaseline);

  // Build personal DOW stress averages from all past check-ins
  const dowStresses: Record<number, number[]> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith("checkin-")) continue;
    const dateStr = k.replace("checkin-", "");
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (typeof parsed.stress !== "number") continue;
      const dow = d.getDay();
      if (!dowStresses[dow]) dowStresses[dow] = [];
      dowStresses[dow].push(parsed.stress);
    } catch {}
  }

  // Convert DOW stress averages to score targets
  const dowTargets: Record<number, number> = {};
  for (const [dow, stresses] of Object.entries(dowStresses)) {
    if (stresses.length >= 2) {
      const avg = stresses.reduce((a, b) => a + b, 0) / stresses.length;
      dowTargets[Number(dow)] = stressToScore(avg, role, sleepBaseline);
    }
  }

  // Generic weekend/weekday modifier (when no personal data)
  const genericMod: Record<number, number> = {
    0: -15, // Sunday
    6: -10, // Saturday
    1:   4, // Monday re-entry
  };

  const days: ForecastDay[] = [];
  let projected = todayScore;

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();

    let score: number;
    if (i === 0) {
      score = todayScore;
    } else {
      const hasPersonalData = dow in dowTargets;
      const target = hasPersonalData
        ? dowTargets[dow]
        : equilibrium + (genericMod[dow] ?? 0);
      projected = Math.round(projected + (target - projected) * 0.28);
      projected = Math.max(12, Math.min(88, projected));
      score = projected;
    }

    const level: SignalLevel = score > 65 ? "danger" : score > 40 ? "warning" : "ok";
    const isToday  = i === 0;
    const dateLabel = isToday
      ? "Today"
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    days.push({ day: DAY_SHORT[dow], date: dateLabel, score, level });
  }

  return days;
}

/**
 * Checks if today's score is a personal low record across recent check-ins.
 * Only fires once per day via localStorage key.
 */
function detectPersonalBest(
  currentScore: number,
  todayStress: number | null,
  role: string,
  sleepBaseline: string,
  checkinCount: number,
): string | null {
  if (!todayStress) return null;
  if (checkinCount < 7) return null;

  const seenKey = `personal-best-seen-${new Date().toISOString().split("T")[0]}`;
  if (localStorage.getItem(seenKey)) return null;

  const now = new Date();
  const pastScores: number[] = [];

  for (let i = 1; i <= 60; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const raw = localStorage.getItem(`checkin-${d.toISOString().split("T")[0]}`);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.stress === "number") {
        pastScores.push(stressToScore(parsed.stress, role, sleepBaseline));
      }
    } catch {}
    if (pastScores.length >= 30) break;
  }

  if (pastScores.length < 7) return null;

  const allHigher30 = pastScores.length >= 14 && pastScores.slice(0, 30).every((s) => s > currentScore);
  const allHigher14 = pastScores.length >= 7  && pastScores.slice(0, 14).every((s) => s > currentScore);

  if (allHigher30) {
    localStorage.setItem(seenKey, "1");
    return `Your lowest score in ${Math.min(pastScores.length, 30)} check-ins. Whatever you protected — it worked.`;
  }
  if (allHigher14 && currentScore <= 40) {
    localStorage.setItem(seenKey, "1");
    return `Your best score in two weeks. Something is working — name it and keep it.`;
  }
  return null;
}

export default function DashboardPage() {
  const [role, setRole]                                   = useState("engineer");
  const [sleepBaseline, setSleepBaseline]                 = useState("8");
  const [estimatedScore, setEstimatedScore]               = useState<number | null>(null);
  const [todayStress, setTodayStress]                     = useState<number | null>(null);
  const [todayNote, setTodayNote]                         = useState<string | undefined>(undefined);
  const [liveScore, setLiveScore]                         = useState(55);
  const [ready, setReady]                                 = useState(false);
  const [checkinCount, setCheckinCount]                   = useState(0);
  const [calendarConnected, setCalendarConnected]         = useState(false);
  const [streak, setStreak]                               = useState(0);
  const [realHistory, setRealHistory]                     = useState<HistoryDay[]>([]);
  const [consecutiveDangerReal, setConsecutiveDangerReal] = useState(0);
  const [liveForecast, setLiveForecast]                   = useState<ForecastDay[]>(forecast);
  const [personalBest, setPersonalBest]                   = useState<string | null>(null);

  // Ambient danger mode
  useEffect(() => {
    const lvl = liveScore > 65 ? "danger" : liveScore > 40 ? "warning" : "ok";
    document.body.dataset.scoreLevel = lvl;
    return () => { delete document.body.dataset.scoreLevel; };
  }, [liveScore]);

  useEffect(() => {
    const savedRole   = localStorage.getItem("overload-role")  || "engineer";
    const savedSleep  = localStorage.getItem("overload-sleep") || "8";
    const savedName   = localStorage.getItem("overload-name")  || "";
    const rawEstimate = localStorage.getItem("overload-estimated-score");
    const estimate    = rawEstimate ? parseInt(rawEstimate, 10) : null;
    const gcal        = localStorage.getItem("overload-gcal-connected") === "1";

    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith("checkin-")) count++;
    }

    const currentStreak = computeStreak();
    setCheckinCount(count);
    setStreak(currentStreak);
    setRealHistory(buildRealHistory());
    setCalendarConnected(gcal);
    setRole(savedRole);
    setSleepBaseline(savedSleep);
    setEstimatedScore(estimate);

    let stress: number | null = null;
    let note: string | undefined = undefined;
    try {
      const saved = localStorage.getItem(todayKey());
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.stress === "number") stress = parsed.stress;
        if (typeof parsed.note === "string" && parsed.note) note = parsed.note;
      }
    } catch {}

    setTodayStress(stress);
    setTodayNote(note);

    // Consecutive danger days from real check-ins
    let dangerCount = 0;
    const nowRef = new Date();
    for (let i = 1; i <= 30; i++) {
      const d = new Date(nowRef);
      d.setDate(d.getDate() - i);
      const raw = localStorage.getItem(`checkin-${d.toISOString().split("T")[0]}`);
      if (!raw) break;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.stress >= 4) dangerCount++;
        else break;
      } catch { break; }
    }
    setConsecutiveDangerReal(dangerCount);

    const score = calculateLiveScore({
      todayStress: stress,
      role: savedRole,
      sleepBaseline: savedSleep,
      recentStresses: getRecentStresses(),
      estimatedScore: estimate,
      calendarConnected: gcal,
    });
    setLiveScore(score);

    // Live forecast — replaces static mock data
    setLiveForecast(buildLiveForecast(score, savedRole, savedSleep));

    // Personal best — only meaningful after a real check-in
    if (stress !== null) {
      setPersonalBest(detectPersonalBest(score, stress, savedRole, savedSleep, count));
    }

    setReady(true);

    // Contextual notification — fires when past reminder time, not yet checked in, not sent today
    try {
      if (
        "Notification" in window &&
        Notification.permission === "granted" &&
        localStorage.getItem("overload-notif-enabled") === "1" &&
        stress === null // not checked in today
      ) {
        const timeStr = localStorage.getItem("overload-notif-time") || "17:30";
        const [hh, mm] = timeStr.split(":").map(Number);
        const nowTime = new Date();
        const isAfterTime =
          nowTime.getHours() > hh ||
          (nowTime.getHours() === hh && nowTime.getMinutes() >= mm);
        const notifKey = `notif-sent-${nowTime.toISOString().split("T")[0]}`;

        if (isAfterTime && !localStorage.getItem(notifKey)) {
          const { title, body } = buildNotificationText({
            streak: currentStreak,
            consecutiveDangerDays: dangerCount,
            name: savedName || undefined,
          });
          new Notification(title, { body, icon: "/favicon.ico" });
          localStorage.setItem(notifKey, "1");
        }
      }
    } catch {}
  }, []);

  const handleCheckin = useCallback(
    (stress: number) => {
      setTodayStress(stress);
      const newStreak = computeStreak();
      setStreak(newStreak);
      const newCount = checkinCount + 1;
      setCheckinCount(newCount);

      const newScore = calculateLiveScore({
        todayStress: stress,
        role,
        sleepBaseline,
        recentStresses: getRecentStresses(),
        estimatedScore,
        calendarConnected,
      });
      setLiveScore(newScore);
      setLiveForecast(buildLiveForecast(newScore, role, sleepBaseline));
      setPersonalBest(detectPersonalBest(newScore, stress, role, sleepBaseline, newCount));
    },
    [role, sleepBaseline, estimatedScore, calendarConnected, checkinCount],
  );

  const hasCheckedIn      = todayStress !== null;
  const signals           = getLiveSignals(todayStress, role, sleepBaseline, calendarConnected);
  const suggestion        = getLiveSuggestion(liveScore, hasCheckedIn);
  const level             = liveScore > 65 ? "danger" : liveScore > 40 ? "warning" : "ok";
  const recentStressesNow = getRecentStresses();
  const scoreExplanation  = buildScoreExplanation({
    score: liveScore,
    todayStress,
    consecutiveDangerDays: consecutiveDangerReal,
    recentStresses: recentStressesNow,
  });
  const trajectoryInsight = buildTrajectoryInsight(liveScore, recentStressesNow, consecutiveDangerReal);

  const { dangerDaysAhead, firstRecoveryDay } = getForecastStats(liveForecast);

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

      <div className="dash-hero">
        <UserGreeting liveScore={liveScore} />
        <ComebackCard currentScore={liveScore} />
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
            explanation={scoreExplanation}
            trajectory={trajectoryInsight ?? undefined}
            personalBest={personalBest ?? undefined}
          />
          <ForecastChart data={liveForecast} />
          <CheckIn onCheckin={handleCheckin} />
        </div>
      </div>

      <RecoveryPlan
        plan={recoveryPlan}
        score={liveScore}
        note={todayNote}
        stress={todayStress ?? undefined}
        consecutiveDays={consecutiveDangerReal}
        role={role}
      />

      <HistoryChart data={realHistory.length ? realHistory : history} checkinCount={checkinCount} />
    </div>
  );
}
