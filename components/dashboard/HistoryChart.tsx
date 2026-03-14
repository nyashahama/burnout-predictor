"use client";

import { useState } from "react";
import {
  HistoryDay,
  scoreColor,
  scoreLabel,
  detectPatterns,
} from "@/app/dashboard/data";

const PATTERN_ICONS = ["📈", "🗓", "⚡"];

export default function HistoryChart({
  data,
  checkinCount = 0,
  showPatterns = false,
}: {
  data: HistoryDay[];
  checkinCount?: number;
  showPatterns?: boolean;
}) {
  const [tooltip, setTooltip] = useState<{
    index: number;
    day: HistoryDay;
  } | null>(null);

  const isEmpty  = checkinCount === 0;
  const isEarly  = checkinCount > 0 && checkinCount < 7;
  const patterns = showPatterns && data.length >= 7 ? detectPatterns(data) : [];

  return (
    <div className="dash-card history">
      <div className="history-header">
        <div className="history-title">30-day history</div>
        <div className="history-sub">
          {isEmpty
            ? "Your history will build up as you check in each day"
            : isEarly
            ? `${checkinCount} of 7 check-ins to unlock your first patterns`
            : "Your cognitive load over the past month"}
        </div>
      </div>

      {/* Pattern callouts — shown when there's enough data */}
      {patterns.length > 0 && (
        <div className="pattern-callouts">
          {patterns.map((p, i) => (
            <div key={i} className="pattern-callout">
              <span className="pattern-callout-icon">{PATTERN_ICONS[i] ?? "💡"}</span>
              <span className="pattern-callout-text">{p}</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty ? (
        <div className="history-empty">
          <div className="history-empty-icon">📊</div>
          <div className="history-empty-title">Your history starts here</div>
          <div className="history-empty-sub">
            Check in daily to build your 30-day view. Patterns become visible
            after your first week.
          </div>
        </div>
      ) : isEarly ? (
        <div className="history-early-wrap">
          {/* Ghost bars for days not yet tracked + real bars where we have data */}
          <div className="history-chart">
            {Array.from({ length: 30 }).map((_, i) => {
              const realIndex = data.length - 1 - (29 - i);
              const real = realIndex >= 0 ? data[realIndex] : null;
              return (
                <div key={i} className="history-col">
                  <div className="history-bar-wrap">
                    <div
                      className={`history-bar${real ? "" : " history-bar--ghost"}`}
                      style={
                        real
                          ? {
                              height: `${real.score}%`,
                              background: scoreColor(real.score),
                              ["--bar-delay" as string]: `${i * 12}ms`,
                            } as React.CSSProperties
                          : { height: `${20 + Math.random() * 30}%` }
                      }
                    />
                  </div>
                  <div className="history-date history-date--hidden">—</div>
                </div>
              );
            })}
          </div>
          <div className="history-early-note">
            {checkinCount} {checkinCount === 1 ? "day" : "days"} tracked —
            keep going to reveal your patterns
          </div>
        </div>
      ) : (
        /* Full chart */
        <div className="history-chart">
          {data.map((d, i) => (
            <div
              key={i}
              className="history-col"
              onMouseEnter={() => setTooltip({ index: i, day: d })}
              onMouseLeave={() => setTooltip(null)}
            >
              {tooltip?.index === i && (
                <div className="history-tooltip">
                  <div className="history-tooltip-date">{d.date}</div>
                  <div
                    className="history-tooltip-score"
                    style={{ color: scoreColor(d.score) }}
                  >
                    {d.score}
                  </div>
                  <div className="history-tooltip-label">
                    {scoreLabel(d.score)}
                  </div>
                </div>
              )}
              <div className="history-bar-wrap">
                <div
                  className={`history-bar${
                    i === data.length - 1 ? " history-bar--today" : ""
                  }`}
                  style={
                    {
                      height: `${d.score}%`,
                      background: scoreColor(d.score),
                      opacity: i === data.length - 1 ? 1 : 0.65,
                      ["--bar-delay" as string]: `${i * 12}ms`,
                    } as React.CSSProperties
                  }
                />
              </div>
              <div
                className={`history-date${
                  i % 7 === 0 || i === data.length - 1
                    ? ""
                    : " history-date--hidden"
                }`}
              >
                {d.date}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isEmpty && (
        <div className="history-legend">
          <div className="history-legend-item">
            <span className="history-legend-dot" style={{ background: "var(--green)" }} />
            <span>In zone (&lt;40)</span>
          </div>
          <div className="history-legend-item">
            <span className="history-legend-dot" style={{ background: "var(--amber)" }} />
            <span>Moderate (40–65)</span>
          </div>
          <div className="history-legend-item">
            <span className="history-legend-dot" style={{ background: "var(--red)" }} />
            <span>High strain (&gt;65)</span>
          </div>
        </div>
      )}
    </div>
  );
}
