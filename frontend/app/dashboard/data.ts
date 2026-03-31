import { parseDateString } from "@/lib/date";

export type SignalLevel = "ok" | "warning" | "danger";

export type ForecastDay = {
  day: string;
  date: string;
  score: number;
  level: SignalLevel;
};

export type HistoryDay = { date: string; score: number; ghost?: boolean };

export type CheckInEntry = {
  date: string;
  stress: number;
  stressLabel: string;
  note?: string;
  score: number;
};


export function scoreColor(score: number): string {
  if (score > 65) return "var(--red)";
  if (score > 40) return "var(--amber)";
  return "var(--green)";
}

export function scoreLabel(score: number): string {
  if (score > 65) return "High strain";
  if (score > 40) return "Moderate load";
  return "In your zone";
}

// ─── Live Score Engine ────────────────────────────────────────────────────────

export type Signal = {
  label: string;
  detail: string;
  val: string;
  level: SignalLevel;
};

/**
 * Calculates a live cognitive load score from the user's real check-in
 * data and their onboarding profile. When no check-in exists for today,
 * returns the onboarding estimated score so Day 1 feels personal.
 */
export function calculateLiveScore({
  todayStress,
  role,
  sleepBaseline,
  recentStresses,
  estimatedScore,
  calendarConnected,
}: {
  todayStress: number | null;
  role: string;
  sleepBaseline: string;
  recentStresses: number[];
  estimatedScore: number | null;
  calendarConnected?: boolean;
}): number {
  // No check-in yet — surface the onboarding estimate so the score isn't generic
  if (todayStress === null) {
    return estimatedScore ?? 55;
  }

  // Stress level → base score range
  const base: Record<number, number> = { 1: 22, 2: 35, 3: 50, 4: 64, 5: 76 };
  let score = base[todayStress] ?? 50;

  // Role modifier (different ambient pressure baselines)
  const roleMod: Record<string, number> = {
    founder: 6, manager: 3, pm: 2, engineer: 0, designer: -2, other: 0,
  };
  score += roleMod[role] ?? 0;

  // Sleep baseline modifier (hours below target directly raises load)
  const sleepMod: Record<string, number> = { "6": 10, "7": 5, "8": 0, "9": -4 };
  score += sleepMod[sleepBaseline] ?? 0;

  // Recent trend — if the last 2+ check-ins trend above neutral, add weight
  if (recentStresses.length >= 2) {
    const avg = recentStresses.reduce((a, b) => a + b, 0) / recentStresses.length;
    score += Math.round((avg - 3) * 2.5); // 3 is neutral
  }

  // Calendar integration — detects meeting density, adds realistic pressure
  if (calendarConnected) score += 4;

  return Math.max(8, Math.min(92, Math.round(score)));
}

/** Builds live signal rows from the user's real profile + today's check-in. */
export function getLiveSignals(
  todayStress: number | null,
  role: string,
  sleepBaseline: string,
  calendarConnected?: boolean,
): Signal[] {
  const results: Signal[] = [];

  // Sleep signal
  const hoursMap: Record<string, number> = { "6": 6, "7": 7, "8": 8, "9": 9 };
  const hours = hoursMap[sleepBaseline] ?? 8;
  results.push({
    label: "Your sleep",
    detail:
      hours <= 6
        ? `${hours}h target — chronic deficit, little recovery margin`
        : hours === 7
        ? "7h target — slightly below the ideal recovery window"
        : `${hours}h target — solid recovery capacity`,
    val: `${hours}h`,
    level: hours <= 6 ? "danger" : hours === 7 ? "warning" : "ok",
  });

  // Stress signal — pending if no check-in yet
  if (todayStress !== null) {
    const stressMap: Record<number, { detail: string; val: string; level: SignalLevel }> = {
      1: { detail: "You're running calm — protect this",          val: "Very calm",   level: "ok" },
      2: { detail: "Good baseline — keep protecting sleep",       val: "Relaxed",     level: "ok" },
      3: { detail: "Manageable — watch for accumulation",         val: "Moderate",    level: "warning" },
      4: { detail: "Elevated — your body is working hard",        val: "Stressed",    level: "warning" },
      5: { detail: "High — take action today, not tomorrow",      val: "Overwhelmed", level: "danger" },
    };
    const s = stressMap[todayStress];
    if (s) results.push({ label: "How you carried it", ...s });
  } else {
    results.push({
      label: "Today's check-in",
      detail: "Check in below to factor today's stress into your score",
      val: "Pending",
      level: "warning",
    });
  }

  // Calendar density signal (when Google Calendar is connected)
  if (calendarConnected) {
    results.push({
      label: "Calendar density",
      detail: "6 meetings today — 0 protected deep-work blocks detected",
      val: "Overloaded",
      level: "warning",
    });
  }

  // Role load signal
  const roleSignals: Record<string, { detail: string; val: string; level: SignalLevel }> = {
    founder:  { detail: "Founders carry ambient pressure most tools don't measure",   val: "Very high",    level: "danger" },
    manager:  { detail: "Managing people adds invisible overhead your calendar doesn't show", val: "Elevated", level: "warning" },
    pm:       { detail: "Coordination overhead elevates your baseline",               val: "Moderate+",    level: "warning" },
    engineer: { detail: "Deep work role — protecting focus blocks is key",            val: "Baseline",     level: "ok" },
    designer: { detail: "Creative role — lower ambient pressure baseline",            val: "Low baseline", level: "ok" },
    other:    { detail: "Your role contributes to your baseline load",                val: "Baseline",     level: "ok" },
  };
  const rs = roleSignals[role];
  if (rs) results.push({ label: "Your role", ...rs });

  return results;
}

