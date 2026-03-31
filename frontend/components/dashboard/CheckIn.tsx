"use client";

import { useState, useEffect } from "react";
import {
  stressToScore,
  parseFollowUpSignals,
  getFollowUpForToday,
  clearFollowUpForToday,
} from "@/app/dashboard/data";
import { useAuth } from "@/contexts/AuthContext";
import { getTodayString } from "@/lib/date";
import { safeParseJson, safeStorageGet } from "@/lib/storage";
import type { CheckIn, UpsertCheckInResult } from "@/lib/types";

const stressLevels = [
  { value: 1, label: "Very calm",   level: "ok"      },
  { value: 2, label: "Relaxed",     level: "ok"      },
  { value: 3, label: "Moderate",    level: "warning"  },
  { value: 4, label: "Stressed",    level: "warning"  },
  { value: 5, label: "Overwhelmed", level: "danger"   },
];

interface Props {
  checkins: CheckIn[];
  streakFromApi: number;
  onComplete?: (result: UpsertCheckInResult) => void;
}

/** How many consecutive past days (not including today) had score > 65 */
function getConsecutiveHighStress(checkins: CheckIn[]): number {
  let count = 0;
  const now = new Date();
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = getTodayString(d);
    const ci = checkins.find(c => c.checked_in_date === dateStr);
    if (!ci) break;
    if (ci.score > 65) count++;
    else break;
  }
  return count;
}

/**
 * Scans past check-ins (14–90 days ago) for a similar note or stress context.
 * Returns a recall line when a meaningful match is found.
 */
function findEchoPattern(note: string, stress: number): string | null {
  if (!note && stress < 4) return null;

  const STOPWORDS = new Set([
    "the","a","an","and","or","but","in","on","at","to","for","of","was","is","are",
    "been","have","had","did","do","i","my","me","it","with","this","that","so","got",
    "just","all","too","very","really","day","today","week","been","feel","feels",
  ]);

  function extractKeywords(text: string): string[] {
    return text.toLowerCase().split(/\W+/).filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  }

  const currentKws = new Set(extractKeywords(note));
  const now = new Date();
  let bestMatch: { dateLabel: string; snippet: string; overlap: number } | null = null;

  for (let i = 14; i <= 90; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `checkin-${d.toISOString().split("T")[0]}`;
    const raw = safeStorageGet(localStorage, key);
    if (!raw) continue;
    const parsed = safeParseJson<{ note?: string; stress?: number }>(raw, {});
    if (!parsed.note) continue;
    const pastStress: number = parsed.stress ?? 0;
    const pastKws = extractKeywords(parsed.note);
    const overlap = pastKws.filter((w) => currentKws.has(w)).length;

    const isMatch =
      (currentKws.size >= 2 && overlap >= 2) ||
      (stress >= 4 && pastStress >= 4 && parsed.note.length > 10 && overlap >= 1);
    if (!isMatch) continue;

    if (!bestMatch || overlap > bestMatch.overlap) {
      const dateLabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
      const snippet   = parsed.note.length > 50 ? parsed.note.slice(0, 50) + "…" : parsed.note;
      bestMatch = { dateLabel, snippet, overlap };
    }
  }

  if (!bestMatch) return null;
  return `The app remembered something — ${bestMatch.dateLabel}: "${bestMatch.snippet}"`;
}

/**
 * When the user selects a stress level, look for a past note from a
 * similar state (7+ days ago) to surface as a memory prompt.
 */
function getComparableNote(stress: number): { dateLabel: string; note: string } | null {
  if (stress < 3) return null;
  const now = new Date();

  for (let i = 7; i <= 60; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `checkin-${d.toISOString().split("T")[0]}`;
    const raw = safeStorageGet(localStorage, key);
    if (!raw) continue;
    const parsed = safeParseJson<{ note?: string; stress?: number }>(raw, {});
    if (!parsed.note || typeof parsed.stress !== "number") continue;
    if (Math.abs(parsed.stress - stress) <= 1 && parsed.note.trim().length > 5) {
      const dateLabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
      const note = parsed.note.length > 55 ? parsed.note.slice(0, 55) + "…" : parsed.note;
      return { dateLabel, note };
    }
  }
  return null;
}

/**
 * Reads yesterday's check-in note and stress and returns a dynamic
 * question + optional context line to show above the stress buttons.
 */
