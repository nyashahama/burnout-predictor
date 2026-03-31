"use client";

import { useState } from "react";
import {
  scoreColor,
  scoreLabel,
  detectPatterns,
} from "@/app/dashboard/data";

type HistoryDay = { date: string; score: number; ghost?: boolean };

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

  const realDays = data.filter((d) => !d.ghost);
  const isEmpty  = realDays.length === 0;

  // Only run pattern detection on real (non-ghost) entries
  const patterns = showPatterns && realDays.length >= 7 ? detectPatterns(realDays) : [];

  const PATTERN_ICONS = ["📈", "🗓", "⚡"];

  return (
    <section className="dash-card history" aria-labelledby="history-title">
      <div className="history-header">
        <div id="history-title" className="history-title">30-day history</div>
        <div className="history-sub">
          {isEmpty
            ? "Your history will build as you check in each day"
            : realDays.length < 7
            ? `${realDays.length} of 7 check-ins to unlock your patterns`
            : "Your load over the past month — your data, not a demo"}
        </div>
      </div>

      {/* Pattern callouts — shown when there's enough real data */}
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

      {isEmpty ? (
        <div className="history-empty">
          <div className="history-empty-icon">📊</div>
          <div className="history-empty-title">Your history starts here</div>
          <div className="history-empty-sub">
            Check in daily and this chart fills with your real data.
            Patterns surface after your first week.
          </div>
        </div>
      ) : (
        <div className="history-chart">
          {data.map((d, i) => {
            const isToday  = i === data.length - 1;
            const isGhost  = !!d.ghost;
            const isHovered = tooltip?.index === i && !isGhost;

            return (
              <div
                key={i}
                className="history-col"
                onMouseEnter={() => !isGhost && setTooltip({ index: i, day: d })}
                onMouseLeave={() => setTooltip(null)}
                tabIndex={isGhost ? -1 : 0}
                role={isGhost ? undefined : "img"}
                aria-label={isGhost ? undefined : `${d.date}, score ${d.score}, ${scoreLabel(d.score)}`}
                onFocus={() => !isGhost && setTooltip({ index: i, day: d })}
                onBlur={() => setTooltip(null)}
              >
                {isHovered && (
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
                      isGhost
                        ? " history-bar--ghost"
                        : isToday
                        ? " history-bar--today"
                        : ""
                    }`}
                    style={
                      isGhost
                        ? { height: `${18 + (i % 4) * 8}%` }
                        : ({
                            height: `${d.score}%`,
                            background: scoreColor(d.score),
                            opacity: isToday ? 1 : 0.65,
                            ["--bar-delay" as string]: `${i * 12}ms`,
                          } as React.CSSProperties)
                    }
                  />
                </div>

                <div
                  className={`history-date${
                    i % 7 === 0 || isToday ? "" : " history-date--hidden"
                  }`}
                >
                  {isGhost ? "" : d.date}
                </div>
              </div>
            );
          })}
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
          {data.some(d => d.ghost) && (
            <div className="history-legend-item">
              <span className="history-legend-dot" style={{ background: "var(--paper-3)" }} />
              <span>No check-in</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
