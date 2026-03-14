"use client";

import { useEffect, useState } from "react";
import {
  scoreColor,
  scoreLabel,
  detectPatterns,
  stressToScore,
  type HistoryDay,
  type CheckInEntry,
} from "../data";
import HistoryChart from "@/components/dashboard/HistoryChart";

// ── Real data builders ─────────────────────────────────────────────────────────

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

const STRESS_LABELS: Record<number, string> = {
  1: "Very calm", 2: "Relaxed", 3: "Moderate", 4: "Stressed", 5: "Overwhelmed",
};

function buildRealEntries(): CheckInEntry[] {
  const role  = localStorage.getItem("overload-role")  || "engineer";
  const sleep = localStorage.getItem("overload-sleep") || "8";
  const entries: CheckInEntry[] = [];
  const now = new Date();

  for (let i = 0; i < 60; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `checkin-${d.toISOString().split("T")[0]}`;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const stress = parsed.stress ?? 3;
      entries.push({
        date:        d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        stress,
        stressLabel: STRESS_LABELS[stress] ?? "Moderate",
        note:        parsed.note || undefined,
        score:       stressToScore(stress, role, sleep),
      });
    } catch {}
  }
  return entries;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function levelClass(score: number) {
  if (score > 65) return "danger";
  if (score > 40) return "warning";
  return "ok";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [realHistory, setRealHistory] = useState<HistoryDay[]>([]);
  const [entries,     setEntries]     = useState<CheckInEntry[]>([]);

  useEffect(() => {
    setRealHistory(buildRealHistory());
    setEntries(buildRealEntries());
  }, []);

  const realDays       = realHistory.filter((d) => !d.ghost);
  const checkinCount   = realDays.length;
  const isEmpty        = checkinCount === 0;

  // Stats computed from real check-ins only
  const avg            = realDays.length
    ? Math.round(realDays.reduce((s, d) => s + d.score, 0) / realDays.length)
    : 0;
  const highStrainDays = realDays.filter((d) => d.score > 65).length;
  const inZoneDays     = realDays.filter((d) => d.score <= 40).length;
  const peakScore      = realDays.length ? Math.max(...realDays.map((d) => d.score)) : 0;

  const patterns = !isEmpty && realDays.length >= 7 ? detectPatterns(realDays) : [];
  const PATTERN_ICONS = ["📈", "🗓", "⚡"];

  return (
    <div className="dash-content">
      <header className="dash-header">
        <h1 className="dash-greeting">History</h1>
        <p className="dash-subheading">
          {isEmpty
            ? "Your load history will appear here as you check in each day"
            : `Your ${checkinCount} check-in${checkinCount !== 1 ? "s" : ""} — real data, no filler`}
        </p>
      </header>

      {/* Pattern callouts — only shown when there's enough real data */}
      {patterns.length > 0 && (
        <div className="hist-patterns">
          <div className="hist-patterns-label">What the data says</div>
          <div className="pattern-callouts">
            {patterns.map((p, i) => (
              <div key={i} className="pattern-callout">
                <span className="pattern-callout-icon">{PATTERN_ICONS[i] ?? "💡"}</span>
                <span className="pattern-callout-text">{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      {isEmpty ? (
        <div className="hist-empty-stats">
          <div className="hist-empty-stats-icon">📭</div>
          <div className="hist-empty-stats-title">No data yet</div>
          <div className="hist-empty-stats-sub">
            Complete your first daily check-in on the dashboard to start
            building your history. Patterns surface after 7 days.
          </div>
        </div>
      ) : (
        <div className="hist-stats">
          <div className="hist-stat">
            <div className="hist-stat-value" style={{ color: scoreColor(avg) }}>
              {avg}
            </div>
            <div className="hist-stat-label">Avg score</div>
            <div className="hist-stat-sublabel">{scoreLabel(avg)}</div>
          </div>

          <div className="hist-stat">
            <div className="hist-stat-value" style={{ color: "var(--red)" }}>
              {highStrainDays}
            </div>
            <div className="hist-stat-label">High-strain days</div>
            <div className="hist-stat-sublabel">Score above 65</div>
          </div>

          <div className="hist-stat">
            <div className="hist-stat-value" style={{ color: "var(--green)" }}>
              {inZoneDays}
            </div>
            <div className="hist-stat-label">In-zone days</div>
            <div className="hist-stat-sublabel">Score below 40</div>
          </div>

          <div className="hist-stat">
            <div className="hist-stat-value" style={{ color: scoreColor(peakScore) }}>
              {peakScore}
            </div>
            <div className="hist-stat-label">Peak load</div>
            <div className="hist-stat-sublabel">Highest recorded</div>
          </div>
        </div>
      )}

      <HistoryChart
        data={realHistory}
        checkinCount={checkinCount}
        showPatterns={false}
      />

      {/* Check-in log — real entries from localStorage */}
      {entries.length > 0 && (
        <div className="dash-card hist-log">
          <div className="hist-log-header">
            <div>
              <div className="hist-log-title">Your check-ins</div>
              <div className="hist-log-count">{entries.length} {entries.length === 1 ? "entry" : "entries"}</div>
            </div>
          </div>

          <div className="hist-log-list">
            {entries.map((entry, i) => (
              <div key={i} className="hist-log-row">
                <div className="hist-log-date">{entry.date}</div>

                <div
                  className="hist-log-score"
                  style={{ color: scoreColor(entry.score) }}
                >
                  {entry.score}
                </div>

                <div className={`hist-log-badge hist-log-badge--${levelClass(entry.score)}`}>
                  {scoreLabel(entry.score)}
                </div>

                <div className="hist-log-stress">
                  <span className="hist-log-stress-num">{entry.stress}</span>
                  <span className="hist-log-stress-label">{entry.stressLabel}</span>
                </div>

                {entry.note ? (
                  <div className="hist-log-note">{entry.note}</div>
                ) : (
                  <div className="hist-log-no-note">—</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
