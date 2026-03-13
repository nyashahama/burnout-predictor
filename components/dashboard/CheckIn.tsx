"use client";

import { useState, useEffect } from "react";

const stressLevels = [
  { value: 1, label: "Very calm",   level: "ok" },
  { value: 2, label: "Relaxed",     level: "ok" },
  { value: 3, label: "Moderate",    level: "warning" },
  { value: 4, label: "Stressed",    level: "warning" },
  { value: 5, label: "Overwhelmed", level: "danger" },
];

const tips: Record<number, { icon: string; text: string }> = {
  1: { icon: "✅", text: "Your calm state is helping your recovery. Protect tonight's sleep and you'll see your score improve tomorrow." },
  2: { icon: "✅", text: "A relaxed day is valuable. Keep protecting your focus time and make sure you get a full night's sleep." },
  3: { icon: "💡", text: "Moderate stress is manageable. One 10-minute screen break now will help more than you expect." },
  4: { icon: "💡", text: "Step away from your screen for 10 minutes. A brief pause measurably reduces cortisol — and leave your phone at your desk." },
  5: { icon: "🛑", text: "Close 3 browser tabs right now. Take 5 slow breaths. Then work on one thing only — the most important, not the most urgent." },
};

function todayKey() {
  return `checkin-${new Date().toISOString().split("T")[0]}`;
}

export default function CheckIn() {
  const [stress, setStress] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submittedStress, setSubmittedStress] = useState<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(todayKey());
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSubmittedStress(parsed.stress ?? null);
      } catch {}
      setSubmitted(true);
    }
  }, []);

  function handleSubmit() {
    if (!stress) return;
    localStorage.setItem(
      todayKey(),
      JSON.stringify({ stress, note, ts: Date.now() })
    );
    setSubmittedStress(stress);
    setSubmitted(true);
  }

  if (submitted && submittedStress) {
    const level = stressLevels.find((s) => s.value === submittedStress);
    const tip = tips[submittedStress];
    return (
      <div className="dash-card checkin checkin--done checkin--feedback">
        <div className="checkin-feedback-top">
          <div className="checkin-done-icon">✓</div>
          <div>
            <div className="checkin-done-text">Check-in logged</div>
            <div className="checkin-done-sub">
              Stress level {submittedStress} — {level?.label} — factored into your score
            </div>
          </div>
        </div>
        <div className="checkin-tip">
          <span className="checkin-tip-icon">{tip.icon}</span>
          <span className="checkin-tip-text">{tip.text}</span>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="dash-card checkin checkin--done">
        <div className="checkin-done-icon">✓</div>
        <div className="checkin-done-text">Check-in logged for today</div>
      </div>
    );
  }

  return (
    <div className="dash-card checkin">
      <div className="checkin-header">
        <div className="checkin-title">Daily check-in</div>
        <div className="checkin-sub">
          Takes 30 seconds. Improves your score accuracy.
        </div>
      </div>

      <div className="checkin-question">
        How&apos;s your stress level right now?
      </div>

      <div className="checkin-stress">
        {stressLevels.map((s) => (
          <button
            key={s.value}
            className={`checkin-stress-btn checkin-stress-btn--${s.level}${stress === s.value ? " checkin-stress-btn--active" : ""}`}
            onClick={() => setStress(s.value)}
          >
            <span className="checkin-stress-num">{s.value}</span>
            <span className="checkin-stress-label">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="checkin-note-wrap">
        <label className="checkin-note-label">
          Anything on your mind? (optional)
        </label>
        <textarea
          className="checkin-textarea"
          placeholder="e.g. Big presentation tomorrow, didn't sleep well…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
      </div>

      <button
        className="checkin-submit"
        disabled={!stress}
        onClick={handleSubmit}
      >
        Log check-in
      </button>
    </div>
  );
}