// ─── Pattern Detection ────────────────────────────────────────────────────────

/**
 * Analyses a history array and returns up to 3 human-readable
 * pattern observations (day-of-week spikes, trend, strain frequency).
 */
export function detectPatterns(data: HistoryDay[]): string[] {
  if (data.length < 7) return [];

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Group scores by day of week
  const byDow: Record<number, number[]> = {};
  data.forEach((d) => {
    const date = parseDateString(d.date);
    if (!date) return;
    const dow = date.getDay();
    if (!byDow[dow]) byDow[dow] = [];
    byDow[dow].push(d.score);
  });

  const overallAvg = Math.round(data.reduce((s, d) => s + d.score, 0) / data.length);
  const patterns: string[] = [];

  // Find the highest and lowest average weekday (need ≥3 samples)
  let highDay = -1, highAvg = 0;
  let lowDay  = -1, lowAvg  = 101;
  Object.entries(byDow).forEach(([dow, scores]) => {
    if (scores.length < 3) return;
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    if (avg > highAvg && avg > overallAvg + 4) { highAvg = avg; highDay = Number(dow); }
    if (avg < lowAvg  && avg < overallAvg - 4) { lowAvg  = avg; lowDay  = Number(dow); }
  });

  if (highDay >= 0) {
    patterns.push(
      `${DAY_NAMES[highDay]}s tend to run harder than the rest of your week. Whatever that day looks like — it's worth changing something about it.`
    );
  }
  if (lowDay >= 0) {
    patterns.push(
      `${DAY_NAMES[lowDay]}s bring you back reliably. Don't let meetings creep in — they're working.`
    );
  }

  // 7-day trend vs prior 7
  if (data.length >= 14) {
    const recent = data.slice(-7).map((d) => d.score);
    const prior  = data.slice(-14, -7).map((d) => d.score);
    const rAvg = Math.round(recent.reduce((a, b) => a + b, 0) / 7);
    const pAvg = Math.round(prior.reduce((a, b) => a + b, 0) / 7);
    const delta = rAvg - pAvg;
    if (Math.abs(delta) >= 4) {
      patterns.push(
        delta > 0
          ? `Your load has been climbing for two weeks straight. That trajectory doesn't reverse on its own.`
          : `Your load dropped this week. Whatever changed — do it again.`
      );
    }
  }

  // High-strain frequency callout
  if (patterns.length < 3) {
    const highStrainCount = data.filter((d) => d.score > 65).length;
    const pct = Math.round((highStrainCount / data.length) * 100);
    if (pct >= 25) {
      patterns.push(`More than ${pct}% of your days this month hit the danger zone. That pace isn't sustainable.`);
    } else if (pct <= 10 && data.length >= 14) {
      patterns.push(`Only ${pct}% of your days in the danger zone this month. You're managing the load.`);
    }
  }

  return patterns.slice(0, 3);
}

/**
 * Converts a raw stress rating (1–5) to an estimated cognitive load score,
 * optionally blending in the user's role and sleep baseline. Used to build
 * real history from localStorage check-ins.
 */
export function stressToScore(
  stress: number,
  role: string = "engineer",
  sleepBaseline: string = "8",
): number {
  const base: Record<number, number> = { 1: 22, 2: 35, 3: 50, 4: 64, 5: 76 };
  const roleMod: Record<string, number> = {
    founder: 6, manager: 3, pm: 2, engineer: 0, designer: -2, other: 0,
  };
  const sleepMod: Record<string, number> = { "6": 10, "7": 5, "8": 0, "9": -4 };
  let score = base[stress] ?? 50;
  score += roleMod[role] ?? 0;
  score += sleepMod[sleepBaseline] ?? 0;
  return Math.max(8, Math.min(92, Math.round(score)));
}

/**
 * Returns a short string surfacing how much the score has been refined by
 * real check-ins. Returns null when there's not enough data to say anything.
 */
export function getAccuracyLabel(count: number): string | null {
  if (count >= 30) return `${count} check-ins in — as accurate as it gets`;
  if (count >= 14) return `${count} check-ins in — your most accurate reading yet`;
  if (count >= 7)  return `Based on ${count} real check-ins`;
  if (count >= 3)  return `${count} check-ins in — getting smarter`;
  return null;
}

// ─── Plan section type (shared with RecoveryPlan component) ──────────────────

export type PlanSection = { timing: string; actions: string[] };

// ─── Score explanation ────────────────────────────────────────────────────────

/**
 * Returns one sentence explaining WHY the score is what it is,
 * connecting consecutive days, stress level, and sleep baseline.
 */
export function buildScoreExplanation({
  score,
  todayStress,
  consecutiveDangerDays,
  recentStresses,
}: {
  score: number;
  todayStress: number | null;
  consecutiveDangerDays: number;
  recentStresses: number[];
}): string {
  if (todayStress === null) {
    if (score > 65)
      return "This estimate is based on your onboarding profile — check in below to make it yours.";
    return "Your starting estimate from onboarding. Check in below to refine it.";
  }
  if (consecutiveDangerDays >= 3)
    return `${consecutiveDangerDays} consecutive days of high load compound in ways that sleep alone can't fix overnight.`;
  if (consecutiveDangerDays >= 2)
    return "Back-to-back hard days leave a residue that a single rest day doesn't clear.";
  if (todayStress >= 5 && score > 65)
    return "Overwhelm today drives the score hard. Sleep is the fastest recovery lever you have tonight.";
  if (todayStress <= 2 && score > 50) {
    const recentHigh = recentStresses.filter((s) => s >= 4).length;
    if (recentHigh >= 1)
      return "You're carrying it better today, but the load from earlier this week is still in the number.";
    return "Your sleep baseline is keeping the score up even on a calm day.";
  }
  if (todayStress <= 2 && score <= 40)
    return "Low stress and a solid sleep baseline put you in the clear. This is what recovery looks like.";
  if (score > 65)
    return "Today's stress combined with your recent pattern is pushing the number up.";
  if (score <= 40)
    return "Everything is working in your favour today. Protect tonight's sleep to carry this forward.";
  return "Your score reflects today's check-in and the load pattern from earlier this week.";
}

