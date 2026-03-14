export const mockUser = {
  name: "Alex",
  initials: "A",
  streak: 12,
};

export type SignalLevel = "ok" | "warning" | "danger";

export const today = {
  score: 74,
  date: "Thursday, March 13",
  statusLabel: "High strain",
  level: "danger" as SignalLevel,
  signals: [
    {
      label: "Sleep deficit",
      detail: "5h 20m last night — 2h 40m below your baseline",
      val: "−2h 40m",
      level: "danger" as SignalLevel,
    },
    {
      label: "Calendar density",
      detail: "7 meetings today, no deep work blocks",
      val: "Overloaded",
      level: "warning" as SignalLevel,
    },
    {
      label: "Stress (check-in)",
      detail: "Elevated 3 days in a row",
      val: "High",
      level: "warning" as SignalLevel,
    },
    {
      label: "Exercise",
      detail: "Skipped the last 3 days",
      val: "None",
      level: "danger" as SignalLevel,
    },
  ],
  suggestion:
    "Block tomorrow 9–11am for deep work. Move the 4pm sync to an async Loom. Aim for 8h of sleep tonight — it's your biggest lever right now.",
};

export type ForecastDay = {
  day: string;
  date: string;
  score: number;
  level: SignalLevel;
};

export const forecast: ForecastDay[] = [
  { day: "Thu", date: "Today", score: 74, level: "danger" },
  { day: "Fri", date: "Mar 14", score: 68, level: "danger" },
  { day: "Sat", date: "Mar 15", score: 52, level: "warning" },
  { day: "Sun", date: "Mar 16", score: 35, level: "ok" },
  { day: "Mon", date: "Mar 17", score: 47, level: "warning" },
  { day: "Tue", date: "Mar 18", score: 42, level: "warning" },
  { day: "Wed", date: "Mar 19", score: 33, level: "ok" },
];

export type HistoryDay = { date: string; score: number };

export const history: HistoryDay[] = [
  { date: "Feb 12", score: 58 },
  { date: "Feb 13", score: 52 },
  { date: "Feb 14", score: 61 },
  { date: "Feb 15", score: 67 },
  { date: "Feb 16", score: 71 },
  { date: "Feb 17", score: 45 },
  { date: "Feb 18", score: 38 },
  { date: "Feb 19", score: 55 },
  { date: "Feb 20", score: 63 },
  { date: "Feb 21", score: 69 },
  { date: "Feb 22", score: 72 },
  { date: "Feb 23", score: 65 },
  { date: "Feb 24", score: 48 },
  { date: "Feb 25", score: 41 },
  { date: "Feb 26", score: 57 },
  { date: "Feb 27", score: 62 },
  { date: "Feb 28", score: 55 },
  { date: "Mar 1", score: 48 },
  { date: "Mar 2", score: 60 },
  { date: "Mar 3", score: 36 },
  { date: "Mar 4", score: 30 },
  { date: "Mar 5", score: 52 },
  { date: "Mar 6", score: 63 },
  { date: "Mar 7", score: 58 },
  { date: "Mar 8", score: 66 },
  { date: "Mar 9", score: 71 },
  { date: "Mar 10", score: 42 },
  { date: "Mar 11", score: 38 },
  { date: "Mar 12", score: 67 },
  { date: "Mar 13", score: 74 },
];

export type CheckInEntry = {
  date: string;
  stress: number;
  stressLabel: string;
  note?: string;
  score: number;
};

export const mockCheckIns: CheckInEntry[] = [
  { date: "Mar 13", stress: 4, stressLabel: "Stressed",    note: "Big deadline + barely slept",                    score: 74 },
  { date: "Mar 12", stress: 4, stressLabel: "Stressed",    note: "Catching up after a rough week",                 score: 67 },
  { date: "Mar 11", stress: 2, stressLabel: "Relaxed",     note: "Finally a calmer day",                           score: 38 },
  { date: "Mar 10", stress: 3, stressLabel: "Moderate",                                                            score: 42 },
  { date: "Mar 9",  stress: 5, stressLabel: "Overwhelmed", note: "Too many meetings, zero deep work",              score: 71 },
  { date: "Mar 8",  stress: 4, stressLabel: "Stressed",    note: "Back-to-back calls all day",                     score: 66 },
  { date: "Mar 7",  stress: 3, stressLabel: "Moderate",    note: "Got some focus time in the morning",             score: 58 },
  { date: "Mar 6",  stress: 3, stressLabel: "Moderate",                                                            score: 63 },
  { date: "Mar 5",  stress: 3, stressLabel: "Moderate",                                                            score: 52 },
  { date: "Mar 3",  stress: 1, stressLabel: "Very calm",   note: "Good weekend recovery",                          score: 36 },
  { date: "Mar 2",  stress: 3, stressLabel: "Moderate",                                                            score: 60 },
  { date: "Feb 28", stress: 3, stressLabel: "Moderate",    note: "Month-end reporting pressure",                   score: 55 },
  { date: "Feb 27", stress: 3, stressLabel: "Moderate",                                                            score: 62 },
  { date: "Feb 25", stress: 2, stressLabel: "Relaxed",     note: "Lighter week, good recovery",                    score: 41 },
  { date: "Feb 22", stress: 5, stressLabel: "Overwhelmed", note: "Q1 planning + too many context switches",        score: 72 },
];