function getYesterdayContext(): { question: string; context: string | null } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const key = `checkin-${getTodayString(yesterday)}`;
  const raw = safeStorageGet(localStorage, key);
  if (!raw) return { question: "How are you carrying it today?", context: null };

  const parsed = safeParseJson<{ note?: string; stress?: number }>(raw, {});
  const note: string = parsed.note || "";
  const stress: number = parsed.stress ?? 0;
  const n = note.toLowerCase();

  if (/deadline|deliver|launch|submit|due/.test(n)) {
    const snippet = note.length > 40 ? note.slice(0, 40) + "…" : note;
    return {
      question: "How did it go?",
      context: `Yesterday: "${snippet}"`,
    };
  }
  if (/meeting|call|sync|standup|review|presentation|demo/.test(n)) {
    return { question: "How are you coming out of it?", context: null };
  }
  if (/sleep|tired|exhausted|rest|insomnia/.test(n)) {
    return { question: "Did you manage to rest?", context: null };
  }
  if (stress >= 5) {
    return { question: "Still in it, or is today different?", context: null };
  }
  if (stress >= 4) {
    return { question: "How does today feel compared to yesterday?", context: null };
  }

  return { question: "How are you carrying it today?", context: null };
}


/** The note label question that responds to the selected stress level. */
function getFollowUpQuestion(stress: number | null): string {
  switch (stress) {
    case 5: return "How long has it been building?";
    case 4: return "What's driving it today?";
    case 3: return "What's making it feel moderate?";
    case 2: return "What's keeping you steady?";
    case 1: return "What made today work?";
    default: return "Anything behind it?";
  }
}

/** Textarea placeholder that matches the stress level selected. */
function getNotePlaceholder(stress: number | null): string {
  switch (stress) {
    case 5: return "e.g. Third day of back-to-back pressure, deadline on Friday…";
    case 4: return "e.g. Two heavy calls + a deadline I'm nervous about…";
    case 3: return "e.g. A lot in motion but nothing overwhelming yet…";
    case 2: return "e.g. Lighter calendar, clear head this morning…";
    case 1: return "e.g. Good sleep, protected morning, nothing urgent…";
    default: return "e.g. Big deadline tomorrow, didn't sleep well…";
  }
}

/**
 * Searches past check-ins (7–90 days ago) for a similar stress level
 * and returns what happened the next day — closing the loop on advice.
 */
function findPreviousOutcome(
  stress: number,
  role: string,
  sleepBaseline: string,
): string | null {
  const now = new Date();
  for (let i = 7; i <= 90; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `checkin-${d.toISOString().split("T")[0]}`;
    const raw = safeStorageGet(localStorage, key);
    if (!raw) continue;
    const parsed = safeParseJson<{ stress?: number }>(raw, {});
    if (typeof parsed.stress !== "number") continue;
    if (Math.abs(parsed.stress - stress) > 1) continue;

    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextRaw = safeStorageGet(localStorage, `checkin-${getTodayString(nextDay)}`);
    if (!nextRaw) continue;

    const nextParsed = safeParseJson<{ stress?: number }>(nextRaw, {});
    const thisScore  = stressToScore(parsed.stress, role, sleepBaseline);
    const nextScore  = stressToScore(nextParsed.stress ?? 3, role, sleepBaseline);
    const delta      = thisScore - nextScore;

    const dateLabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });

    if (delta >= 12) {
      return `Last time you were here (${dateLabel}), your score dropped ${delta} points the next day. You know what to do.`;
    }
    if (delta <= -12) {
      return `Last time you were at this level (${dateLabel}), it climbed the next day. Tonight matters.`;
    }
  }
  return null;
}

/** Role-aware sentence appended to the personalized response at elevated stress. */
function getRoleContext(stress: number, role: string): string {
  if (stress < 4) return "";
  if (role === "founder")
    return " Founders carry ambient pressure that doesn't clock out. The physical basics matter more for you, not less.";
  if (role === "manager")
    return " Managing people adds invisible overhead. You can't lead well from an empty tank.";
  if (role === "engineer" && stress >= 5)
    return " Deep work and high stress don't mix — your best thinking requires recovery first.";
  if (role === "pm" && stress >= 4)
    return " Coordination load adds up in ways that don't show on a calendar. Protect the transitions.";
  return "";
}


