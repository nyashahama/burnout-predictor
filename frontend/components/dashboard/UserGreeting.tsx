"use client";

import { useEffect, useState } from "react";

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
 * Session continuity — reads yesterday's check-in and compares it to the
 * current live score to surface a meaningful one-liner about what changed.
 */
function getSessionContext(liveScore: number): string | null {
  const now       = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const key = `checkin-${yesterday.toISOString().split("T")[0]}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const yesterdayStress: number = parsed.stress ?? 0;
    const note: string            = parsed.note   ?? "";

    // Approximate yesterday's score from stress (same base map as calculateLiveScore)
    const baseMap: Record<number, number> = { 1: 22, 2: 35, 3: 50, 4: 64, 5: 76 };
    const yesterdayBase = baseMap[yesterdayStress] ?? 50;
    const delta         = liveScore - yesterdayBase;

    const n = note.toLowerCase();
    const hadDeadline = /deadline|deliver|launch|submit|due/.test(n);
    const hadMeetings = /meeting|call|sync|standup|review|presentation|demo/.test(n);
    const hadSleep    = /sleep|tired|exhausted|rest|insomnia/.test(n);

    if (hadDeadline && delta < -8)
      return `Looks like the pressure lifted a bit from yesterday's deadline.`;
    if (hadSleep && delta < -8)
      return `Yesterday's tiredness shows up in the data. Rest when you can today.`;
    if (hadMeetings && yesterdayStress >= 4)
      return `Yesterday was heavy on calls. See if you can protect some focus time today.`;
    if (delta <= -12)
      return `Down from yesterday. Whatever shifted — keep it.`;
    if (delta >= 12 && yesterdayStress <= 2)
      return `Yesterday was calm. Today the load is climbing — watch it early.`;
    if (delta >= 12)
      return `Up from yesterday. The data is tracking the pressure.`;
    if (Math.abs(delta) <= 5 && yesterdayStress >= 4)
      return `Still in elevated territory from yesterday. Today's choices matter.`;
  } catch {}

  return null;
}

/**
 * Fires once when a day-of-week pattern is first discovered.
 * Waits 30 days before surfacing the same pattern again.
 */
function getEarnedPatternInsight(): string | null {
  const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const now       = new Date();
  const todayDow  = now.getDay();
  const dayName   = DAY_NAMES[todayDow];

  // Check the cooldown — skip if seen within 30 days
  const seenKey = `pattern-seen-dow-${todayDow}`;
  const lastSeen = localStorage.getItem(seenKey);
  if (lastSeen) {
    const daysSince = Math.floor(
      (now.getTime() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince < 30) return null;
  }

  const stresses: number[] = [];
  for (let week = 1; week <= 8; week++) {
    const d = new Date(now);
    d.setDate(d.getDate() - week * 7);
    if (d.getDay() !== todayDow) continue;
    const raw = localStorage.getItem(`checkin-${d.toISOString().split("T")[0]}`);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.stress === "number") stresses.push(parsed.stress);
    } catch {}
  }

  if (stresses.length < 2) return null;
  const avg = stresses.reduce((a, b) => a + b, 0) / stresses.length;

  let insight: string | null = null;
  if (avg >= 4.2)      insight = `${dayName}s have been your hardest day, consistently. That's a pattern — it's worth changing something about them.`;
  else if (avg >= 3.6) insight = `${dayName}s tend to run heavier for you. The data has been saying this for a while.`;
  else if (avg <= 1.8) insight = `${dayName}s are reliably good to you. Whatever makes them work — protect it.`;
  else if (avg <= 2.4) insight = `${dayName}s tend to be your lighter days. Lean into that today.`;

  if (insight) {
    localStorage.setItem(seenKey, now.toISOString().split("T")[0]);
  }

  return insight;
}

/**
 * Month-over-month arc — compares this month's average to last month's
 * when both have at least 7 real check-ins.
 */