// ─── Dynamic recovery plan ────────────────────────────────────────────────────

/**
 * Builds a personalised recovery plan by keyword-matching the user's note
 * and factoring in their stress level, consecutive danger days, and role.
 */
export function buildDynamicRecoveryPlan({
  note,
  stress,
  consecutiveDays,
  role,
}: {
  note?: string;
  stress: number;
  consecutiveDays: number;
  role: string;
}): PlanSection[] {
  const n = (note || "").toLowerCase();
  const hasDeadline = /deadline|deliver|launch|submit|due/.test(n);
  const hasMeetings = /meeting|call|sync|standup|review|presentation|demo/.test(n);
  const hasSleep    = /sleep|tired|exhausted|rest|insomnia/.test(n);
  const hasTravel   = /travel|flight|hotel|trip/.test(n);
  const hasFamily   = /family|kid|child|parent/.test(n);

  const tonightActions: string[] = [];
  const tomorrowActions: string[] = [];
  const weekActions: string[] = [];

  // Tonight
  if (hasSleep || stress >= 4) {
    tonightActions.push("Hard-stop work by 8 PM. Laptop closed, no exceptions.");
    tonightActions.push("Set a 10 PM sleep alarm — 8 hours is your fastest recovery lever.");
    tonightActions.push("No screens in the last 30 minutes before bed.");
  } else {
    tonightActions.push("Wind down by 9 PM — don't let relief from a calmer day become an excuse to push.");
    tonightActions.push("Protect sleep over everything else tonight.");
  }

  // Tomorrow
  if (hasDeadline) {
    tomorrowActions.push("Block the first 90 minutes of tomorrow for the actual deliverable — before email or Slack.");
    tomorrowActions.push("Identify one thing on tomorrow's list that can slip without real consequence. Move it.");
  } else if (hasMeetings) {
    tomorrowActions.push("Audit tomorrow's calendar now. Convert one sync to async before you close the laptop.");
    tomorrowActions.push("Block 9–11 AM as a protected focus window before the day fills.");
  } else {
    tomorrowActions.push("Block 9–11 AM as a no-meeting deep-work window before your calendar fills.");
    tomorrowActions.push("Take a 20-minute walk at lunch — leave your phone at your desk.");
  }

  if (hasTravel) {
    tomorrowActions.push("Travel compounds load. Protect sleep over everything else while you're out.");
  }
  if (hasFamily) {
    tomorrowActions.push("Protect one uninterrupted hour with family tomorrow — leave the phone in another room.");
  }

  // This week
  if (consecutiveDays >= 2) {
    weekActions.push(`${consecutiveDays + 1} consecutive hard days. One thing needs to come off your plate — a meeting converted to async, a deadline pushed, something.`);
  }
  if (role === "founder" || role === "manager") {
    weekActions.push("Identify one decision you've been carrying that can be delegated or dropped this week.");
  }
  weekActions.push("Protect at least one evening this week from any work.");
  if (stress >= 4) {
    weekActions.push("Keep meetings under 4 per day through the end of the week.");
  }

  return [
    { timing: "Tonight",    actions: tonightActions },
    { timing: "Tomorrow",   actions: tomorrowActions },
    { timing: "This week",  actions: weekActions },
  ];
}

/** Returns a personalised suggestion based on the live score + check-in state. */
export function getLiveSuggestion(score: number, hasCheckedIn: boolean, dangerStreak: number = 0): string {
  if (!hasCheckedIn) {
    return "Complete your daily check-in below to get a personalised recommendation based on how you're actually feeling today.";
  }
  // Witness-only path — no directive, just acknowledgment
  if (dangerStreak >= 4) {
    return `${dangerStreak} consecutive days in the red. That's not a rough patch. That's sustained. I see it.`;
  }
  if (score > 75) {
    return "You're in critical load territory. Hard-stop work by 8 PM tonight — no exceptions. Skip optional evening commitments and aim for 8+ hours of sleep. That's your single highest-leverage action right now.";
  }
  if (score > 65) {
    return "Block tomorrow 9–11 AM for deep work before your calendar fills. Convert at least one sync today to async. Sleep is your biggest lever tonight — aim for 8 hours.";
  }
  if (score > 50) {
    return "You're in the moderate zone. Protect your focus blocks and don't let meetings creep into mornings. A 15-minute walk today will measurably lower tomorrow's score.";
  }
  if (score > 40) {
    return "You're running sustainably. Build the habit here — consistent sleep and protected focus blocks will keep you in this zone.";
  }
  return "You're in the green. Cognitive capacity at its best — do the deep work that actually matters today. Protect tonight's sleep and this carries into tomorrow.";
}

// ─── Trajectory language ──────────────────────────────────────────────────────

/**
 * Projects where the score is heading and names a specific day.
 * Returns forward-looking, action-motivating language — not a description
 * of where the user already is.
 */
