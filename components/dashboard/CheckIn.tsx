"use client";

import { useState, useEffect } from "react";

const stressLevels = [
  { value: 1, label: "Very calm",   level: "ok"      },
  { value: 2, label: "Relaxed",     level: "ok"      },
  { value: 3, label: "Moderate",    level: "warning"  },
  { value: 4, label: "Stressed",    level: "warning"  },
  { value: 5, label: "Overwhelmed", level: "danger"   },
];

function todayKey() {
  return `checkin-${new Date().toISOString().split("T")[0]}`;
}

/** How many consecutive past days (not including today) had stress ≥ 4 */
function getConsecutiveHighStress(): number {
  let count = 0;
  const now = new Date();
  for (let i = 1; i <= 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const raw = localStorage.getItem(`checkin-${d.toISOString().split("T")[0]}`);
    if (!raw) break;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.stress >= 4) count++;
      else break;
    } catch { break; }
  }
  return count;
}

/**
 * Reads past check-ins for the same day of week and returns a short
 * context line if there's a clear pattern (≥2 data points).
 */
function getDayPatternHint(): string | null {
  const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const now = new Date();
  const todayDow = now.getDay();
  const dayName  = DAY_NAMES[todayDow];
  const stresses: number[] = [];

  for (let week = 1; week <= 6; week++) {
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

  if (avg >= 4.2) return `Your ${dayName}s have been consistently hard. Take that into account.`;
  if (avg >= 3.6) return `${dayName}s tend to run heavier for you. Head's up.`;
  if (avg <= 1.8) return `${dayName}s are usually good to you. Let's see if that holds.`;
  if (avg <= 2.4) return `${dayName}s tend to be easy. Let's keep it that way.`;
  return null;
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
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
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
    } catch {}
  }

  if (!bestMatch) return null;
  return `This looks like ${bestMatch.dateLabel} — you noted: "${bestMatch.snippet}"`;
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
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.note || typeof parsed.stress !== "number") continue;
      // Match: same or adjacent stress level AND has a note
      if (Math.abs(parsed.stress - stress) <= 1 && parsed.note.trim().length > 5) {
        const dateLabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
        const note = parsed.note.length > 55 ? parsed.note.slice(0, 55) + "…" : parsed.note;
        return { dateLabel, note };
      }
    } catch {}
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
  const key = `checkin-${yesterday.toISOString().split("T")[0]}`;
  const raw = localStorage.getItem(key);
  if (!raw) return { question: "How are you carrying it today?", context: null };

  try {
    const parsed = JSON.parse(raw);
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
  } catch {}

  return { question: "How are you carrying it today?", context: null };
}