function getPersonalizedResponse(
  stress: number,
  priorHighDays: number,
  streak: number,
  role: string = "engineer",
  isFirst: boolean = false,
): string {
  // First-ever check-in: use onboarding role to personalize from the very start
  if (isFirst) {
    const roleLabel =
      role === "founder" ? "founder" :
      role === "manager" ? "manager" :
      role === "engineer" ? "engineer" :
      role === "pm" ? "PM" : null;

    if (stress >= 5) {
      return roleLabel
        ? `Overwhelm on day one as a ${roleLabel}. That's a real starting point — let's see what's driving it. Come back tomorrow.`
        : "Overwhelm on your first check-in. That's data. Come back tomorrow and we'll see if it holds.";
    }
    if (stress === 4) {
      const roleCtx =
        role === "founder" ? "Founders carry ambient pressure that doesn't clock out." :
        role === "manager" ? "Managers absorb invisible overhead that doesn't show on anyone's calendar." :
        role === "engineer" ? "Engineers often carry more context-switching burden than shows up in meetings." : "";
      return `Elevated on day one${roleLabel ? ` as a ${roleLabel}` : ""}. ${roleCtx} Let's track whether this is your baseline or a hard week.`;
    }
    if (stress === 3) {
      return "A moderate start. Good baseline to work from. Come back tomorrow — two data points is where it starts to mean something.";
    }
    return "A calm first check-in. Let's see if this is your baseline. Come back tomorrow.";
  }
  const totalHighDays = priorHighDays + 1;
  let base = "";

  if (stress >= 5) {
    if (priorHighDays >= 3)
      // Witness — no directive for 4th+ consecutive overwhelm day
      base = `${totalHighDays} days in. That's not a rough patch — that's sustained. I see it.`;
    else if (priorHighDays === 2)
      base = "Third consecutive high day. Your body is absorbing debt your mind is ignoring. Tonight: laptop closed by 9, no screens after 10. Sleep is the only thing that helps now.";
    else if (priorHighDays === 1)
      base = "Back-to-back overwhelm. Your nervous system tracks consecutive strain even when you don't notice it. Protect tonight's sleep — that's your fastest recovery lever.";
    else
      base = "A hard day. Before you close the laptop, remove one thing from tomorrow's list. Then step away — the work will still be there.";
  } else if (stress === 4) {
    if (priorHighDays >= 2)
      base = `${totalHighDays} elevated days in a row. The pressure is compounding. One thing needs to give this week — a meeting converted to async, a deadline pushed, something.`;
    else if (priorHighDays === 1)
      base = "Two elevated days. Your system is tracking this. A 10-minute walk before dinner and 8 hours of sleep tonight will measurably change tomorrow's score.";
    else
      base = "Elevated today. A walk before dinner will do more than another hour at your desk tonight.";
  } else if (stress === 3) {
    if (priorHighDays >= 1)
      base = "Better than yesterday. Moderate is recoverable. Protect one uninterrupted focus block this afternoon and don't start anything new after 6 PM.";
    else
      base = "Moderate — you're in manageable territory. Protect one 90-minute block and get to bed at a reasonable time.";
  } else {
    // stress 1 or 2 — calm/relaxed
    if (streak >= 14)
      base = `${streak} days straight. That's not a streak — that's a practice. You've given the app enough real data to actually know you. Keep protecting what's working.`;
    else if (streak >= 7)
      base = `Seven days in a row — and a calm one. The habit is real now. Your score is more accurate today than it's ever been. Keep going.`;
    else if (priorHighDays >= 2)
      base = `Better. After a run of hard days, a calm one matters more than it looks. Your nervous system is starting to recover. Protect tonight — don't let the relief become an excuse to push.`;
    else if (streak >= 3)
      base = `A calm day and ${streak} days checked in straight. The habit is forming. Keep protecting what made today easy.`;
    else
      base = "A genuinely calm day. Notice what made it work — protect that tonight, and do it again.";
  }

  return base + getRoleContext(stress, role);
}