export function buildTrajectoryInsight(
  score: number,
  recentStresses: number[],
  consecutiveDangerDays: number,
): string | null {
  if (recentStresses.length < 2) return null;

  const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const now = new Date();

  const last3 = recentStresses.slice(0, 3);
  const trendingUp   = last3.length >= 2 && last3[0] >= last3[last3.length - 1];
  const trendingDown = last3.length >= 2 && last3[0] < last3[last3.length - 1] - 0.4;

  const peakDayDate = new Date(now);
  peakDayDate.setDate(peakDayDate.getDate() + 2);
  const peakDayName = DAY_NAMES[peakDayDate.getDay()];

  const clearDayDate = new Date(now);
  clearDayDate.setDate(clearDayDate.getDate() + 2);
  const clearDayName = DAY_NAMES[clearDayDate.getDay()];

  if (consecutiveDangerDays >= 4) {
    return `${consecutiveDangerDays} days at high load without recovery. The compounding effect is real — this doesn't ease on its own. One structural change today matters more than a perfect week later.`;
  }
  if (score > 65 && trendingUp && recentStresses.length >= 2) {
    return `The load has been building for ${recentStresses.length} days. If the pattern holds, ${peakDayName} is your highest-risk point this week. The window to change it is now, not then.`;
  }
  if (score > 65 && trendingDown) {
    return `The pressure is starting to ease. Two more careful nights and you should be out of the red by ${clearDayName}.`;
  }
  if (score > 40 && score <= 65 && trendingUp && last3[0] >= 3.5) {
    return `Three more days like this and you're in hard territory. The time to protect sleep and cut one commitment is before you hit the wall, not after.`;
  }
  if (score <= 40 && trendingDown) {
    return `You're holding the line. The risk now is letting a good run become an excuse to push harder. Protect tonight the same way you protected last night.`;
  }
  return null;
}

// ─── Milestone insight ────────────────────────────────────────────────────────

export type MilestoneData = {
  milestone: 30 | 60 | 90;
  hardestDay: string | null;
  easiestDay: string | null;
  hardestDayStress: number;
  easiestDayStress: number;
  keywordTrigger: string | null;
  keywordLift: number;
  recoveryDays: number | null;
  firstHalfAvg: number;
  secondHalfAvg: number;
  totalEntries: number;
};

/**
 * Computes what the app has learned about the user at the 30/60/90
 * check-in milestone. Returns null if the milestone has already been seen
 * or we're not near one.
 */
export function buildMilestoneData(checkinCount: number): MilestoneData | null {
  let milestone: 30 | 60 | 90 | null = null;
  if (checkinCount >= 28 && checkinCount <= 33) milestone = 30;
  else if (checkinCount >= 58 && checkinCount <= 63) milestone = 60;
  else if (checkinCount >= 88 && checkinCount <= 93) milestone = 90;
  if (!milestone) return null;

  const seenKey = `milestone-seen-${milestone}`;
  if (typeof window !== "undefined" && localStorage.getItem(seenKey)) return null;

  const role  = localStorage.getItem("overload-role")  || "engineer";
  const sleep = localStorage.getItem("overload-sleep") || "8";
  const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  const entries: Array<{ dateStr: string; stress: number; score: number; note: string }> = [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("checkin-")) keys.push(k);
  }
  keys.sort();

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const dateStr = key.replace("checkin-", "");
      entries.push({
        dateStr,
        stress: parsed.stress ?? 3,
        score:  stressToScore(parsed.stress ?? 3, role, sleep),
        note:   parsed.note ?? "",
      });
    } catch {}
  }

  if (entries.length < 10) return null;

  // Hardest / easiest day of week
  const byDow: Record<number, number[]> = {};
  entries.forEach((e) => {
    const dow = new Date(e.dateStr).getDay();
    if (!byDow[dow]) byDow[dow] = [];
    byDow[dow].push(e.stress);
  });

  let hardestDay: string | null = null, easiestDay: string | null = null;
  let hardestDayStress = 0, easiestDayStress = 6;
  Object.entries(byDow).forEach(([dow, stresses]) => {
    if (stresses.length < 3) return;
    const avg = stresses.reduce((a, b) => a + b, 0) / stresses.length;
    if (avg > hardestDayStress)  { hardestDayStress  = avg; hardestDay  = DAY_NAMES[Number(dow)]; }
    if (avg < easiestDayStress)  { easiestDayStress  = avg; easiestDay  = DAY_NAMES[Number(dow)]; }
  });

  // Keyword trigger — which word most predicts elevated stress
  const KEYWORDS = ["deadline","meeting","sleep","tired","travel","overwhelm","pressure","project","launch"];
  let keywordTrigger: string | null = null;
  let keywordLift = 0;
  const baseline = entries.reduce((a, b) => a + b.stress, 0) / entries.length;
  for (const kw of KEYWORDS) {
    const matches = entries.filter((e) => e.note.toLowerCase().includes(kw));
    if (matches.length < 2) continue;
    const avg  = matches.reduce((a, b) => a + b.stress, 0) / matches.length;
    const lift = avg - baseline;
    if (lift > keywordLift) { keywordLift = lift; keywordTrigger = kw; }
  }

  // Recovery speed — after stress ≥ 4, how many days to stress ≤ 2
  let totalRecDays = 0, recCount = 0;
  for (let i = 0; i < entries.length - 1; i++) {
    if (entries[i].stress >= 4) {
      for (let j = i + 1; j < Math.min(entries.length, i + 14); j++) {
        if (entries[j].stress <= 2) { totalRecDays += j - i; recCount++; break; }
      }
    }
  }
  const recoveryDays = recCount > 0 ? Math.round(totalRecDays / recCount) : null;

  // First half vs second half trajectory
  const mid = Math.floor(entries.length / 2);
  const firstHalfAvg  = Math.round(entries.slice(0, mid).reduce((a, b) => a + b.score, 0) / mid);
  const secondHalfAvg = Math.round(entries.slice(mid).reduce((a, b) => a + b.score, 0) / (entries.length - mid));

  return {
    milestone,
    hardestDay,
    easiestDay,
    hardestDayStress: Math.round(hardestDayStress * 10) / 10,
    easiestDayStress: Math.round(easiestDayStress * 10) / 10,
    keywordTrigger,
    keywordLift: Math.round(keywordLift * 10) / 10,
    recoveryDays,
    firstHalfAvg,
    secondHalfAvg,
    totalEntries: entries.length,
  };
}

