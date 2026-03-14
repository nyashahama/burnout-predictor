"use client";

import { useEffect, useRef, useState } from "react";
import { scoreColor, getAccuracyLabel, type Signal } from "@/app/dashboard/data";

type ScoreCardData = {
  score: number;
  statusLabel: string;
  level: "ok" | "warning" | "danger";
  signals: Signal[];
  suggestion: string;
  isPending?: boolean;
};

// ── SVG gauge constants (180×180 viewBox, 270° arc) ──────────────────────────
const CX = 90, CY = 90, R = 76;
const CIRC = 2 * Math.PI * R;   // full circumference
const ARC  = CIRC * 0.75;       // 270° arc length

// ── Animated gauge ────────────────────────────────────────────────────────────
function ScoreGauge({
  score,
  color,
  animate,
}: {
  score: number;
  color: string;
  animate: boolean;
}) {
  const [dashOffset, setDashOffset] = useState(ARC); // start fully empty

  useEffect(() => {
    if (!animate) return;
    // Tiny delay so the initial empty state is painted before the transition fires
    const t = setTimeout(() => {
      setDashOffset(ARC * (1 - score / 100));
    }, 80);
    return () => clearTimeout(t);
  }, [score, animate]);

  return (
    <div className="scorecard-gauge-wrap">
      <svg viewBox="0 0 180 180" className="scorecard-gauge-svg">
        {/* Background track */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke="var(--paper-3)"
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${CIRC}`}
          transform={`rotate(135 ${CX} ${CY})`}
        />
        {/* Filled arc */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${CIRC}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(135 ${CX} ${CY})`}
          style={{
            transition:
              "stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s ease",
          }}
        />
      </svg>

      {/* Number overlay */}
      <div className="scorecard-gauge-center">
        <div className="scorecard-number" style={{ color }}>
          <CountingScore target={score} animate={animate} />
        </div>
        <div className="scorecard-of">/ 100</div>
      </div>
    </div>
  );
}

// ── Counting score animation ──────────────────────────────────────────────────
function CountingScore({
  target,
  animate,
}: {
  target: number;
  animate: boolean;
}) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);
  // Track the value we started from so updates mid-session animate from current
  const fromRef = useRef(0);

  useEffect(() => {
    if (!animate) return;
    const from     = fromRef.current;
    const DURATION = 1400;
    const start    = Date.now();

    cancelAnimationFrame(rafRef.current);

    const tick = () => {
      const progress = Math.min((Date.now() - start) / DURATION, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const value    = Math.round(from + (target - from) * eased);
      setDisplay(value);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    const t = setTimeout(() => {
      rafRef.current = requestAnimationFrame(tick);
    }, 80);

    return () => {
      clearTimeout(t);
      cancelAnimationFrame(rafRef.current);
    };
  }, [target, animate]);

  return <>{display}</>;
}

// ── Main ScoreCard ─────────────────────────────────────────────────────────────
export default function ScoreCard({
  data,
  trend,
  dangerStreak,
  animate,
  streak,
  checkinCount,
  explanation,
  trajectory,
  personalBest,
}: {
  data: ScoreCardData;
  trend: number;
  dangerStreak: number;
  animate: boolean;
  streak?: number;
  checkinCount?: number;
  explanation?: string;
  trajectory?: string;
  personalBest?: string;
}) {
  const color      = scoreColor(data.score);
  const trendUp    = trend > 0;
  const isRecovery = data.level === "ok" && dangerStreak === 0 && trend < -5;

  // Human badge labels — what a person would say, not a clinical category
  const badgeLabel = {
    danger:  "Running hot",
    warning: "Watch this",
    ok:      "In your zone",
  }[data.level];

  return (
    <div className="dash-card scorecard">
      {/* Header */}
      <div className="scorecard-header">
        <div className="scorecard-label">How you&apos;re carrying it</div>
        <div className={`scorecard-badge scorecard-badge--${data.level}`}>
          {data.level === "danger" ? "⚠ " : data.level === "warning" ? "◑ " : "✓ "}
          {badgeLabel}
        </div>
      </div>

      {/* Large centered gauge */}
      <div className="scorecard-gauge-row">
        <ScoreGauge score={data.score} color={color} animate={animate} />

        <div className="scorecard-meta">
          <div
            className="scorecard-trend"
            style={{ color: trendUp ? "var(--red)" : "var(--green)" }}
          >
            {trendUp ? "↑" : "↓"} {Math.abs(trend)} pts this week
          </div>
          {(streak ?? 0) > 0 && (
            <div className="scorecard-streak-count">
              🔥 {streak}-day streak
            </div>
          )}
          {dangerStreak >= 2 && (
            <div className="scorecard-danger-streak">
              {dangerStreak === 2 ? "2nd" : dangerStreak === 3 ? "3rd" : `${dangerStreak}th`}{" "}
              consecutive day in the danger zone
            </div>
          )}
          {isRecovery && (
            <div className="scorecard-recovery">
              Back in the green — the work paid off
            </div>
          )}
          {data.isPending && (
            <div className="scorecard-pending">
              Check in below — this number refines when you do
            </div>
          )}
          {!data.isPending && checkinCount !== undefined && (() => {
            const label = getAccuracyLabel(checkinCount);
            return label ? (
              <div className="scorecard-accuracy">{label}</div>
            ) : null;
          })()}
        </div>
      </div>

      {/* Personal best — only shows on record days */}
      {personalBest && (
        <p className="scorecard-personal-best">{personalBest}</p>
      )}

      {/* Score explanation + trajectory */}
      {explanation && (
        <p className="scorecard-explanation">{explanation}</p>
      )}
      {trajectory && (
        <p className="scorecard-trajectory">{trajectory}</p>
      )}

      {/* Signals */}
      <div className="scorecard-signals">
        {data.signals.map((s, i) => (
          <div key={i} className="scorecard-signal">
            <div className={`signal-dot signal-dot--${s.level}`} />
            <div className="signal-body">
              <div className="signal-label">{s.label}</div>
              <div className="signal-detail">{s.detail}</div>
            </div>
            <div className={`signal-val signal-val--${s.level}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Suggestion */}
      <div className={`scorecard-suggestion scorecard-suggestion--${data.level}`}>
        <div className={`suggestion-label suggestion-label--${data.level}`}>
          {data.isPending ? "Your situation right now" : "One thing to do today"}
        </div>
        <p className="suggestion-text">{data.suggestion}</p>
      </div>
    </div>
  );
}