export default function CheckIn({
  checkins,
  streakFromApi,
  onComplete,
}: Props) {
  const { api } = useAuth();

  const today = getTodayString();
  const todayCheckin = checkins.find(c => c.checked_in_date === today);

  const [stress, setStress]                   = useState<number | null>(null);
  const [note, setNote]                       = useState("");
  const [submitted, setSubmitted]             = useState(false);
  const [submitting, setSubmitting]           = useState(false);
  const [submittedStress, setSubmittedStress] = useState<number | null>(todayCheckin?.stress ?? null);
  const [updating, setUpdating]               = useState(false);
  const [response, setResponse]               = useState("");
  const [yesterdayCtx, setYesterdayCtx]       = useState<{ question: string; context: string | null }>({ question: "How are you carrying it today?", context: null });
  const [memoryNote, setMemoryNote]           = useState<{ dateLabel: string; note: string } | null>(null);
  const [echoPattern, setEchoPattern]         = useState<string | null>(null);
  const [previousOutcome, setPreviousOutcome] = useState<string | null>(null);
  const [submittedNote, setSubmittedNote]     = useState(false);
  const [role, setRole]                       = useState("engineer");
  const [sleepBaseline, setSleepBaseline]     = useState("8");
  const [followUp, setFollowUp]               = useState<{ event: string; question: string; snippet: string } | null>(null);
  const [submitError, setSubmitError]         = useState("");

  // Mark as submitted on mount if today's check-in already exists in the API data
  useEffect(() => {
    if (todayCheckin) setSubmitted(true);
  }, [todayCheckin?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const savedRole  = safeStorageGet(localStorage, "overload-role")  || "engineer";
    const savedSleep = safeStorageGet(localStorage, "overload-sleep") || "8";
    setRole(savedRole);
    setSleepBaseline(savedSleep);

    setFollowUp(getFollowUpForToday());
    setYesterdayCtx(getYesterdayContext());
  }, []);

  function handleStressSelect(value: number) {
    setStress(value);
    setMemoryNote(getComparableNote(value));
  }

  async function handleSubmit() {
    if (!stress) return;
    const priorHigh    = getConsecutiveHighStress(checkins);
    const streak       = streakFromApi;
    const isFirst      = checkins.length === 0;
    const todayDateStr = getTodayString();
    setSubmitError("");

    // Parse note for future events and clear any surfaced follow-up (kept for local UX)
    if (note.trim()) parseFollowUpSignals(note, todayDateStr);
    if (followUp) clearFollowUpForToday();

    // Find echo pattern if user wrote a note
    if (note.trim()) {
      setEchoPattern(findEchoPattern(note, stress));
    }

    // The "beat" — a pause before the response appears
    setUpdating(true);
    setSubmitting(true);

    try {
      const result = await api.post<UpsertCheckInResult>("/api/checkins", {
        stress,
        note: note.trim() || "",
      });
      setSubmittedStress(stress);
      setSubmittedNote(!!note.trim());
      setResponse(getPersonalizedResponse(stress, priorHigh, streak, role, isFirst));
      setPreviousOutcome(findPreviousOutcome(stress, role, sleepBaseline));
      onComplete?.(result);
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not save your check-in.");
    } finally {
      setUpdating(false);
      setSubmitting(false);
    }
  }

  // Submitted state
  if (submitted && submittedStress) {
    const level = stressLevels.find((s) => s.value === submittedStress);
    return (
      <div className="dash-card checkin checkin--done checkin--responded">
        <div className="checkin-response-header">
          <div className="checkin-done-icon">✓</div>
          <div>
            <div className="checkin-done-text">{level?.label} — logged</div>
            <div className="checkin-done-sub">Factored into your score</div>
          </div>
        </div>
        {response && (
          <p className="checkin-response-text">{response}</p>
        )}
        {echoPattern && (
          <p className="checkin-echo">{echoPattern}</p>
        )}
        {previousOutcome && (
          <p className="checkin-previous-outcome">{previousOutcome}</p>
        )}
        {submittedNote && (
          <div className="checkin-note-logged">Note captured — the app read it.</div>
        )}
      </div>
    );
  }

  return (
    <div className="dash-card checkin" aria-labelledby="checkin-title">
      {followUp ? (
        <div className="checkin-followup">
          <div className="checkin-followup-question">{followUp.question}</div>
          <p className="checkin-followup-ref">You wrote: &ldquo;{followUp.snippet}&rdquo;</p>
        </div>
      ) : (
        <>
          {yesterdayCtx.context && (
            <p className="checkin-yesterday-ref">{yesterdayCtx.context}</p>
          )}
          <div id="checkin-title" className="checkin-question">{yesterdayCtx.question}</div>
        </>
      )}

      <div className="checkin-stress">
        {stressLevels.map((s) => (
          <button
            key={s.value}
            className={`checkin-stress-btn checkin-stress-btn--${s.level}${
              stress === s.value ? " checkin-stress-btn--active" : ""
            }`}
            onClick={() => handleStressSelect(s.value)}
            aria-pressed={stress === s.value}
            aria-label={s.label}
          >
            <span className="checkin-stress-num">{s.value}</span>
            <span className="checkin-stress-label">{s.label}</span>
          </button>
        ))}
      </div>

      {memoryNote && !note && (
        <div className="checkin-memory-note">
          <span className="checkin-memory-date">{memoryNote.dateLabel}:</span>{" "}
          <span className="checkin-memory-text">"{memoryNote.note}"</span>
        </div>
      )}

      <div className="checkin-note-wrap">
        <label className="checkin-note-label">
          {stress ? getFollowUpQuestion(stress) : "Anything behind it?"}
        </label>
        <textarea
          className="checkin-textarea"
          placeholder={getNotePlaceholder(stress)}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
        <p className="checkin-note-hint">The more specific, the smarter the app gets.</p>
      </div>

      {submitError && <div className="auth-error" role="alert">{submitError}</div>}

      <button
        className={`checkin-submit${updating ? " checkin-submit--updating" : ""}`}
        disabled={!stress || updating || submitting}
        onClick={handleSubmit}
      >
        {updating ? "Noted…" : "Log check-in"}
      </button>
    </div>
  );
}