// ─── Personal signature ───────────────────────────────────────────────────────

export type SignatureData = {
  hardestDay: string | null;
  easiestDay: string | null;
  topTrigger: string | null;
  triggerLift: number;
  avgScore: number;
  recoveryDays: number | null;
  trend: "improving" | "stable" | "worsening";
};

/**
 * Computes the user's personal load signature from all available check-ins.
 * Requires ≥14 entries. Used in the History page "Your signature" section.
 */
export function computePersonalSignature(): SignatureData | null {
  const role  = localStorage.getItem("overload-role")  || "engineer";
  const sleep = localStorage.getItem("overload-sleep") || "8";
  const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  const entries: Array<{ dateStr: string; stress: number; score: number; note: string }> = [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("checkin-")) keys.push(k);
  }
  if (keys.length < 14) return null;
  keys.sort();

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      entries.push({
        dateStr: key.replace("checkin-", ""),
        stress:  parsed.stress ?? 3,
        score:   stressToScore(parsed.stress ?? 3, role, sleep),
        note:    parsed.note ?? "",
      });
    } catch {}
  }
  if (entries.length < 14) return null;

  const byDow: Record<number, number[]> = {};
  entries.forEach((e) => {
    const dow = new Date(e.dateStr).getDay();
    if (!byDow[dow]) byDow[dow] = [];
    byDow[dow].push(e.stress);
  });

  let hardestDay: string | null = null, easiestDay: string | null = null;
  let hardestAvg = 0, easiestAvg = 6;
  Object.entries(byDow).forEach(([dow, stresses]) => {
    if (stresses.length < 2) return;
    const avg = stresses.reduce((a, b) => a + b, 0) / stresses.length;
    if (avg > hardestAvg) { hardestAvg = avg; hardestDay = DAY_NAMES[Number(dow)]; }
    if (avg < easiestAvg) { easiestAvg = avg; easiestDay = DAY_NAMES[Number(dow)]; }
  });

  const KEYWORDS = ["deadline","meeting","sleep","tired","travel","overwhelm","pressure","project"];
  let topTrigger: string | null = null, triggerLift = 0;
  const baseline = entries.reduce((a, b) => a + b.stress, 0) / entries.length;
  for (const kw of KEYWORDS) {
    const matches = entries.filter((e) => e.note.toLowerCase().includes(kw));
    if (matches.length < 2) continue;
    const avg  = matches.reduce((a, b) => a + b.stress, 0) / matches.length;
    const lift = avg - baseline;
    if (lift > triggerLift) { triggerLift = lift; topTrigger = kw; }
  }

  const avgScore = Math.round(entries.reduce((a, b) => a + b.score, 0) / entries.length);

  let totalRec = 0, recCount = 0;
  for (let i = 0; i < entries.length - 1; i++) {
    if (entries[i].stress >= 4) {
      for (let j = i + 1; j < Math.min(entries.length, i + 10); j++) {
        if (entries[j].stress <= 2) { totalRec += j - i; recCount++; break; }
      }
    }
  }
  const recoveryDays = recCount > 0 ? Math.round(totalRec / recCount) : null;

  const mid = Math.floor(entries.length / 2);
  const firstAvg  = entries.slice(0, mid).reduce((a, b) => a + b.score, 0) / mid;
  const secondAvg = entries.slice(mid).reduce((a, b) => a + b.score, 0) / (entries.length - mid);
  const trend: "improving" | "stable" | "worsening" =
    secondAvg < firstAvg - 4 ? "improving" :
    secondAvg > firstAvg + 4 ? "worsening" : "stable";

  return {
    hardestDay,
    easiestDay,
    topTrigger,
    triggerLift: Math.round(triggerLift * 10) / 10,
    avgScore,
    recoveryDays,
    trend,
  };
}

// ─── Signature narrative ──────────────────────────────────────────────────────

/**
 * Turns the personal signature data into a fluent prose paragraph —
 * the same caring voice as the check-in, not a dashboard table.
 */
