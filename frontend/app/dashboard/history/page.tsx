"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { CheckIn } from "@/lib/types";
import {
  scoreColor,
  scoreLabel,
  detectPatterns,
  computePersonalSignature,
  buildSignatureNarrative,
  buildLongArcNarrative,
} from "../data";
import HistoryChart from "@/components/dashboard/HistoryChart";

// ── Helpers ────────────────────────────────────────────────────────────────────

function levelClass(score: number) {
  if (score > 65) return "danger";
  if (score > 40) return "warning";
  return "ok";
}

const STRESS_LABELS: Record<number, string> = {
  1: "Very calm", 2: "Relaxed", 3: "Moderate", 4: "Stressed", 5: "Overwhelmed",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { api } = useAuth();
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [signature, setSignature] = useState<ReturnType<typeof computePersonalSignature>>(null);
  const [arcStory, setArcStory] = useState<string | null>(null);

  useEffect(() => {
    if (!api) return;
    api.get<CheckIn[]>("/api/checkins")
      .then(setCheckins)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    setSignature(computePersonalSignature());
    setArcStory(buildLongArcNarrative());
  }, []);

  // Map API checkins (newest first) to chart shape (oldest first for 30-day view)
  const historyDays = checkins
    .slice()
    .reverse()
    .slice(-30)
    .map((c) => ({
      date: new Date(c.checked_in_date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      score: c.score,
    }));

  const scores = checkins.map((c) => c.score);
  const avg = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
  const peak = scores.length ? Math.max(...scores) : 0;
  const highStrain = scores.filter((s) => s > 65).length;
  const inZone = scores.filter((s) => s <= 40).length;

  const checkinCount = checkins.length;
  const isEmpty = checkinCount === 0;

  const realDays = historyDays; // all fetched days are real (no ghost)
  const patterns = !isEmpty && realDays.length >= 7 ? detectPatterns(realDays) : [];
  const PATTERN_ICONS = ["📈", "🗓", "⚡"];

  if (loading) {
    return (
      <div className="dash-content">
        <header className="dash-header">
          <h1 className="dash-greeting">Your history</h1>
        </header>
      </div>
    );
  }

  return (
    <div className="dash-content">
      <header className="dash-header">
        <h1 className="dash-greeting">Your history</h1>
        <p className="dash-subheading">
          {isEmpty
            ? "Check in each day and the data will start to know you"
            : `${checkinCount} check-in${checkinCount !== 1 ? "s" : ""} — this is what the data has learned`}
        </p>
      </header>

      {/* Long arc story — narrates the past 2+ months when enough data exists */}
      {arcStory && (
        <div className="hist-arc-story">
          <p className="hist-arc-text">{arcStory}</p>
        </div>
      )}

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

      {/* Personal signature — shown when ≥14 real check-ins */}
      {signature && (
        <div className="hist-signature">
          <div className="hist-signature-label">Your signature</div>
          <p className="hist-signature-prose">{buildSignatureNarrative(signature)}</p>
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
            <div className="hist-stat-label">Your average</div>
            <div className="hist-stat-sublabel">{scoreLabel(avg)}</div>
          </div>

          <div className="hist-stat">
            <div className="hist-stat-value" style={{ color: "var(--red)" }}>
              {highStrain}
            </div>
            <div className="hist-stat-label">Hard days</div>
            <div className="hist-stat-sublabel">Score above 65</div>
          </div>

          <div className="hist-stat">
            <div className="hist-stat-value" style={{ color: "var(--green)" }}>
              {inZone}
            </div>
            <div className="hist-stat-label">Good days</div>
            <div className="hist-stat-sublabel">Score below 40</div>
          </div>

          <div className="hist-stat">
            <div className="hist-stat-value" style={{ color: scoreColor(peak) }}>
              {peak}
            </div>
            <div className="hist-stat-label">Highest point</div>
            <div className="hist-stat-sublabel">Most load recorded</div>
          </div>
        </div>
      )}

      <HistoryChart
        data={historyDays}
        checkinCount={checkinCount}
        showPatterns={false}
      />

      {/* Check-in log */}
      {checkins.length > 0 && (
        <div className="dash-card hist-log">
          <div className="hist-log-header">
            <div>
              <div className="hist-log-title">Your check-ins</div>
              <div className="hist-log-count">
                {checkins.length} {checkins.length === 1 ? "entry" : "entries"}
              </div>
            </div>
          </div>

          <div className="hist-log-list">
            {checkins.map((c, i) => {
              const dateLabel = new Date(c.checked_in_date + "T00:00:00").toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric" }
              );
              return (
                <div key={i} className="hist-log-row">
                  <div className="hist-log-date">{dateLabel}</div>

                  <div
                    className="hist-log-score"
                    style={{ color: scoreColor(c.score) }}
                  >
                    {c.score}
                  </div>

                  <div className={`hist-log-badge hist-log-badge--${levelClass(c.score)}`}>
                    {scoreLabel(c.score)}
                  </div>

                  <div className="hist-log-stress">
                    <span className="hist-log-stress-num">{c.stress}</span>
                    <span className="hist-log-stress-label">
                      {STRESS_LABELS[c.stress] ?? "Moderate"}
                    </span>
                  </div>

                  {c.note ? (
                    <div className="hist-log-note">{c.note}</div>
                  ) : (
                    <div className="hist-log-no-note">—</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