/** Check-in streak — consecutive days with any check-in, including today */
function getStreak(): number {
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

function getPersonalizedResponse(
  stress: number,
  priorHighDays: number,
  streak: number,
): string {
  const totalHighDays = priorHighDays + 1;

  if (stress >= 5) {
    if (priorHighDays >= 3)
      return `${totalHighDays} days running at overwhelm. This isn't sustainable — something needs to come off your plate today, not tomorrow. Pick one thing and move it.`;
    if (priorHighDays === 2)
      return "Third consecutive high day. Your body is absorbing debt your mind is ignoring. Tonight: laptop closed by 9, no screens after 10. Sleep is the only thing that helps now.";
    if (priorHighDays === 1)
      return "Back-to-back overwhelm. Your nervous system tracks consecutive strain even when you don't notice it. Protect tonight's sleep — that's your fastest recovery lever.";
    return "A hard day. Before you close the laptop, remove one thing from tomorrow's list. Then step away — the work will still be there.";
  }

  if (stress === 4) {
    if (priorHighDays >= 2)
      return `${totalHighDays} elevated days in a row. The pressure is compounding. One thing needs to give this week — a meeting converted to async, a deadline pushed, something.`;
    if (priorHighDays === 1)
      return "Two elevated days. Your system is tracking this. A 10-minute walk before dinner and 8 hours of sleep tonight will measurably change tomorrow's score.";
    return "Elevated today. A walk before dinner will do more than another hour at your desk tonight.";
  }

  if (stress === 3) {
    if (priorHighDays >= 1)
      return "Better than yesterday. Moderate is recoverable. Protect one uninterrupted focus block this afternoon and don't start anything new after 6 PM.";
    return "Moderate — you're in manageable territory. Protect one 90-minute block and get to bed at a reasonable time.";
  }

  // stress 1 or 2 — calm/relaxed
  if (streak >= 14)
    return `${streak} days straight. That's not a streak — that's a practice. You've given the app enough real data to actually know you. Keep protecting what's working.`;
  if (streak >= 7)
    return `Seven days in a row — and a calm one. The habit is real now. Your score is more accurate today than it's ever been. Keep going.`;
  if (priorHighDays >= 2)
    return `Better. After a run of hard days, a calm one matters more than it looks. Your nervous system is starting to recover. Protect tonight — don't let the relief become an excuse to push.`;
  if (streak >= 3)
    return `A calm day and ${streak} days checked in straight. The habit is forming. Keep protecting what made today easy.`;
  return "A genuinely calm day. Notice what made it work — protect that tonight, and do it again.";
}

export default function CheckIn({
  onCheckin,
}: {
  onCheckin?: (stress: number) => void;
}) {
  const [stress, setStress]                   = useState<number | null>(null);
  const [note, setNote]                       = useState("");
  const [submitted, setSubmitted]             = useState(false);
  const [submittedStress, setSubmittedStress] = useState<number | null>(null);
  const [updating, setUpdating]               = useState(false);
  const [response, setResponse]               = useState("");
  const [dayHint, setDayHint]                 = useState<string | null>(null);
  const [yesterdayCtx, setYesterdayCtx]       = useState<{ question: string; context: string | null }>({ question: "How are you carrying it today?", context: null });
  const [memoryNote, setMemoryNote]           = useState<{ dateLabel: string; note: string } | null>(null);
  const [echoPattern, setEchoPattern]         = useState<string | null>(null);

  useEffect(() => {
    setYesterdayCtx(getYesterdayContext());
    setDayHint(getDayPatternHint());
    const saved = localStorage.getItem(todayKey());
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.stress === "number") {
          setSubmittedStress(parsed.stress);
          setResponse(
            getPersonalizedResponse(
              parsed.stress,
              getConsecutiveHighStress(),
              getStreak(),
            ),
          );
        }
      } catch {}
      setSubmitted(true);
    }
  }, []);

  function handleStressSelect(value: number) {
    setStress(value);
    setMemoryNote(getComparableNote(value));
  }

  function handleSubmit() {
    if (!stress) return;
    const priorHigh = getConsecutiveHighStress();
    const streak    = getStreak();

    localStorage.setItem(todayKey(), JSON.stringify({ stress, note, ts: Date.now() }));
    setSubmittedStress(stress);
    setResponse(getPersonalizedResponse(stress, priorHigh, streak));

    // Find echo pattern if user wrote a note
    if (note.trim()) {
      setEchoPattern(findEchoPattern(note, stress));
    }

    // The "beat" — a pause before the response appears
    setUpdating(true);
    setTimeout(() => {
      setSubmitted(true);
      setUpdating(false);
      onCheckin?.(stress);
    }, 900);
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
      </div>
    );
  }

  return (
    <div className="dash-card checkin">
      {yesterdayCtx.context && (
        <p className="checkin-yesterday-ref">{yesterdayCtx.context}</p>
      )}

      <div className="checkin-question">
        {yesterdayCtx.question}
      </div>

      {!yesterdayCtx.context && dayHint && (
        <p className="checkin-day-hint">{dayHint}</p>
      )}

      <div className="checkin-stress">
        {stressLevels.map((s) => (
          <button
            key={s.value}
            className={`checkin-stress-btn checkin-stress-btn--${s.level}${
              stress === s.value ? " checkin-stress-btn--active" : ""
            }`}
            onClick={() => handleStressSelect(s.value)}
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
          Anything behind it? <span className="checkin-note-optional">(optional)</span>
        </label>
        <textarea
          className="checkin-textarea"
          placeholder="e.g. Big deadline tomorrow, didn't sleep well…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
      </div>

      <button
        className={`checkin-submit${updating ? " checkin-submit--updating" : ""}`}
        disabled={!stress || updating}
        onClick={handleSubmit}
      >
        {updating ? "Noted…" : "Log check-in"}
      </button>
    </div>
  );
}