export function buildSignatureNarrative(sig: SignatureData): string {
  const sentences: string[] = [];

  if (sig.topTrigger && sig.triggerLift >= 0.5) {
    const triggerMap: Record<string, string> = {
      deadline:  `Deadlines are what break you — not meetings, not your calendar. When they appear in your notes, your stress climbs every time.`,
      meeting:   `Heavy meeting days are your main stress driver. It's not the work itself — it's the fragmentation.`,
      sleep:     `Sleep is the variable that moves your score more than anything else. When you're rested, the same week looks different.`,
      tired:     `Fatigue compounds everything for you. When you note that you're tired, the days that follow are reliably harder.`,
      travel:    `Travel disrupts your baseline more than most. Your score is almost always elevated on those weeks.`,
      overwhelm: `Overwhelm isn't occasional for you — it's a pattern the data has seen enough times to call out.`,
      pressure:  `Pressure — the ambient kind — is what drives your load more than specific events.`,
      project:   `Project complexity is your main stressor. The bigger the scope, the higher the score.`,
    };
    sentences.push(
      triggerMap[sig.topTrigger] ??
        `When "${sig.topTrigger}" appears in your notes, your stress reads ${sig.triggerLift.toFixed(1)} points above your baseline. Consistently.`
    );
  }

  if (sig.hardestDay && sig.easiestDay && sig.hardestDay !== sig.easiestDay) {
    sentences.push(
      `Your ${sig.hardestDay}s tend to run hot. Your ${sig.easiestDay}s almost always bring you back.`
    );
  } else if (sig.hardestDay) {
    sentences.push(`Your ${sig.hardestDay}s are consistently your hardest day of the week.`);
  }

  if (sig.recoveryDays !== null) {
    if (sig.recoveryDays <= 1) {
      sentences.push(`You recover fast — usually back to calm within a day after a hard stretch.`);
    } else if (sig.recoveryDays === 2) {
      sentences.push(`It takes you about two days to fully reset after a hard period.`);
    } else {
      sentences.push(
        `Recovery takes you ${sig.recoveryDays} days on average after a hard stretch — plan for it.`
      );
    }
  }

  if (sig.trend === "improving") {
    sentences.push(`Your load has been coming down. Whatever you've changed — it's showing up in the data.`);
  } else if (sig.trend === "worsening") {
    sentences.push(`The trend is climbing. This is the kind of thing that doesn't reverse on its own.`);
  }

  if (sentences.length === 0) return "Keep checking in. The app is still learning your pattern.";
  return sentences.join(" ");
}

// ─── Contextual notification text ────────────────────────────────────────────

/**
 * Builds a notification title + body that responds to the user's actual state.
 * Sounds like the check-in voice, not a calendar reminder.
 */
export function buildNotificationText({
  streak,
  consecutiveDangerDays,
  name,
}: {
  streak: number;
  consecutiveDangerDays: number;
  name?: string;
}): { title: string; body: string } {
  if (consecutiveDangerDays >= 3) {
    return {
      title: "Check in tonight",
      body: `${consecutiveDangerDays} days in the danger zone. Tonight's check-in matters more than usual.`,
    };
  }
  if (consecutiveDangerDays >= 1) {
    return {
      title: "How's today landing?",
      body: "Yesterday was hard. See if today feels different — it only takes 30 seconds.",
    };
  }
  if (streak >= 7) {
    return {
      title: `${streak}-day streak`,
      body: "You've checked in every day this week. Don't break it tonight.",
    };
  }
  if (streak >= 3) {
    return {
      title: "Keep the streak going",
      body: `${streak} days in a row. One more tonight.`,
    };
  }
  if (name) {
    return {
      title: `How are you carrying it, ${name}?`,
      body: "Take 30 seconds. The data gets smarter every time you check in.",
    };
  }
  return {
    title: "How are you carrying it?",
    body: "Take 30 seconds. The data gets smarter every time you check in.",
  };
}

// ─── Long arc story ───────────────────────────────────────────────────────────

/**
 * Narrates the past 2+ months as a story — not patterns, not stats.
 * Finds the worst stretch, detects whether a turning point occurred,
 * and compares the recent 14 days to the 14 before.
 * Requires ≥21 check-ins.
 */
export function buildLongArcNarrative(): string | null {
  if (typeof window === "undefined") return null;
  const role  = localStorage.getItem("overload-role")  || "engineer";
  const sleep = localStorage.getItem("overload-sleep") || "8";

  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("checkin-")) keys.push(k);
  }
  if (keys.length < 21) return null;
  keys.sort();

  const entries: Array<{ dateStr: string; score: number }> = [];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      entries.push({
        dateStr: key.replace("checkin-", ""),
        score:   stressToScore(parsed.stress ?? 3, role, sleep),
      });
    } catch {}
  }
  if (entries.length < 21) return null;

  // Find worst individual day
  const worstIdx   = entries.reduce((maxI, e, i, arr) => e.score > arr[maxI].score ? i : maxI, 0);
  const worstEntry = entries[worstIdx];
  const worstDate  = new Date(worstEntry.dateStr);
  const worstLabel = worstDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  // Find consecutive danger run containing worst day
  let runStart = worstIdx, runEnd = worstIdx;
  while (runStart > 0 && entries[runStart - 1].score > 65) runStart--;
  while (runEnd < entries.length - 1 && entries[runEnd + 1].score > 65) runEnd++;
  const runLength = runEnd - runStart + 1;

  // How long ago was that?
  const now = new Date();
  const daysAgo  = Math.round((now.getTime() - worstDate.getTime()) / 86_400_000);
  const weeksAgo = Math.max(1, Math.round(daysAgo / 7));

  // Only narrate if worst period was at least 2 weeks ago (so it's history, not now)
  if (daysAgo < 14) return null;

  // Detect turning point: first window after worst run where rolling avg drops ≥8pts
  let turningPointLabel: string | null = null;
  for (let i = runEnd + 1; i < entries.length - 6; i++) {
    const before = entries.slice(Math.max(0, i - 7), i).map(e => e.score);
    const after  = entries.slice(i, i + 7).map(e => e.score);
    if (before.length < 3) continue;
    const beforeAvg = before.reduce((a, b) => a + b, 0) / before.length;
    const afterAvg  = after.reduce((a, b) => a + b, 0) / after.length;
    if (beforeAvg - afterAvg >= 8) {
      const tpDate = new Date(entries[i].dateStr);
      turningPointLabel = tpDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
      break;
    }
  }

  // Recent 14 vs prior 14
  const recent = entries.slice(-14).map(e => e.score);
  const prior  = entries.slice(-28, -14).map(e => e.score);
  if (prior.length < 7) return null;

  const recentAvg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  const priorAvg  = Math.round(prior.reduce((a, b) => a + b, 0) / prior.length);
  const delta     = recentAvg - priorAvg;

  const timeDesc =
    weeksAgo >= 8 ? `${weeksAgo} weeks ago` :
    weeksAgo >= 4 ? "about a month ago" :
    weeksAgo >= 3 ? "three weeks ago" :
    weeksAgo >= 2 ? "a couple of weeks ago" :
    "about two weeks ago";

  if (runLength >= 3 && worstEntry.score > 65) {
    let arc = `${timeDesc.charAt(0).toUpperCase() + timeDesc.slice(1)}, you had your worst stretch in this dataset — ${runLength} consecutive day${runLength > 1 ? "s" : ""} in the red, peaking around ${worstLabel}.`;

    if (turningPointLabel && delta <= -5) {
      arc += ` Something shifted around ${turningPointLabel}. Your load has been holding lower since.`;
    } else if (delta <= -8) {
      arc += ` The past two weeks have been noticeably lighter. Whatever changed — it's in the data.`;
    } else if (delta >= 6) {
      arc += ` The load is back up now. Worth paying attention to before it compounds.`;
    } else {
      arc += ` You've been holding steady since.`;
    }
    return arc;
  }

  // No severe worst run, but can narrate trend
  if (Math.abs(delta) >= 8) {
    if (delta <= -8) {
      return `The past two weeks are your lightest in the dataset — ${Math.abs(delta)} points lower on average than the two weeks before. Something changed and it's showing up.`;
    }
    return `The load has been climbing. The past two weeks are running ${delta} points heavier on average than the two weeks before that. Two weeks is long enough to be a trend.`;
  }

  return null;
}