// ─── Analytics (computed from history) ───────────────────────────────────────

/** Score change vs 7 days ago */
export const trendDelta = today.score - history[history.length - 8].score; // +11

/** How many consecutive days the score has been in the danger zone */
export const consecutiveDangerDays = (() => {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].score > 65) n++;
    else break;
  }
  return n;
})(); // 2

/** Specific, ordered recovery actions for the current high-strain period */
export const recoveryPlan = [
  {
    timing: "Tonight",
    actions: [
      "Hard-stop work at 7 PM. Close the laptop, no exceptions.",
      "Set a 10 PM sleep alarm — aim for 8 hours minimum.",
      "No screens in the last 30 minutes before bed.",
    ],
  },
  {
    timing: "Tomorrow",
    actions: [
      "Block 9–11 AM as a no-meeting deep-work window before your calendar fills.",
      "Convert your 4 PM sync to an async Loom or a written update.",
      "Take a 20-minute walk at lunch — leave your phone at your desk.",
    ],
  },
  {
    timing: "This week",
    actions: [
      "Keep meetings under 4 per day through Friday.",
      "Protect at least one evening this week from any work.",
    ],
  },
];

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
}: {
  todayStress: number | null;
  role: string;
  sleepBaseline: string;
  recentStresses: number[];
  estimatedScore: number | null;
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

  return Math.max(8, Math.min(92, Math.round(score)));
}

/** Builds live signal rows from the user's real profile + today's check-in. */
export function getLiveSignals(
  todayStress: number | null,
  role: string,
  sleepBaseline: string,
): Signal[] {
  const results: Signal[] = [];

  // Sleep signal
  const hoursMap: Record<string, number> = { "6": 6, "7": 7, "8": 8, "9": 9 };
  const hours = hoursMap[sleepBaseline] ?? 8;
  results.push({
    label: "Sleep baseline",
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
    if (s) results.push({ label: "Stress (today)", ...s });
  } else {
    results.push({
      label: "Stress (check-in)",
      detail: "Check in below to factor today's stress into your score",
      val: "Pending",
      level: "warning",
    });
  }

  // Role load signal
  const roleSignals: Record<string, { detail: string; val: string; level: SignalLevel }> = {
    founder:  { detail: "Executive role adds significant ambient pressure",      val: "Very high",    level: "danger" },
    manager:  { detail: "Context-switching and people load increase overhead",   val: "Elevated",     level: "warning" },
    pm:       { detail: "Coordination overhead elevates your baseline",          val: "Moderate+",    level: "warning" },
    engineer: { detail: "Deep work role — protecting focus blocks is key",       val: "Baseline",     level: "ok" },
    designer: { detail: "Creative role — lower ambient pressure baseline",       val: "Low baseline", level: "ok" },
    other:    { detail: "Your role contributes to your baseline load",           val: "Baseline",     level: "ok" },
  };
  const rs = roleSignals[role];
  if (rs) results.push({ label: "Role load", ...rs });

  return results;
}

/** Returns a personalised suggestion based on the live score + check-in state. */
export function getLiveSuggestion(score: number, hasCheckedIn: boolean): string {
  if (!hasCheckedIn) {
    return "Complete your daily check-in below to get a personalised recommendation based on how you're actually feeling today.";
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
    return "You're running sustainably. Build the habit here — consistent sleep and protected focus time will keep you in this zone.";
  }
  return "You're in your zone. Your cognitive capacity is at its best today. Do the deep work that matters, and protect tonight's sleep to carry this forward.";
}
