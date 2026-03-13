"use client";

import { useState } from "react";

const stressLevels = [
  { value: 1, label: "Very calm", level: "ok" },
  { value: 2, label: "Relaxed",   level: "ok" },
  { value: 3, label: "Moderate",  level: "warning" },
  { value: 4, label: "Stressed",  level: "warning" },
  { value: 5, label: "Overwhelmed", level: "danger" },
];

export default function CheckIn() {
  const [stress, setStress] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

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
        onClick={() => setSubmitted(true)}
      >
        Log check-in
      </button>
    </div>
  );
}