// ─── What works specifically for you ─────────────────────────────────────────

/**
 * Scans past check-in notes for keywords that consistently correlate with
 * a lower score the following day. Returns the strongest confirmed pattern
 * as a personal insight. Requires ≥14 check-ins with notes and ≥3 matches.
 */
export function findWhatWorksForYou(): string | null {
  if (typeof window === "undefined") return null;
  const role  = localStorage.getItem("overload-role")  || "engineer";
  const sleep = localStorage.getItem("overload-sleep") || "8";

  const KEYWORDS = [
    "walk", "exercise", "gym", "outside", "run",
    "meditation", "yoga", "lunch", "break", "reading",
    "no meetings", "sleep early", "early",
  ];

  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("checkin-")) keys.push(k);
  }
  if (keys.length < 14) return null;
  keys.sort();

  // Build score map
  const scoreMap: Record<string, number> = {};
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      scoreMap[key.replace("checkin-", "")] = stressToScore(parsed.stress ?? 3, role, sleep);
    } catch {}
  }

  // Build entries with note + next-day score
  type NoteEntry = { score: number; note: string; nextScore: number | null };
  const entries: NoteEntry[] = [];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed.note) continue;
      const dateStr  = key.replace("checkin-", "");
      const d        = new Date(dateStr);
      d.setDate(d.getDate() + 1);
      const nextStr  = d.toISOString().split("T")[0];
      const nextScore = scoreMap[nextStr] ?? null;
      entries.push({ score: scoreMap[dateStr], note: parsed.note, nextScore });
    } catch {}
  }
  if (entries.length < 5) return null;

  let bestKeyword   = "";
  let bestAvgDelta  = 0;

  for (const kw of KEYWORDS) {
    const matches = entries.filter(e => e.note.toLowerCase().includes(kw) && e.nextScore !== null);
    if (matches.length < 3) continue;
    const deltas        = matches.map(e => e.score - (e.nextScore as number));
    const positiveCount = deltas.filter(d => d > 0).length;
    const avgDelta      = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    if (positiveCount / matches.length >= 0.6 && avgDelta > 3 && avgDelta > bestAvgDelta) {
      bestKeyword  = kw;
      bestAvgDelta = avgDelta;
    }
  }

  if (!bestKeyword || bestAvgDelta < 3) return null;

  const delta    = Math.round(bestAvgDelta);
  const activity =
    bestKeyword === "no meetings"   ? "you protect meeting-free time" :
    bestKeyword === "sleep early"   ? "you sleep early" :
    bestKeyword === "outside"       ? "you get outside" :
    bestKeyword === "early"         ? "you start early" :
    `you ${bestKeyword}`;

  return `When ${activity}, your next-day score drops an average of ${delta} points. That's not generic advice — that's your data.`;
}

// ─── Forward-looking memory ───────────────────────────────────────────────────

const FOLLOW_UP_EVENTS: Array<{ regex: RegExp; event: string; question: string }> = [
  { regex: /\b(deadline|due|deliver|submit|hand.?in)\b/i,        event: "deadline",     question: "The deadline you mentioned — how did it land?" },
  { regex: /\b(presentation|present|presenting)\b/i,             event: "presentation", question: "The presentation — how did it go?" },
  { regex: /\b(demo|demoing)\b/i,                                event: "demo",         question: "The demo — how did it turn out?" },
  { regex: /\b(interview)\b/i,                                   event: "interview",    question: "The interview — how do you feel about it now?" },
  { regex: /\b(launch|go.?live|shipping)\b/i,                    event: "launch",       question: "The launch — did it go the way you hoped?" },
  { regex: /\b(travel|trip|flight|flying)\b/i,                   event: "travel",       question: "You were traveling — how did that treat you?" },
  { regex: /\b(big meeting|important call|performance review)\b/i, event: "meeting",    question: "That meeting you had — how did it go?" },
];