function getMonthlyArc(): string | null {
  const now         = new Date();
  const thisMonth   = now.getMonth();
  const thisYear    = now.getFullYear();
  const lastMonth   = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastYear    = thisMonth === 0 ? thisYear - 1 : thisYear;

  const thisScores: number[] = [];
  const lastScores: number[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith("checkin-")) continue;
    const dateStr = k.replace("checkin-", "");
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;

    try {
      const raw    = localStorage.getItem(k);
      const parsed = raw ? JSON.parse(raw) : null;
      const base: Record<number, number> = { 1: 22, 2: 35, 3: 50, 4: 64, 5: 76 };
      const score  = parsed?.stress ? (base[parsed.stress] ?? 50) : null;
      if (score === null) continue;

      if (d.getFullYear() === thisYear && d.getMonth() === thisMonth)
        thisScores.push(score);
      else if (d.getFullYear() === lastYear && d.getMonth() === lastMonth)
        lastScores.push(score);
    } catch {}
  }

  if (thisScores.length < 7 || lastScores.length < 7) return null;

  const thisAvg = Math.round(thisScores.reduce((a, b) => a + b, 0) / thisScores.length);
  const lastAvg = Math.round(lastScores.reduce((a, b) => a + b, 0) / lastScores.length);
  const delta   = thisAvg - lastAvg;

  if (Math.abs(delta) < 4) return null;

  const MONTH_NAMES = ["January","February","March","April","May","June",
                       "July","August","September","October","November","December"];
  const lastMonthName = MONTH_NAMES[lastMonth];

  if (delta <= -8)
    return `Noticeably lighter than ${lastMonthName}. Whatever changed this month — it's showing up in the data.`;
  if (delta < -4)
    return `Your load is trending down from ${lastMonthName}. Carry this forward.`;
  if (delta >= 8)
    return `Load is up compared to ${lastMonthName}. Worth paying attention to before it compounds.`;
  return `Running a bit hotter than ${lastMonthName}. The trend is worth watching.`;
}

/**
 * Checks if the user completed recovery plan items yesterday and today's
 * score moved in the right direction — closing the feedback loop.
 */
function getPlanOutcomeFeedback(todayScore: number): string | null {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const recoveryKey = `recovery-checked-${yesterdayStr}`;
  const checkedRaw  = localStorage.getItem(recoveryKey);
  if (!checkedRaw) return null;

  let checkedCount = 0;
  try {
    const parsed = JSON.parse(checkedRaw);
    if (Array.isArray(parsed)) checkedCount = parsed.length;
    else if (typeof parsed === "number") checkedCount = parsed;
  } catch { return null; }

  if (checkedCount < 2) return null;

  // Compare to yesterday's score
  const yKey = `checkin-${yesterdayStr}`;
  const yRaw = localStorage.getItem(yKey);
  if (!yRaw) return null;

  try {
    const parsed = JSON.parse(yRaw);
    const baseMap: Record<number, number> = { 1: 22, 2: 35, 3: 50, 4: 64, 5: 76 };
    const yesterdayScore = baseMap[parsed.stress] ?? 50;
    const delta = todayScore - yesterdayScore;

    if (delta <= -8)
      return `You worked the plan yesterday. The score moved. That's not a coincidence.`;
    if (delta <= -4)
      return `You checked off the plan yesterday. Today's a bit lighter. Keep it.`;
  } catch {}

  return null;
}

export default function UserGreeting({ liveScore }: { liveScore?: number }) {
  const [name,    setName]    = useState("");
  const [streak,  setStreak]  = useState<number | null>(null);
  const [insight, setInsight] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("overload-name");
    if (stored) setName(stored);
    setStreak(computeStreak());

    // Priority: plan outcome > session context > earned pattern discovery > monthly arc
    if (liveScore !== undefined) {
      const planFeedback = getPlanOutcomeFeedback(liveScore);
      if (planFeedback) {
        setInsight(planFeedback);
        return;
      }
    }
    const sessionCtx = liveScore !== undefined ? getSessionContext(liveScore) : null;
    if (sessionCtx) {
      setInsight(sessionCtx);
      return;
    }
    const earned = getEarnedPatternInsight();
    if (earned) {
      setInsight(earned);
      return;
    }
    setInsight(getMonthlyArc());
  }, [liveScore]);

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