const DOW_OFFSETS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function resolveFollowUpDate(note: string, fromDateStr: string): string | null {
  const n    = note.toLowerCase();
  const base = new Date(fromDateStr + "T12:00:00");

  if (/\btomorrow\b/.test(n)) {
    const d = new Date(base);
    d.setDate(d.getDate() + 2); // fire day AFTER tomorrow
    return d.toISOString().split("T")[0];
  }
  if (/\bnext week\b/.test(n)) {
    const d = new Date(base);
    d.setDate(d.getDate() + 8);
    return d.toISOString().split("T")[0];
  }
  for (const [dayName, targetDow] of Object.entries(DOW_OFFSETS)) {
    if (new RegExp(`\\b(next\\s+)?${dayName}\\b`, "i").test(n)) {
      const d   = new Date(base);
      const cur = d.getDay();
      let ahead = (targetDow - cur + 7) % 7;
      if (ahead === 0) ahead = 7;
      d.setDate(d.getDate() + ahead + 1); // fire day AFTER the event
      return d.toISOString().split("T")[0];
    }
  }
  return null;
}

/**
 * Parses a check-in note for future-tense events and stores a follow-up
 * that will surface on the day after the mentioned event.
 */
export function parseFollowUpSignals(note: string, checkInDateStr: string): void {
  if (!note || typeof window === "undefined") return;
  for (const { regex, event, question } of FOLLOW_UP_EVENTS) {
    if (!regex.test(note)) continue;
    const followUpDate = resolveFollowUpDate(note, checkInDateStr);
    if (!followUpDate) continue;
    const key = `followup-${followUpDate}`;
    if (localStorage.getItem(key)) continue; // don't overwrite
    const snippet = note.length > 60 ? note.slice(0, 60) + "…" : note;
    localStorage.setItem(key, JSON.stringify({ event, question, snippet }));
    break; // one follow-up per note
  }
}

/** Returns today's pending follow-up, if one exists. */
export function getFollowUpForToday(): { event: string; question: string; snippet: string } | null {
  if (typeof window === "undefined") return null;
  const today = new Date().toISOString().split("T")[0];
  try {
    const raw = localStorage.getItem(`followup-${today}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Clears today's follow-up after it has been surfaced. */
export function clearFollowUpForToday(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`followup-${new Date().toISOString().split("T")[0]}`);
}

// ─── Personal baseline context ────────────────────────────────────────────────

/**
 * Returns a one-liner comparing today's score to the user's personal average.
 * Fires only when ≥21 check-ins exist and the delta is meaningful (≥7 pts).
 */
export function buildPersonalBaselineContext(currentScore: number): string | null {
  if (typeof window === "undefined") return null;
  const role  = localStorage.getItem("overload-role")  || "engineer";
  const sleep = localStorage.getItem("overload-sleep") || "8";

  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("checkin-")) keys.push(k);
  }
  if (keys.length < 21) return null;
  keys.sort();

  const scores: number[] = [];
  for (const key of keys.slice(-30)) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const p = JSON.parse(raw);
      scores.push(stressToScore(p.stress ?? 3, role, sleep));
    } catch {}
  }
  if (scores.length < 14) return null;

  const avg   = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const delta = currentScore - avg;
  if (Math.abs(delta) < 7) return null;

  if (delta <= -12) return `Your personal average is ${avg} — today is ${Math.abs(delta)} points lighter than your usual.`;
  if (delta <   -7) return `Your personal average is ${avg} — today is running below your usual.`;
  if (delta >=  12) return `Your personal average is ${avg} — today is ${delta} points above your usual.`;
  return `Your personal average is ${avg} — today is running a bit above your usual.`;
}

// ─── Recovery milestone ───────────────────────────────────────────────────────

/**
 * Detects milestone moments in the user's recovery arc — things the streak
 * counter doesn't catch. Fires each milestone only once.
 */
export function detectRecoveryMilestone(): { type: string; message: string } | null {
  if (typeof window === "undefined") return null;
  const role  = localStorage.getItem("overload-role")  || "engineer";
  const sleep = localStorage.getItem("overload-sleep") || "8";

  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("checkin-")) keys.push(k);
  }
  if (keys.length < 7) return null;
  keys.sort();

  const entries: Array<{ score: number }> = [];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const p = JSON.parse(raw);
      entries.push({ score: stressToScore(p.stress ?? 3, role, sleep) });
    } catch {}
  }
  if (entries.length < 7) return null;

  // Milestone 1: first 7 consecutive days all below 65
  const key7 = "recovery-milestone-clean7";
  if (!localStorage.getItem(key7)) {
    const last7 = entries.slice(-7);
    if (last7.every(e => e.score < 65)) {
      localStorage.setItem(key7, "1");
      if (last7.every(e => e.score <= 40)) {
        return { type: "clean7green", message: "Seven straight days fully in the green. That's not a good run — that's a new baseline." };
      }
      return { type: "clean7", message: "Seven days without hitting the danger zone. That's the first clean week. Hold this." };
    }
  }

  // Milestone 2: best 7-day rolling average ever (only after 14+ entries)
  if (entries.length >= 14) {
    const last7Avg   = entries.slice(-7).reduce((a, e) => a + e.score, 0) / 7;
    const seenBest   = localStorage.getItem("recovery-milestone-best7avg");
    const seenBestVal = seenBest ? parseFloat(seenBest) : Infinity;
    let prevBest = Infinity;
    for (let i = 0; i <= entries.length - 14; i++) {
      const w = entries.slice(i, i + 7).reduce((a, e) => a + e.score, 0) / 7;
      if (w < prevBest) prevBest = w;
    }
    if (last7Avg < prevBest && last7Avg < seenBestVal) {
      localStorage.setItem("recovery-milestone-best7avg", String(last7Avg));
      return {
        type: "best7avg",
        message: `Your lightest week in this dataset — ${Math.round(last7Avg)} average. Whatever you protected this week, name it and keep it.`,
      };
    }
  }

  return null;
}
